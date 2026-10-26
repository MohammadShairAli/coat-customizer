"use client";

import Image from "next/image";
import { useState, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, useProgress, useTexture, Center } from "@react-three/drei";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import * as THREE from "three";

RectAreaLightUniformsLib.init();

export type CustomizerOption = { src: string; name: string; model?: string; thumb?: string };
type ViewMode = "3d" | "image";
const ITEMS_PER_PAGE = 10;
// Framed so the front view lines up with the product photo in the same box: switching modes should feel like the photo coming alive.
const CAMERA_TARGET: [number, number, number] = [0, 0.05, 0];
const CAMERA_DISTANCE = 0.605;
const CAMERA_FOV = 38;
// The photo's coat sits slightly right of centre; a few millimetres of offset is invisible while rotating.
const MODEL_OFFSET: [number, number, number] = [0.003, -0.12, 0];
const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "3d", label: "3D" },
  { value: "image", label: "Image" },
];

function modelName(url?: string) {
  return url?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
}

// Coat-3 is one baked 4096 atlas shared by cloth, shirt, tie and mannequin. Its herringbone is ~3 texels
// per twill line, so at preview size the mipmaps average it into a pebbly felt. The weave is redrawn
// in the shader at the scale of the photo, and the meshes below are told apart by glTF node name.
type ClothSettings = {
  clothNodes: string[];
  tieNode?: string;
  // Coats with their own buttons modelled in; buttons.glb is not positioned for them
  buttonNodes?: string[];
  columns: number; // herringbone columns per UV unit
  lines: number; // twill lines per UV unit
  contrast: number;
  saturation: number; // 1 keeps the bake's colour, lower moves the camel toward the photo's taupe
  tint: [number, number, number];
  normalScale: number;
};

const MODEL_CLOTH: Record<string, ClothSettings> = {
  "Coat-3": {
    // Jacket body, lapels, the two pocket flaps and the breast pocket welt
    clothNodes: ["_gltfNode_18003", "_gltfNode_27002", "_gltfNode_39002", "_gltfNode_42002", "_gltfNode_24002"],
    tieNode: "_gltfNode_36002",
    buttonNodes: ["button", "button001"],
    columns: 124,
    lines: 402,
    contrast: 0.14,
    saturation: 0.6,
    tint: [0.76, 0.74, 0.71],
    normalScale: 0.35,
  },
};

// Coat-2 tiles a "ribbed_corduroy" set at 2×. Against the photo that is half the stripe count, the deep
// wale normals and full anisotropy streak each rib into corduroy, and the green sits too minty.
// At the photo's count a stripe is ~3px on screen, and the mipmaps average the map's faint stripe to a flat
// wash, so the stripe is redrawn in the shader.
type TiledClothSettings = {
  material: string;
  repeat: number; // tiles per UV unit
  stripes: number; // stripes per tile in the map
  stripePhase: number; // where the map's light stripe peaks, so the drawn one lands on it
  stripeContrast: number;
  normalScale: number;
  tint: [number, number, number]; // linear multiplier on the map, pulls the mint toward the photo's grey sage
};

const MODEL_TILED_CLOTH: Record<string, TiledClothSettings> = {
  "Coat-2": {
    material: "ribbed_corduroy",
    repeat: 4,
    stripes: 114,
    stripePhase: 2.78,
    stripeContrast: 0.11,
    normalScale: 0.45,
    tint: [0.86, 0.82, 0.92],
  },
};

// Coat-1's "Plain Black Velvet" already tiles at the photo's stripe count, but its normal map cuts each
// stripe as a deep groove, so under the overhead key the pinstripe reads as a ribbed corduroy. The photo's
// cloth is flat with the chevrons only showing in the weave, and darker and cooler than the lit map.
type ClothFinish = {
  material: string; // material name prefix
  normalScale: number;
  tint: [number, number, number]; // linear multiplier on the map
};

const MODEL_CLOTH_FINISH: Record<string, ClothFinish> = {
  "Coat-1": {
    material: "plain black velvet",
    normalScale: 0.35,
    tint: [0.62, 0.65, 0.63],
  },
};

