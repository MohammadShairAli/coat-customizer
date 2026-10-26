import { readFile } from "node:fs/promises";
import { MeshoptDecoder } from "meshoptimizer";

const file = await readFile(process.argv[2]);
let offset = 12;
let json;
let binary;
while (offset < file.length) {
  const length = file.readUInt32LE(offset);
  const type = file.toString("ascii", offset + 4, offset + 8);
  if (type === "JSON") json = JSON.parse(file.toString("utf8", offset + 8, offset + 8 + length));
  if (type === "BIN\0") binary = file.subarray(offset + 8, offset + 8 + length);
  offset += 8 + length;
}

if (!json) throw new Error("GLB has no JSON chunk");
await MeshoptDecoder.ready;

const component = {
  5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2],
  5125: [Uint32Array, 4], 5126: [Float32Array, 4],
};
const elements = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
async function accessorValues(accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  let bytes;
  let stride = view.byteStride;
  const extension = view.extensions?.EXT_meshopt_compression;
  if (extension) {
    bytes = new Uint8Array(extension.count * extension.byteStride);
    const source = binary.subarray(extension.byteOffset || 0, (extension.byteOffset || 0) + extension.byteLength);
    MeshoptDecoder.decodeGltfBuffer(bytes, extension.count, extension.byteStride, source, extension.mode, extension.filter);
    stride = extension.byteStride;
  } else {
    bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  }
  const [ArrayType, byteSize] = component[accessor.componentType];
  const itemSize = elements[accessor.type];
  stride ||= itemSize * byteSize;
  const values = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readers = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" };
  for (let i = 0; i < accessor.count; i++) {
    const value = [];
    for (let j = 0; j < itemSize; j++) value.push(data[readers[accessor.componentType]]((accessor.byteOffset || 0) + i * stride + j * byteSize, true));
    values.push(value);
  }
  return { accessor, values };
}

function normalizedValue(value, componentType) {
  if (componentType === 5120) return Math.max(value / 127, -1);
  if (componentType === 5121) return value / 255;
  if (componentType === 5122) return Math.max(value / 32767, -1);
  if (componentType === 5123) return value / 65535;
  return value;
}

if (process.argv[3]) {
  const meshIndex = Number(process.argv[3]);
  const primitive = json.meshes[meshIndex].primitives[0];
  for (const [name, accessorIndex] of Object.entries(primitive.attributes)) {
    const { accessor, values } = await accessorValues(accessorIndex);
    console.log("attribute", name, accessor, "sample", values.slice(0, 3));
  }
  const positionData = await accessorValues(primitive.attributes.POSITION);
  const uvData = await accessorValues(primitive.attributes.TEXCOORD_0);
  const indexData = await accessorValues(primitive.indices);
  const positions = positionData.values.map((value) => positionData.accessor.normalized ? value.map((item) => normalizedValue(item, positionData.accessor.componentType)) : value);
  const uvs = uvData.values;
  const indices = indexData.values.flat();
  const parent = new Int32Array(positions.length);
  const seen = new Map();
  for (let vertex = 0; vertex < positions.length; vertex++) {
    const key = [...positions[vertex], ...uvs[vertex]].map((value) => Math.round(value * 1e5)).join();
    const first = seen.get(key) ?? vertex;
    seen.set(key, first);
    parent[vertex] = first;
  }
  const root = (vertex) => {
    while (parent[vertex] !== vertex) vertex = parent[vertex] = parent[parent[vertex]];
    return vertex;
  };
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const first = root(indices[triangle]);
    parent[root(indices[triangle + 1])] = first;
    parent[root(indices[triangle + 2])] = first;
  }
  const islands = new Map();
  for (let vertex = 0; vertex < positions.length; vertex++) {
    const island = islands.get(root(vertex)) ?? { vertices: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], sum: [0, 0, 0] };
    islands.set(root(vertex), island);
    island.vertices++;
    for (let axis = 0; axis < 3; axis++) {
      island.min[axis] = Math.min(island.min[axis], positions[vertex][axis]);
      island.max[axis] = Math.max(island.max[axis], positions[vertex][axis]);
      island.sum[axis] += positions[vertex][axis];
    }
  }
  console.log("islands", [...islands.entries()].map(([root, island]) => ({ root, ...island, mean: island.sum.map((value) => value / island.vertices) })).sort((a, b) => b.vertices - a.vertices).slice(0, 20));
  const collarEntry = [...islands.entries()].filter(([, island]) => island.min[0] < -0.05 && island.max[0] > 0.05 && island.mean !== true).sort((a, b) => b[1].min[1] - a[1].min[1])[0];
  if (collarEntry) {
    const [collarRoot, collar] = collarEntry;
    const bands = Array.from({ length: 16 }, () => ({ leftMin: Infinity, leftMax: -Infinity, rightMin: Infinity, rightMax: -Infinity, zMax: -Infinity, count: 0 }));
    for (let vertex = 0; vertex < positions.length; vertex++) {
      if (root(vertex) !== collarRoot || positions[vertex][2] < 0) continue;
      const [x, y, z] = positions[vertex];
      const band = Math.min(bands.length - 1, Math.max(0, Math.floor(((y - collar.min[1]) / (collar.max[1] - collar.min[1])) * bands.length)));
      const item = bands[band];
      if (x < 0) { item.leftMin = Math.min(item.leftMin, x); item.leftMax = Math.max(item.leftMax, x); }
      else { item.rightMin = Math.min(item.rightMin, x); item.rightMax = Math.max(item.rightMax, x); }
      item.zMax = Math.max(item.zMax, z); item.count++;
    }
    console.log("collar bands", bands.map((band, index) => ({ index, y: collar.min[1] + ((index + 0.5) / bands.length) * (collar.max[1] - collar.min[1]), ...band })));
  }
}
console.log("extensions", json.extensionsUsed);
console.log("materials", json.materials?.map((material, index) => ({ index, name: material.name })));
console.log("meshes", JSON.stringify(json.meshes?.map((mesh, index) => ({
  index,
  name: mesh.name,
  primitives: mesh.primitives.map((primitive) => ({
    material: primitive.material,
    position: primitive.attributes.POSITION,
    bounds: json.accessors[primitive.attributes.POSITION] && {
      min: json.accessors[primitive.attributes.POSITION].min,
      max: json.accessors[primitive.attributes.POSITION].max,
      count: json.accessors[primitive.attributes.POSITION].count,
    },
  })),
})), null, 2));
console.log("nodes", json.nodes?.map((node, index) => ({ index, name: node.name, mesh: node.mesh, children: node.children, translation: node.translation, rotation: node.rotation, scale: node.scale })));