function stripeShader(cloth: TiledClothSettings) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.stripeCount = { value: cloth.stripes };
    shader.uniforms.stripePhase = { value: cloth.stripePhase };
    shader.uniforms.stripeContrast = { value: cloth.stripeContrast };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float stripeCount;
        uniform float stripePhase;
        uniform float stripeContrast;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float phase = vMapUv.x * stripeCount;
          // Fade out before a stripe shrinks under two pixels, instead of letting it shimmer
          float fade = 1.0 - smoothstep( 0.5, 0.9, fwidth( phase ) );
          diffuseColor.rgb *= 1.0 + stripeContrast * fade * cos( phase * 6.2831853 + stripePhase );
        }`,
      );
  };
}

// The cloth's UV islands are not laid out alike: the body panels share one scale, but the collar and lapels
// pack ~1.9× more UV per centimetre, the right pocket flap ~2.3× and the left one ~14× (and turned 90°).
// There the stripes fall under a pixel and alias into wide soft bands, so each island is brought to the
// scale of the largest panel and turned so its stripes hang vertically.
// The collar is the one island that wraps the neck, both lapels in it: it keeps the model's own stripe direction
// and is only rescaled, since no single turn suits a piece that wraps around.
function evenClothUVs(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const index = geometry.index;
  if (geometry.userData.evenUVs || !index) return;
  const pos = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const count = pos.count;

  // Vertices split only for normals still belong to one island, so join them by position and uv
  const parent = new Int32Array(count);
  const seen = new Map<string, number>();
  for (let v = 0; v < count; v++) {
    const key = [pos.getX(v), pos.getY(v), pos.getZ(v), uv.getX(v), uv.getY(v)].map((x) => Math.round(x * 1e5)).join();
    const first = seen.get(key) ?? v;
    seen.set(key, first);
    parent[v] = first;
  }
  const root = (v: number) => {
    while (parent[v] !== v) v = parent[v] = parent[parent[v]];
    return v;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = root(index.getX(t));
    parent[root(index.getX(t + 1))] = a;
    parent[root(index.getX(t + 2))] = a;
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const margin = (bounds.max.x - bounds.min.x) * 0.05;
  const shoulders = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.75;

  // Island stats: surface and uv area, and the uv direction the front view sees as up
  type Island = { area: number; uvArea: number; up: THREE.Vector2; y: number; minX: number; maxX: number; u: number; v: number; n: number };
  const islands = new Map<number, Island>();
  for (let v = 0; v < count; v++) {
    const island = islands.get(root(v)) ?? { area: 0, uvArea: 0, up: new THREE.Vector2(), y: 0, minX: Infinity, maxX: -Infinity, u: 0, v: 0, n: 0 };
    islands.set(root(v), island);
    island.u += uv.getX(v);
    island.v += uv.getY(v);
    island.n += 1;
    island.minX = Math.min(island.minX, pos.getX(v));
    island.maxX = Math.max(island.maxX, pos.getX(v));
  }

  const toLocal = mesh.matrixWorld.clone().invert();
  const right = new THREE.Vector3(1, 0, 0).transformDirection(toLocal);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(toLocal);
  const forward = new THREE.Vector3().crossVectors(right, up);
  const [p0, e1, e2, normal, a, b, gradU, gradV, across, dir] = Array.from({ length: 10 }, () => new THREE.Vector3());
  for (let t = 0; t < index.count; t += 3) {
    const [ia, ib, ic] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const island = islands.get(root(ia))!;
    p0.fromBufferAttribute(pos, ia);
    e1.fromBufferAttribute(pos, ib).sub(p0);
    e2.fromBufferAttribute(pos, ic).sub(p0);
    normal.crossVectors(e1, e2);
    const n2 = normal.lengthSq();
    if (!n2) continue;
    const area = Math.sqrt(n2) / 2;
    normal.divideScalar(2 * area);
    const du1 = uv.getX(ib) - uv.getX(ia), dv1 = uv.getY(ib) - uv.getY(ia);
    const du2 = uv.getX(ic) - uv.getX(ia), dv2 = uv.getY(ic) - uv.getY(ia);
    island.area += area;
    island.y += area * p0.y;
    island.uvArea += Math.abs(du1 * dv2 - du2 * dv1) / 2;

    // Surface gradients of u and v over the triangle
    const g11 = e1.dot(e1), g12 = e1.dot(e2), g22 = e2.dot(e2);
    a.copy(e1).multiplyScalar(g22).addScaledVector(e2, -g12).divideScalar(n2);
    b.copy(e2).multiplyScalar(g11).addScaledVector(e1, -g12).divideScalar(n2);
    gradU.copy(a).multiplyScalar(du1).addScaledVector(b, du2);
    gradV.copy(a).multiplyScalar(dv1).addScaledVector(b, dv2);
    // The direction on the surface that the front view sees as up. Flaps are tilted and curved,
    // so plain 3D up would leave their stripes leaning on screen.
    across.crossVectors(up, forward);
    dir.crossVectors(normal, across).normalize();
    if (dir.dot(up) < 0) dir.negate();
    island.up.x += area * gradU.dot(dir);
    island.up.y += area * gradV.dot(dir);
  }

  let largest: Island | undefined;
  for (const island of islands.values()) if (!largest || island.area > largest.area) largest = island;
  if (!largest) return;
  const target = Math.sqrt(largest.uvArea / largest.area);
  // The back panel also crosses the centre line, but sits far below the shoulders
  const isCollar = (island: Island) =>
    island !== largest && island.minX < midX - margin && island.maxX > midX + margin && island.y / island.area > shoulders;
  for (const island of islands.values()) {
    island.up.normalize();
    // Stripes have no head or tail, so turn the shorter way
    if (island.up.y < 0) island.up.negate();
  }

  // The breast welt is cut into hundreds of slivers, packed ~2.2× finer than the body but already hanging
  // vertically. Scaled one by one they would no longer meet, so they are scaled together about one centre.
  const isSliver = (island: Island) => island.area <= largest.area * 0.005;
  const welt = { area: 0, uvArea: 0, u: 0, v: 0, n: 0 };
  const inWelt = new Set<Island>();
  for (const island of islands.values()) {
    if (!isSliver(island)) continue;
    inWelt.add(island);
    welt.area += island.area;
    welt.uvArea += island.uvArea;
    welt.u += island.u;
    welt.v += island.v;
    welt.n += island.n;
  }
  const weltScale = welt.area ? target / Math.sqrt(welt.uvArea / welt.area) : 1;

  const even = new Float32Array(count * 2);
  for (let v = 0; v < count; v++) {
    let u = uv.getX(v), w = uv.getY(v);
    const island = islands.get(root(v))!;
    const density = Math.sqrt(island.uvArea / island.area);
    // Panels within 10% are left exactly as authored
    if (inWelt.has(island)) {
      const cu = welt.u / welt.n, cv = welt.v / welt.n;
      u = cu + (u - cu) * weltScale;
      w = cv + (w - cv) * weltScale;
    } else if (!isSliver(island) && Math.abs(density / target - 1) > 0.1) {
      const cu = island.u / island.n, cv = island.v / island.n;
      const du = u - cu, dw = w - cv;
      const scale = target / density;
      if (isCollar(island)) {
        u = cu + du * scale;
        w = cv + dw * scale;
      } else {
        // Turn the island so the direction its stripes should run lands on v
        const g = island.up;
        u = cu + (du * g.y - dw * g.x) * scale;
        w = cv + (du * g.x + dw * g.y) * scale;
      }
    }
    even[v * 2] = u;
    even[v * 2 + 1] = w;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(even, 2));
  geometry.userData.evenUVs = true;
}

function retileCloth(mat: THREE.MeshPhysicalMaterial, cloth: TiledClothSettings, anisotropy: number) {
  for (const map of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.specularIntensityMap, mat.specularColorMap]) {
    if (!map) continue;
    map.repeat.setScalar(cloth.repeat);
    map.anisotropy = anisotropy;
  }
  // The loader may have flipped y for missing tangents, so keep each sign
  mat.normalScale.set(Math.sign(mat.normalScale.x) * cloth.normalScale, Math.sign(mat.normalScale.y) * cloth.normalScale);
  mat.color.setRGB(...cloth.tint);
  if (mat.isMeshPhysicalMaterial) {
    mat.anisotropy = 0;
    mat.anisotropyMap = null;
  }
  mat.onBeforeCompile = stripeShader(cloth);
  mat.customProgramCacheKey = () => "stripe";
  mat.needsUpdate = true;
}

function weaveMaterial(source: THREE.MeshStandardMaterial, cloth: ClothSettings, anisotropy: number) {
  const mat = source.clone();
  mat.userData.retextured = true;
  mat.normalScale.setScalar(cloth.normalScale);
  if (mat.map) mat.map.anisotropy = anisotropy;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.weaveColumns = { value: cloth.columns };
    shader.uniforms.weaveLines = { value: cloth.lines };
    shader.uniforms.weaveContrast = { value: cloth.contrast };
    shader.uniforms.weaveSaturation = { value: cloth.saturation };
    shader.uniforms.weaveTint = { value: new THREE.Vector3(...cloth.tint) };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float weaveColumns;
        uniform float weaveLines;
        uniform float weaveContrast;
        uniform float weaveSaturation;
        uniform vec3 weaveTint;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          // Shirt cuffs share the lapel mesh, so only saturated (camel) texels take the weave
          float hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          float lo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float camel = smoothstep(0.3, 0.55, (hi - lo) / max(hi, 1e-4));

          vec2 uv = vMapUv;
          float column = uv.x * weaveColumns;
          float across = fract(column) / weaveColumns;
          // Neighbouring columns mirror, so the twill lines meet in chevrons
          across = mod(floor(column), 2.0) < 1.0 ? across : 1.0 / weaveColumns - across;
          float phase = (uv.y + across) * weaveLines;
          // Fade the lines out before they shrink below a pixel, instead of letting them shimmer
          float fade = 1.0 - smoothstep(0.35, 0.7, fwidth(phase));
          float twill = sin(phase * 6.2831853) * fade;
          float seam = smoothstep(0.08, 0.0, min(fract(column), 1.0 - fract(column))) * (1.0 - smoothstep(0.3, 0.6, fwidth(column)));

          float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 taupe = mix(vec3(luma), diffuseColor.rgb, weaveSaturation) * weaveTint;
          vec3 woven = taupe * (1.0 + weaveContrast * twill - 0.08 * seam);
          diffuseColor.rgb = mix(diffuseColor.rgb, woven, camel);
        }`,
      );
  };
  mat.customProgramCacheKey = () => "weave";
  return mat;
}

function retextureCloth(scene: THREE.Object3D, cloth: ClothSettings, anisotropy: number) {
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    if (!source.isMeshStandardMaterial || source.userData.retextured) return;

    if (cloth.clothNodes.includes(mesh.name)) {
      mesh.material = weaveMaterial(source, cloth, anisotropy);
    } else if (mesh.name === cloth.tieNode) {
      // The photo's tie is black silk; the bake has it grey. Keep the bake for its fold shading.
      const tie = source.clone();
      tie.userData.retextured = true;
      tie.color.set("#0b0b0c");
      tie.roughness = 0.8;
      tie.roughnessMap = null;
      mesh.material = tie;
    }
  });
}

function finishBuiltInButtons(scene: THREE.Object3D, nodes: string[], finish: ButtonFinish) {
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !nodes.includes(mesh.name)) return;
    let mat = mesh.material as THREE.MeshPhysicalMaterial;
    if (!mat.userData.buttonFinish) {
      // The atlas paints these buttons brown horn; keep only its normals so the chosen colour is not multiplied into it.
      // Physical, so the dark finishes can turn down the specular that the cool fills wash into grey.
      const source = mesh.material as THREE.MeshStandardMaterial;
      mat = new THREE.MeshPhysicalMaterial({ normalMap: source.normalMap, normalScale: source.normalScale.clone(), side: source.side });
      mat.userData.buttonFinish = true;
      mesh.material = mat;
    }
    mat.color.set(finish.color);
    mat.metalness = finish.metalness;
    mat.roughness = finish.roughness;
    mat.envMapIntensity = finish.env;
    mat.specularIntensity = finish.specular ?? 1;
    mat.needsUpdate = true;
  });
}

const SHIRT_SHIFT = new THREE.Color(0.72, 0.74, 0.78);
const TIE_SHIFT = new THREE.Color(0.35, 0.35, 0.35);

function CoatModel({ url, button, children }: { url: string; button?: CustomizerOption; children?: ReactNode }) {
  const { scene } = useGLTF(url);
  const fitGroup = useRef<THREE.Group>(null);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

  useLayoutEffect(() => {
    const group = fitGroup.current;
    if (!group) return;
    group.position.set(0, 0, 0);
    group.scale.setScalar(1);
    group.updateMatrixWorld(true);

    // Fit is measured on the coat only, then applied to the group so the buttons move with it.
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Camel Twill is exported below the origin and shorter than the other coats, so the camera frames empty space.
    const fit = size.y > 0.001 ? 0.72 / size.y : 1;
    group.scale.setScalar(fit);
    group.position.copy(center.multiplyScalar(-fit));
    group.updateMatrixWorld(true);

    const tiled = MODEL_TILED_CLOTH[modelName(url)];
    const clothFinish = MODEL_CLOTH_FINISH[modelName(url)];
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const standard = mat as THREE.MeshStandardMaterial;
        // Coat-1/2 export cloth and mannequin with metalness up to 1 (the packed MTL map's blue channel).
        // With no environment to reflect, metal renders near black, so the charcoal suit came out as ink.
        // The tie ("Fabric Pattern") is the exception: as metal it reads black like the photo, as cloth it turns grey.
        const isTie = standard.name.toLowerCase().startsWith("fabric pattern");
        if (standard.isMeshStandardMaterial && !isTie && (standard.metalness > 0 || standard.metalnessMap)) {
          standard.metalness = 0;
          standard.metalnessMap = null;
          standard.needsUpdate = true;
        }
        const physical = mat as THREE.MeshPhysicalMaterial;
        // The cloth ships with a full white sheen, which lifts the sage toward mint.
        if (physical.isMeshPhysicalMaterial && physical.sheen > 0) {
          physical.sheen = 0;
          physical.needsUpdate = true;
        }
        // Bring the props to the photo, so switching views does not shift them: the bake's shirt is a warm
        // cream against the photo's neutral white, and the metal tie catches the fills as a grey sheen.
        // The scene is cached across mounts, so the shift is applied once.
        const prop = standard.name.toLowerCase().startsWith("white fabric") ? SHIRT_SHIFT : isTie ? TIE_SHIFT : null;
        if (prop && standard.isMeshStandardMaterial && !standard.userData.photoMatched) {
          standard.color.multiply(prop);
          standard.userData.photoMatched = true;
        }
        // Set rather than multiplied, so the cached scene does not darken on every mount
        if (clothFinish && standard.isMeshStandardMaterial && standard.name.toLowerCase().startsWith(clothFinish.material)) {
          standard.normalScale.set(Math.sign(standard.normalScale.x) * clothFinish.normalScale, Math.sign(standard.normalScale.y) * clothFinish.normalScale);
          standard.color.setRGB(...clothFinish.tint);
        }
        if (tiled && physical.name === tiled.material) {
          evenClothUVs(mesh);
          retileCloth(physical, tiled, maxAnisotropy);
        }
      }
    });

    const cloth = MODEL_CLOTH[modelName(url)];
    if (cloth) retextureCloth(scene, cloth, maxAnisotropy);
  }, [scene, url, maxAnisotropy]);

  const buttonNodes = MODEL_CLOTH[modelName(url)]?.buttonNodes;
  const finish = buttonFinish(button);
  useLayoutEffect(() => {
    if (buttonNodes) finishBuiltInButtons(scene, buttonNodes, finish);
  }, [scene, buttonNodes, finish]);

  return (
    <group ref={fitGroup}>
      <primitive object={scene} />
      {children}
    </group>
  );
}

// buttons.glb is one disc for every style, so its face wears the chosen button's cover photo.
// Coats with built-in buttons have no face UVs to take the photo, so they get the matching plastic colour.
type ButtonFinish = { color: string; metalness: number; roughness: number; env: number; specular?: number };

const BUTTON_FINISHES: Record<string, ButtonFinish> = {
  black: { color: "#000000", metalness: 0, roughness: 0.3, env: 0.3, specular: 0.25 },
  gray: { color: "#2b2927", metalness: 0, roughness: 0.6, env: 0.3, specular: 0.5 },
  white: { color: "#ffffff", metalness: 0, roughness: 0.4, env: 0.4 },
  yellow: { color: "#e6ac00", metalness: 0, roughness: 0.5, env: 0.4 },
};

function buttonFinish(option?: CustomizerOption) {
  const key = option?.src.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
  return BUTTON_FINISHES[key] ?? BUTTON_FINISHES.black;
}

function setupButtonFace(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  // The button spans 10%–90% of every PNG; crop a hair inside so the transparent margin never reaches the disc rim.
  texture.repeat.set(0.79, 0.79);
  texture.offset.set(0.105, 0.1);
  texture.anisotropy = 8;
}

// buttons.glb ships quantized UVs that do not frame the face, so project the disc face (XY) straight on.
function planarFaceUVs(geometry: THREE.BufferGeometry) {
  if (geometry.userData.faceUVs) return;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - min.x) / (max.x - min.x);
    uv[i * 2 + 1] = (pos.getY(i) - min.y) / (max.y - min.y);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.userData.faceUVs = true;
}

function ButtonModel({ selectedButtonOption }: { selectedButtonOption: CustomizerOption }) {
  const { scene } = useGLTF("/buttons/buttons.glb");
  const face = useTexture(selectedButtonOption.src, setupButtonFace);

  useLayoutEffect(() => {
    const finish = buttonFinish(selectedButtonOption);
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial) return;

      const name = mat.name.toLowerCase();
      if (name.includes("button")) {
        planarFaceUVs(mesh.geometry);
        mat.map = face;
        // The photo already carries the colour, so the tint stays white
        mat.color.set("#ffffff");
        mat.metalness = finish.metalness;
        mat.roughness = finish.roughness;
        mat.envMapIntensity = finish.env;
      } else {
        mat.metalness = 0;
        mat.roughness = 0.7;
      }
      mat.needsUpdate = true;
    });
  }, [scene, face, selectedButtonOption]);

  return <primitive object={scene} />;
}

// Blender: three area lights, power 70W, nothing else. Three.js area lights are in nits,
// and Blender power is watts, so intensity = watts / (area × π).
const BLENDER_AREA_WATTS = 70;

function areaNits(width: number, height: number) {
  return BLENDER_AREA_WATTS / (width * height * Math.PI);
}

// The Blender scene was lit for the light cloths at 0.55. Charcoal's albedo is near black (~#1e1e22),
// so at the same exposure it reads as ink instead of the grey in the photo.
const MODEL_EXPOSURE: Record<string, number> = { "Coat-1": 1.15 };

function modelExposure(url?: string) {
  return MODEL_EXPOSURE[modelName(url)] ?? 0.55;
}

function Exposure({ value }: { value: number }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

// Area lights cast no shadows in three.js, so on their own the coat reads flat. The photo is lit from
// above: the collar, lapels and the mannequin cap throw soft shadows down, and the cloth falls off toward
// the hem and sides. A soft overhead key carries that; the area lights stay on as wrap and fill.
const KEY_INTENSITY = 5.2;
const FILL_SCALE = 0.85;

function StudioKey() {
  const overheadLeft = useRef<THREE.RectAreaLight>(null);
  const overheadRight = useRef<THREE.RectAreaLight>(null);
  const front = useRef<THREE.RectAreaLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    overheadLeft.current?.lookAt(0, 0.05, 0);
    overheadRight.current?.lookAt(0, 0.05, 0);
    front.current?.lookAt(0, 0.02, 0);

    const light = key.current;
    if (!light) return;
    light.target.position.set(0, -0.1, 0);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
    // Just wide enough for the coat, so the 2048 map spends its texels on the cloth
    camera.left = -0.5;
    camera.right = 0.5;
    camera.top = 0.6;
    camera.bottom = -0.6;
    camera.near = 0.5;
    camera.far = 4;
    camera.updateProjectionMatrix();
  }, []);

  const wide = 2.4;
  const frontWidth = 1.4;
  const frontHeight = 1.6;

  return (
    <>
      <directionalLight
        ref={key}
        position={[0.3, 2, 1.4]}
        intensity={KEY_INTENSITY}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        // The weave's normal map would otherwise speckle the cloth with acne
        shadow-normalBias={0.0015}
        shadow-radius={4}
      />
      <rectAreaLight ref={overheadLeft} position={[-1.15, 1.55, 0.55]} width={wide} height={wide} intensity={areaNits(wide, wide) * FILL_SCALE} color="#ffffff" />
      <rectAreaLight ref={overheadRight} position={[1.25, 1.75, -0.7]} width={wide} height={wide} intensity={areaNits(wide, wide) * FILL_SCALE} color="#ffffff" />
      <rectAreaLight ref={front} position={[0.18, 0.22, 1.05]} width={frontWidth} height={frontHeight} intensity={areaNits(frontWidth, frontHeight) * FILL_SCALE * 1.15} color="#ffffff" />
    </>
  );
}

// Reports once the model has actually been drawn, so the loader also covers GPU upload and shader compilation
function ModelReady({ url, onReady }: { url: string; onReady: (url: string) => void }) {
  const frames = useRef(0);

  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onReady(url);
  });

  return null;
}

export default function CoatCustomizer({ coats, buttons }: { coats: CustomizerOption[]; buttons: CustomizerOption[] }) {
  const [selectedCoat, setSelectedCoat] = useState(0);
  const [selectedButton, setSelectedButton] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("image");
  const [autoRotate, setAutoRotate] = useState(true);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(() => new Set());
  const [readyModel, setReadyModel] = useState<string | null>(null);
  const { active: modelIsLoading, progress: modelProgress } = useProgress();

  const coat = coats[selectedCoat];
  const button = buttons[selectedButton];
  const coatModel = coat?.model;
  const modelPreviewIsLoading = Boolean(coatModel && readyModel !== coatModel);
  const previewIsLoading = Boolean(coat && !loadedImages.has(coat.src));

  // Fetch the selected coat's 3D model in the background only after the image preview has finished loading
  useEffect(() => {
    if (previewIsLoading) return;
    if (coatModel) useGLTF.preload(coatModel);
    useGLTF.preload("/buttons/buttons.glb");
    if (button) useTexture.preload(button.src);
  }, [previewIsLoading, coatModel, button]);

  function markImageLoaded(src: string) {
    setLoadedImages((current) => {
      if (current.has(src)) return current;
      const next = new Set(current);
      next.add(src);
      return next;
    });
  }

  return (
    <main className="customizer">
      <section className="intro">
        <p className="eyebrow">The Atelier</p>
        <h1>Build your coat.</h1>
        <p className="description">Select a cloth and finish it with your preferred buttons.</p>
      </section>

      <section className="product" aria-label="Coat preview">
        <div className="productGlow" />

        <div className="viewToggle" role="group" aria-label="Preview mode">
          {VIEW_MODES.map((mode) => (
            <button
              type="button"
              key={mode.value}
              className={viewMode === mode.value ? "active" : ""}
              onClick={() => {
                if (mode.value === viewMode) return;
                setViewMode(mode.value);
                // The canvas remounts when entering 3D, so the model must be drawn again before the loader hides
                setReadyModel(null);
              }}
              aria-pressed={viewMode === mode.value}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {viewMode === "3d" && coatModel && (
          <button type="button" className="rotateToggle" onClick={() => setAutoRotate((on) => !on)} aria-pressed={autoRotate} aria-label="Auto-rotate model">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
              <path d="M12.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Rotate
          </button>
        )}

        {viewMode === "image" ? (
          <div className={`preview ${previewIsLoading ? "isLoading" : ""}`} aria-busy={previewIsLoading}>
            {previewIsLoading && <div className="previewLoader" role="status"><span className="spinner" /><span>Preparing your coat</span></div>}
            <PhotoLayers coat={coat} onLoad={markImageLoaded} />
            {!coat && <p className="emptyPreview">Add a coat image to<br /><code>public/coats</code></p>}
          </div>
        ) : (
        <div className={`preview3d ${modelPreviewIsLoading ? "isLoading" : ""}`} aria-busy={modelPreviewIsLoading}>
          <PhotoLayers coat={coat} onLoad={markImageLoaded} />
          {modelPreviewIsLoading && (
            <div className="previewLoader" role="status">
              <span className="spinner" />
              <span>{modelIsLoading ? `Loading 3D model ${Math.round(modelProgress)}%` : "Preparing 3D view"}</span>
            </div>
          )}
          {!coatModel && <p className="emptyPreview">Add a <code>.glb</code> with the same name as<br />the coat image to <code>public/coats</code></p>}
          <Canvas
            className="modelCanvas"
            dpr={[1, 2]}
            shadows={{ type: THREE.PCFShadowMap }}
            camera={{ position: [CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_DISTANCE], fov: CAMERA_FOV }}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "auto", background: "transparent" }}
            gl={{
              antialias: true,
              outputColorSpace: THREE.SRGBColorSpace,
              toneMapping: THREE.NeutralToneMapping,
              toneMappingExposure: 0.55,
              alpha: true,
            }}
          >
            <Exposure value={modelExposure(coatModel)} />
            <StudioKey />

            {coatModel && (
              <Suspense fallback={null}>
                <group position={MODEL_OFFSET}>
                  <Center key={coatModel}>
                    <CoatModel url={coatModel} button={button}>
                      {MODEL_CLOTH[modelName(coatModel)]?.buttonNodes || !button ? null : <ButtonModel selectedButtonOption={button} />}
                    </CoatModel>
                    <ModelReady url={coatModel} onReady={setReadyModel} />
                  </Center>
                </group>
              </Suspense>
            )}

            <OrbitControls
              target={CAMERA_TARGET}
              enableZoom={true}
              enableRotate={true}
              enablePan={false}
              autoRotate={autoRotate}
              autoRotateSpeed={1.2}
              // Much closer than the photo framing turns the pinstripe into a corduroy close-up.
              minDistance={CAMERA_DISTANCE * 0.8}
              maxDistance={CAMERA_DISTANCE * 1.7}
            />
          </Canvas>
        </div>
        )}
      </section>

      <aside className="controls" aria-label="Customize your coat">
        <OptionGroup title="01 — Select coat variant" options={coats} selected={selectedCoat} onSelect={setSelectedCoat} type="coat" emptyMessage="Add coat options" />
        <OptionGroup title="02 — Select buttons" options={buttons} selected={selectedButton} onSelect={setSelectedButton} type="button" emptyMessage="Add button photos to public/buttons/thumbs" />
        <div className="selectionSummary" aria-live="polite">
          <span>Your selection</span>
          <strong>{coat?.name ?? "No coat"} / {button?.name ?? "No buttons"}</strong>
        </div>
      </aside>
    </main>
  );
}

function PhotoLayers({ coat, onLoad }: { coat?: CustomizerOption; onLoad: (src: string) => void }) {
  return coat ? <Image src={coat.src} alt={`${coat.name} coat`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer" onLoad={() => onLoad(coat.src)} /> : null;
}

function OptionGroup({ title, options, selected, onSelect, type, emptyMessage }: {
  title: string; options: CustomizerOption[]; selected: number; onSelect: (index: number) => void;
  type: "coat" | "button"; emptyMessage: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(options.length / ITEMS_PER_PAGE);
  const pageStart = page * ITEMS_PER_PAGE;
  const pageOptions = options.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  return (
    <fieldset className="optionGroup">
      <legend>{title}</legend>
      {options.length ? (
        <>
          <div key={page} className={`optionGrid ${pageOptions.length > 4 ? "scrollable" : ""}`}>
            {pageOptions.map((option, index) => {
              const optionIndex = pageStart + index;
              return (
                <button type="button" key={option.src} className={`option ${selected === optionIndex ? "selected" : ""}`} onClick={() => onSelect(optionIndex)} aria-pressed={selected === optionIndex} aria-label={`Choose ${option.name}`}>
                  <span className={`swatch ${type}`}><Image src={option.thumb ?? option.src} alt="" fill sizes={type === "button" ? "240px" : "96px"} /></span>
                  <span>{option.name}</span>
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <nav className="pagination" aria-label={`${title} pages`}>
              <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 0}>Previous</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page === totalPages - 1}>Next</button>
            </nav>
          )}
        </>
      ) : <p className="emptyOptions">{emptyMessage}</p>}
    </fieldset>
  );
}
