"use client";

import Image from "next/image";
import { useState, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, useProgress, useTexture, Center } from "@react-three/drei";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";

RectAreaLightUniformsLib.init();

export type CustomizerOption = { src: string; name: string; model?: string; thumb?: string };
type ViewMode = "3d" | "image";
const ITEMS_PER_PAGE = 10;

const CAMERA_TARGET: [number, number, number] = [0, 0.05, 0];
const CAMERA_DISTANCE = 1.3564;
const CAMERA_HEIGHT = -0.1125;
const CAMERA_FOV = 17.46;
const MODEL_OFFSET: [number, number, number] = [0.0052, -0.1319, 0];
const MODEL_YAW = THREE.MathUtils.degToRad(-2.33);
const MODEL_HEIGHT = 0.7556;

type PhotoButton = { x: number; y: number };
const BUILT_IN_PHOTO_BUTTONS: PhotoButton[] = [{ x: 51.38, y: 48.13 }, { x: 48.84, y: 61.16 }];

// --- COAT-4: FRONT CAROUSEL ONLY ---
const COAT_4_FRONT_BUTTONS: PhotoButton[] = [
  { x: 50.4, y: 54.5 },
  { x: 47.2, y: 64.2 },
];
const COAT_4_FRONT_BUTTON_WIDTH = 3.1575; // <-- Change Coat-4 Front Page button size (%) here

// --- COAT-4: CUSTOMIZER STUDIO ONLY ---
const COAT_4_STUDIO_BUTTONS: PhotoButton[] = [
  { x: 50.4, y: 54.5 },
  { x: 47.2, y: 64.2 },
];
const COAT_4_STUDIO_BUTTON_WIDTH = 3.05; // <-- Change Coat-4 Customizer button size (%) here

// --- COAT-5: FRONT CAROUSEL ONLY ---
const COAT_5_FRONT_BUTTONS: PhotoButton[] = [
  { x: 50.3, y: 55.5 },
  { x: 48.4, y: 65.6 },
];
const COAT_5_FRONT_BUTTON_WIDTH = 3.0575; // <-- Change Coat-5 Front Page button size (%) here

// --- COAT-5: CUSTOMIZER STUDIO ONLY ---
const COAT_5_STUDIO_BUTTONS: PhotoButton[] = [
  { x: 50.35, y: 55.55 },
  { x: 48.4, y: 65.6 },
];
const COAT_5_STUDIO_BUTTON_WIDTH = 3.05; // <-- Change Coat-5 Customizer button size (%) here

const PHOTO_BUTTONS: Record<string, PhotoButton[]> = {
  "Coat-1": BUILT_IN_PHOTO_BUTTONS,
  "Coat-2": BUILT_IN_PHOTO_BUTTONS,
  "Coat-3": BUILT_IN_PHOTO_BUTTONS,
  "Coat-4": COAT_4_FRONT_BUTTONS,
  "Coat-5": COAT_5_FRONT_BUTTONS,
};
const DEFAULT_PHOTO_BUTTONS: PhotoButton[] = [{ x: 51.37, y: 48.3 }, { x: 47.6, y: 61.7 }];
const PHOTO_BUTTON_WIDTH = 2.75 / 0.8;

const MODEL_BUTTON_NODES: Record<string, string[]> = {
  "Coat-1": ["button", "button001"],
  "Coat-2": ["button", "button001"],
  "Coat-3": ["button", "button001"],
};

function modelName(url?: string) {
  return url?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
}

function isCoat4Key(key: string) {
  return key === "Coat-4";
}

function isCoat5Key(key: string) {
  return key === "Coat-5";
}

type ClothSettings = {
  clothNodes: string[];
  tieNode?: string;
  columns: number;
  lines: number;
  contrast: number;
  saturation: number;
  tint: [number, number, number];
  normalScale: number;
};

const MODEL_CLOTH: Record<string, ClothSettings> = {
  "Coat-3": {
    clothNodes: ["_gltfNode_18003", "_gltfNode_27002", "_gltfNode_39002", "_gltfNode_42002", "_gltfNode_24002"],
    tieNode: "_gltfNode_36002",
    columns: 124,
    lines: 402,
    contrast: 0.16,
    saturation: 0.6,
    tint: [0.76, 0.74, 0.71],
    normalScale: 0.45,
  },
};

type TiledClothSettings = {
  material: string;
  repeat: number;
  stripes: number;
  stripePhase: number;
  stripeContrast: number;
  mapContrast: number;
  normalScale: number;
  tint: [number, number, number];
};

const MODEL_TILED_CLOTH: Record<string, TiledClothSettings> = {};

type ClothFinish = {
  clothNodes: string[];
  shirtNode?: string;
  shirtNodes?: string[];
  tieNode: string;
  normalScale: number;
  tint: [number, number, number];
  specular: number;
  roughness: number;
  reflection: number;
  sheen: { amount: number; color: [number, number, number]; roughness: number };
  shirt: [number, number, number];
  detailStrength?: number;
  excludeHighlights?: boolean;
};

const MODEL_CLOTH_FINISH: Record<string, ClothFinish> = {
  "Coat-1": {
    clothNodes: ["_gltfNode_18", "_gltfNode_27", "_gltfNode_39", "_gltfNode_42", "_gltfNode_24"],
    shirtNode: "_gltfNode_60",
    tieNode: "_gltfNode_36",
    normalScale: 0.58,
    tint: [0.8, 0.82, 0.88],
    specular: 0.6,
    roughness: 0.65,
    reflection: 0.35,
    sheen: { amount: 0.45, color: [0.42, 0.42, 0.44], roughness: 0.35 },
    shirt: [1.5, 1.52, 1.58],
    detailStrength: 0.72,
    excludeHighlights: true,
  },
  "Coat-2": {
    clothNodes: [
      "_gltfNode_18001",
      "_gltfNode_27001",
      "_gltfNode_39001",
      "_gltfNode_42001",
      "_gltfNode_24001",
      "_gltfNode_54001",
      "_gltfNode_48001",
      "_gltfNode_51001",
    ],
    shirtNodes: ["_gltfNode_21001", "_gltfNode_60001", "_gltfNode_15001"],
    tieNode: "_gltfNode_36001",
    normalScale: 0.78,
    tint: [0.96, 0.98, 0.95],
    specular: 0.25,
    roughness: 0.82,
    reflection: 0.18,
    sheen: { amount: 0.28, color: [0.42, 0.44, 0.4], roughness: 0.5 },
    shirt: [1.12, 1.13, 1.16],
    detailStrength: 0.85,
    excludeHighlights: false,
  },
};

function bakedPart(source: THREE.MeshStandardMaterial, color: [number, number, number], specular: number, normalScale?: number) {
  const mat = new THREE.MeshPhysicalMaterial({
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    roughnessMap: source.roughnessMap,
    roughness: source.roughness,
    side: source.side,
    specularIntensity: specular,
  });
  if (normalScale !== undefined) {
    mat.normalScale.set(Math.sign(mat.normalScale.x) * normalScale, Math.sign(mat.normalScale.y) * normalScale);
  }
  mat.color.setRGB(...color);
  mat.userData.retextured = true;
  return mat;
}

function finishBakedCloth(scene: THREE.Object3D, finish: ClothFinish, anisotropy: number, envMap: THREE.Texture) {
  const shirtNodes = finish.shirtNodes ?? (finish.shirtNode ? [finish.shirtNode] : []);

  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    if (source.userData.studioCloth) source.envMap = envMap;
    if (!source.isMeshStandardMaterial || source.userData.retextured) return;

    if (finish.clothNodes.includes(mesh.name)) {
      const cloth = bakedPart(source, finish.tint, finish.specular, finish.normalScale);
      for (const map of [cloth.map, cloth.normalMap, cloth.roughnessMap]) if (map) map.anisotropy = anisotropy;
      cloth.roughness = finish.roughness;
      cloth.envMap = envMap;
      cloth.envMapIntensity = finish.reflection;
      cloth.userData.studioCloth = true;
      cloth.sheen = finish.sheen.amount;
      cloth.sheenColor.setRGB(...finish.sheen.color);
      cloth.sheenRoughness = finish.sheen.roughness;
      mesh.material = cloth;
    } else if (shirtNodes.includes(mesh.name)) {
      mesh.material = bakedPart(source, finish.shirt, 0.5);
    } else if (mesh.name === finish.tieNode) {
      const tie = bakedPart(source, [0.35, 0.35, 0.36], 0.3);
      tie.roughness = 0.8;
      tie.roughnessMap = null;
      mesh.material = tie;
    }
  });
}

function stripeShader(cloth: TiledClothSettings) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.stripeCount = { value: cloth.stripes };
    shader.uniforms.stripePhase = { value: cloth.stripePhase };
    shader.uniforms.stripeContrast = { value: cloth.stripeContrast };
    shader.uniforms.mapContrast = { value: cloth.mapContrast };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float stripeCount;
        uniform float stripePhase;
        uniform float stripeContrast;
        uniform float mapContrast;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #ifdef USE_MAP
          diffuseColor.rgb = mix( diffuse * textureLod( map, vMapUv, 4.0 ).rgb, diffuseColor.rgb, mapContrast );
        #endif
        {
          float phase = vMapUv.x * stripeCount;
          float fade = 1.0 - smoothstep( 0.5, 0.9, fwidth( phase ) );
          diffuseColor.rgb *= 1.0 + stripeContrast * fade * cos( phase * 6.2831853 + stripePhase );
        }`,
      );
  };
}

function evenClothUVs(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const index = geometry.index;
  if (geometry.userData.evenUVs || !index) return;
  const pos = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const count = pos.count;

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

    const g11 = e1.dot(e1), g12 = e1.dot(e2), g22 = e2.dot(e2);
    a.copy(e1).multiplyScalar(g22).addScaledVector(e2, -g12).divideScalar(n2);
    b.copy(e2).multiplyScalar(g11).addScaledVector(e1, -g12).divideScalar(n2);
    gradU.copy(a).multiplyScalar(du1).addScaledVector(b, du2);
    gradV.copy(a).multiplyScalar(dv1).addScaledVector(b, dv2);
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
  const isCollar = (island: Island) =>
    island !== largest && island.minX < midX - margin && island.maxX > midX + margin && island.y / island.area > shoulders;
  for (const island of islands.values()) {
    island.up.normalize();
    if (island.up.y < 0) island.up.negate();
  }

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
  if (mat.userData.retiled) return;
  for (const map of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.specularIntensityMap, mat.specularColorMap]) {
    if (!map) continue;
    map.repeat.setScalar(cloth.repeat);
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
  }
  mat.normalScale.set(Math.sign(mat.normalScale.x) * cloth.normalScale, Math.sign(mat.normalScale.y) * cloth.normalScale);
  mat.color.setRGB(...cloth.tint);
  if (mat.isMeshPhysicalMaterial) {
    mat.anisotropy = 0;
    mat.anisotropyMap = null;
  }
  mat.onBeforeCompile = stripeShader(cloth);
  mat.customProgramCacheKey = () => "stripe_v2";
  mat.userData.retiled = true;
  mat.needsUpdate = true;
}

function weaveMaterial(source: THREE.MeshStandardMaterial, cloth: ClothSettings, anisotropy: number) {
  const mat = source.clone();
  mat.userData.retextured = true;
  mat.normalScale.setScalar(cloth.normalScale);
  for (const map of [mat.map, mat.normalMap, mat.roughnessMap]) {
    if (map) map.anisotropy = anisotropy;
  }
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
          float hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          float lo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float camel = smoothstep(0.25, 0.52, (hi - lo) / max(hi, 1e-4));

          vec2 uv = vMapUv;
          float column = uv.x * weaveColumns;
          float across = fract(column) / weaveColumns;
          across = mod(floor(column), 2.0) < 1.0 ? across : 1.0 / weaveColumns - across;
          float phase = (uv.y + across) * weaveLines;
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
  mat.customProgramCacheKey = () => "weave_v2";
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

type ClothColor = { name: string; swatch: string; color?: string };

const COAT_4_COLORS: ClothColor[] = [
  { name: "Cream Linen", swatch: "#e8d89c" },
  { name: "Midnight Navy", swatch: "#1e2e4a", color: "#273b5e" },
  { name: "Olive Sage", swatch: "#556347", color: "#687857" },
  { name: "Warm Terracotta", swatch: "#9e4b36", color: "#b55840" },
];

const COAT_5_COLORS: ClothColor[] = [
  { name: "Teal Tartan", swatch: "#148296" },
  { name: "Royal Burgundy", swatch: "#7a1c34", color: "#ad3d59" },
  { name: "Midnight Navy", swatch: "#1c2e4a", color: "#3b5680" },
  { name: "Weige Brown", swatch: "#5e4339", color: "#916e60" },
];

// Classic, refined menswear coat shades tailored to each coat's fabric weave
const MODEL_COLORS: Record<string, ClothColor[]> = {
  "Coat-1": [
    { name: "Charcoal", swatch: "#3b3c40" },
    { name: "Midnight Navy", swatch: "#1e293b", color: "#213047" },
    { name: "Espresso", swatch: "#78412c", color: "#6b483a" },
    { name: "Slate Grey", swatch: "#4b5158", color: "#4e555e" },
  ],
  "Coat-2": [
    { name: "Sage Olive", swatch: "#8b9680" },
    { name: "Deep Navy", swatch: "#141c28", color: "#172335" },
    { name: "Chestnut", swatch: "#593828", color: "#663f2c" },
    { name: "Warm Taupe", swatch: "#6e655c", color: "#756b61" },
  ],
  "Coat-3": [
    { name: "Camel", swatch: "#9a7a52" },
    { name: "Oxford Navy", swatch: "#243147", color: "#273752" },
    { name: "Loden Olive", swatch: "#484d36", color: "#4f543b" },
    { name: "Heather Grey", swatch: "#4a4c50", color: "#525559" },
  ],
  "Coat-4": COAT_4_COLORS,
  "Coat-5": COAT_5_COLORS,
};

const FALLBACK_CLOTH_LUMA: Record<string, number> = { "Coat-1": 0.045, "Coat-2": 0.22, "Coat-3": 0.22 };

const lumaOf = (rgb: readonly number[]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

function clothParts(scene: THREE.Object3D, name: string) {
  const finish = MODEL_CLOTH_FINISH[name];
  const weave = MODEL_CLOTH[name];
  const tiled = MODEL_TILED_CLOTH[name];
  const tint = finish?.tint ?? weave?.tint ?? tiled?.tint;
  if (!tint) return null;
  const nodes = finish?.clothNodes ?? weave?.clothNodes;
  const meshes: THREE.Mesh[] = [];
  const materials = new Set<THREE.MeshStandardMaterial>();
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = mat as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial) continue;
      if (nodes ? nodes.includes(mesh.name) : standard.name === tiled?.material) {
        meshes.push(mesh);
        materials.add(standard);
      }
    }
  });
  return {
    meshes,
    materials,
    tint,
    tiled: Boolean(tiled),
    isWeave: Boolean(weave),
    detailStrength: finish?.detailStrength,
    excludeHighlights: finish?.excludeHighlights ?? true,
  };
}

function mapLuminance(map: THREE.Texture, meshes: THREE.Mesh[]) {
  const image = map.image as (CanvasImageSource & { width: number; height: number }) | null | undefined;
  if (!image || !image.width || !image.height || typeof document === "undefined") return null;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  let pixels: Uint8ClampedArray;
  try {
    context.drawImage(image, 0, 0, size, size);
    pixels = context.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  const linear = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const samples: number[] = [];
  const read = (u: number, v: number) => {
    const row = map.flipY ? 1 - v : v;
    const x = Math.min(size - 1, Math.floor((u - Math.floor(u)) * size));
    const y = Math.min(size - 1, Math.floor((row - Math.floor(row)) * size));
    const i = (y * size + x) * 4;
    samples.push(lumaOf([linear(pixels[i]), linear(pixels[i + 1]), linear(pixels[i + 2])]));
  };
  const uvAttrName = map.channel === 1 ? "uv1" : map.channel === 2 ? "uv2" : map.channel === 3 ? "uv3" : "uv";
  if (meshes.length) {
    for (const mesh of meshes) {
      const uv = mesh.geometry.getAttribute(uvAttrName) ?? mesh.geometry.getAttribute("uv");
      if (!uv) continue;
      const stride = Math.max(1, Math.floor(uv.count / 2000));
      for (let i = 0; i < uv.count; i += stride) read(uv.getX(i), uv.getY(i));
    }
  } else {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) read((x + 0.5) / 24, (y + 0.5) / 24);
  }
  if (samples.length < 8) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = samples.filter((value) => value >= median / 3 && value <= median * 3);
  return kept.length ? kept.reduce((sum, value) => sum + value, 0) / kept.length : null;
}

type Recolor = {
  target: { value: THREE.Color };
  amount: { value: number };
  base: { value: number };
  detailStrength: { value: number };
  excludeHighlights: { value: number };
};
type CompileHook = ((shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void) & { recolor?: boolean };

function hookRecolor(
  mat: THREE.MeshStandardMaterial,
  baseLuma: number,
  detailStrength: number,
  excludeHighlights = true,
): Recolor {
  const safeBase = Math.max(baseLuma, 0.035);
  const state: Recolor = (mat.userData.recolor ??= {
    target: { value: new THREE.Color() },
    amount: { value: 0 },
    base: { value: safeBase },
    detailStrength: { value: detailStrength },
    excludeHighlights: { value: excludeHighlights ? 1 : 0 },
  });
  state.base.value = safeBase;
  state.detailStrength.value = detailStrength;
  state.excludeHighlights.value = excludeHighlights ? 1 : 0;

  const current = mat.onBeforeCompile as CompileHook;
  if (current?.recolor) return state;

  const previous = current;
  const previousKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : "";

  const hook: CompileHook = (shader, renderer) => {
    if (previous) previous.call(mat, shader, renderer);
    shader.uniforms.clothTarget = state.target;
    shader.uniforms.clothAmount = state.amount;
    shader.uniforms.clothBaseLuma = state.base;
    shader.uniforms.clothDetailStrength = state.detailStrength;
    shader.uniforms.clothExcludeHighlights = state.excludeHighlights;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 clothTarget;
        uniform float clothAmount;
        uniform float clothBaseLuma;
        uniform float clothDetailStrength;
        uniform float clothExcludeHighlights;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        if (clothAmount > 0.001) {
          float texLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float ratio = texLuma / clothBaseLuma;
          float detail = clamp(mix(1.0, ratio, clothDetailStrength), 0.35, 1.55);
          float whiteCuffMask = smoothstep(0.62, 0.78, texLuma) * clothExcludeHighlights;
          float clothMask = clothAmount * (1.0 - whiteCuffMask);
          diffuseColor.rgb = mix(diffuseColor.rgb, clothTarget * detail, clothMask);
        }`,
      );
  };

  hook.recolor = true;
  mat.onBeforeCompile = hook;
  mat.customProgramCacheKey = () => `${previousKey}+recolor_v6`;
  mat.needsUpdate = true;
  return state;
}

const SHIRT_SHIFT = new THREE.Color(0.72, 0.74, 0.78);
const TIE_SHIFT = new THREE.Color(0.35, 0.35, 0.35);

function CoatModel({ url, button, color, children }: { url: string; button?: CustomizerOption; color?: string; children?: ReactNode }) {
  const { scene } = useGLTF(url);
  const fitGroup = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();

  const studioEnv = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return texture;
  }, [gl]);
  useEffect(() => () => studioEnv.dispose(), [studioEnv]);

  useLayoutEffect(() => {
    const group = fitGroup.current;
    if (!group) return;
    group.position.set(0, 0, 0);
    group.scale.setScalar(1);
    group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fit = size.y > 0.001 ? MODEL_HEIGHT / size.y : 1;
    group.scale.setScalar(fit);
    group.position.copy(center.multiplyScalar(-fit));
    group.updateMatrixWorld(true);

    const name = modelName(url);
    const tiled = MODEL_TILED_CLOTH[name];
    const clothFinish = MODEL_CLOTH_FINISH[name];
    const cloth = MODEL_CLOTH[name];

    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const standard = mat as THREE.MeshStandardMaterial;
        const isTie = standard.name.toLowerCase().startsWith("fabric pattern");
        if (standard.isMeshStandardMaterial && !isTie && (standard.metalness > 0 || standard.metalnessMap)) {
          standard.metalness = 0;
          standard.metalnessMap = null;
          standard.needsUpdate = true;
        }
        const physical = mat as THREE.MeshPhysicalMaterial;
        if (physical.isMeshPhysicalMaterial && physical.sheen > 0 && !physical.userData.studioCloth) {
          physical.sheen = 0;
          physical.needsUpdate = true;
        }
        const prop = standard.name.toLowerCase().startsWith("white fabric") ? SHIRT_SHIFT : isTie ? TIE_SHIFT : null;
        if (prop && standard.isMeshStandardMaterial && !standard.userData.photoMatched) {
          standard.color.multiply(prop);
          standard.userData.photoMatched = true;
        }
        if (tiled && physical.name === tiled.material) {
          evenClothUVs(mesh);
          retileCloth(physical, tiled, maxAnisotropy);
        }
      }
    });

    if (cloth) retextureCloth(scene, cloth, maxAnisotropy);
    if (clothFinish) finishBakedCloth(scene, clothFinish, maxAnisotropy, studioEnv);
  }, [scene, url, maxAnisotropy, studioEnv]);

  useLayoutEffect(() => {
    const name = modelName(url);
    const parts = clothParts(scene, name);
    if (!parts || !parts.materials.size) return;

    if (scene.userData.clothBaseLuma === undefined) {
      const textured = [...parts.materials].find((mat) => mat.map);
      const measured = textured?.map ? mapLuminance(textured.map, parts.tiled ? [] : parts.meshes) : null;
      scene.userData.clothBaseLuma = (measured ?? FALLBACK_CLOTH_LUMA[name] ?? 0.1) * lumaOf(parts.tint);
    }

    const detailStrength = parts.detailStrength ?? (parts.tiled ? 0.92 : parts.isWeave ? 0.88 : 0.72);

    for (const mat of parts.materials) {
      const state = hookRecolor(
        mat,
        scene.userData.clothBaseLuma,
        detailStrength,
        parts.excludeHighlights,
      );
      state.amount.value = color ? 1 : 0;
      if (color) state.target.value.set(color);
    }
  }, [scene, url, color]);

  const buttonNodes = MODEL_BUTTON_NODES[modelName(url)];
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

type ButtonFinish = { color: string; metalness: number; roughness: number; env: number; specular?: number };

const BUTTON_FINISHES: Record<string, ButtonFinish> = {
  black: { color: "#000000", metalness: 0, roughness: 0.3, env: 0.3, specular: 0.25 },
  gray: { color: "#2b2927", metalness: 0, roughness: 0.6, env: 0.3, specular: 0.5 },
  white: { color: "#ffffff", metalness: 0, roughness: 0.4, env: 0.4 },
  brown: { color: "#4a2c17", metalness: 0, roughness: 0.45, env: 0.35, specular: 0.4 },
  golden: { color: "#d4af37", metalness: 0.85, roughness: 0.25, env: 0.8, specular: 0.9 },
  green: { color: "#1e4620", metalness: 0, roughness: 0.45, env: 0.35, specular: 0.4 },
};

function buttonKeyFromOption(option?: CustomizerOption) {
  return option?.src.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
}

function buttonFinish(option?: CustomizerOption) {
  const key = buttonKeyFromOption(option);
  return BUTTON_FINISHES[key] ?? BUTTON_FINISHES.black;
}

function setupButtonFace(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(0.79, 0.79);
  texture.offset.set(0.105, 0.1);
  texture.anisotropy = 8;
}

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

const BLENDER_AREA_WATTS = 70;

function areaNits(width: number, height: number) {
  return BLENDER_AREA_WATTS / (width * height * Math.PI);
}

type Look = {
  toneMapping: THREE.ToneMapping;
  exposure: number;
  key: number;
  keyX: number;
  keyZ?: number;
  fill: number;
  front?: number;
  back?: number;
};

const DEFAULT_LOOK: Look = { toneMapping: THREE.NeutralToneMapping, exposure: 0.55, key: 5.2, keyX: 0.3, fill: 0.85 };

const MODEL_LOOK: Record<string, Look> = {
  "Coat-2": { toneMapping: THREE.AgXToneMapping, exposure: 0.52, key: 7.2, keyX: -0.9, fill: 0.3 },
  "Coat-1": { toneMapping: THREE.AgXToneMapping, exposure: 0.26, key: 12, keyX: -0.5, keyZ: 0.3, fill: 0.14, front: 0.28 },
};

function modelLook(url?: string) {
  return MODEL_LOOK[modelName(url)] ?? DEFAULT_LOOK;
}

function ToneMapping({ look }: { look: Look }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.toneMapping = look.toneMapping;
    gl.toneMappingExposure = look.exposure;
  }, [gl, look]);
  return null;
}

function StudioKey({ look }: { look: Look }) {
  const overheadLeft = useRef<THREE.RectAreaLight>(null);
  const overheadRight = useRef<THREE.RectAreaLight>(null);
  const front = useRef<THREE.RectAreaLight>(null);
  const back = useRef<THREE.RectAreaLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    overheadLeft.current?.lookAt(0, 0.05, 0);
    overheadRight.current?.lookAt(0, 0.05, 0);
    front.current?.lookAt(0, 0.02, 0);
    back.current?.lookAt(0, 0.02, 0);

    const light = key.current;
    if (!light) return;
    light.target.position.set(0, -0.1, 0);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
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
        position={[look.keyX, 2, look.keyZ ?? 1.4]}
        intensity={look.key}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.0015}
        shadow-radius={4}
      />
      <rectAreaLight ref={overheadLeft} position={[-1.15, 1.55, 0.55]} width={wide} height={wide} intensity={areaNits(wide, wide) * look.fill} color="#ffffff" />
      <rectAreaLight ref={overheadRight} position={[1.25, 1.75, -0.7]} width={wide} height={wide} intensity={areaNits(wide, wide) * look.fill} color="#ffffff" />
      <rectAreaLight ref={front} position={[0.18, 0.22, 1.05]} width={frontWidth} height={frontHeight} intensity={areaNits(frontWidth, frontHeight) * (look.front ?? look.fill) * 1.15} color="#ffffff" />
      <rectAreaLight ref={back} position={[-0.18, 0.4, -1.05]} width={frontWidth} height={frontHeight} intensity={areaNits(frontWidth, frontHeight) * (look.back ?? look.front ?? look.fill)} color="#ffffff" />
    </>
  );
}

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
  const [coatColors, setCoatColors] = useState<Record<string, number>>({});
  const { active: modelIsLoading, progress: modelProgress } = useProgress();

  const coat = coats[selectedCoat];
  const button = buttons[selectedButton];
  // 2D carousel always displays the black button by default
  const defaultPhotoButton = buttons.find((b) => b.src.toLowerCase().includes("black")) ?? buttons[0];
  const coatModel = coat?.model;
  const activeCoatKey = modelName(coatModel ?? coat?.src);
  const modelPreviewIsLoading = Boolean(coatModel && readyModel !== coatModel);
  const previewIsLoading = Boolean(coat && !loadedImages.has(coat.src));
  const colorOptions = MODEL_COLORS[activeCoatKey] ?? [];
  const colorIndex = coat ? Math.min(coatColors[coat.src] ?? 0, Math.max(colorOptions.length - 1, 0)) : 0;
  const coatColor = colorOptions[colorIndex]?.color;

  useEffect(() => {
    if (previewIsLoading) return;
    if (coatModel) useGLTF.preload(coatModel);
    useGLTF.preload("/buttons/buttons.glb");
    if (button) useTexture.preload(button.src);
  }, [previewIsLoading, coatModel, button]);

  function changeView(next: ViewMode) {
    if (next === viewMode) return;
    setViewMode(next);
    setReadyModel(null);
  }

  function markImageLoaded(src: string) {
    setLoadedImages((current) => {
      if (current.has(src)) return current;
      const next = new Set(current);
      next.add(src);
      return next;
    });
  }

  return (
    <main className={`customizer ${viewMode === "3d" ? "mode3d" : "modeImage"}`}>
      {viewMode === "3d" && (
        <aside className="controls" aria-label="Customize your coat">
          <div className="panelHead">
            <p className="eyebrow">Bespoke Studio</p>
            <h2>{coat?.name ?? "No coat"}</h2>
          </div>
          <ColorGroup
            title="01 — Fabric Dye"
            options={colorOptions}
            selected={colorIndex}
            onSelect={(index) => coat && setCoatColors((current) => ({ ...current, [coat.src]: index }))}
          />
          <OptionGroup title="02 — Hardware & Buttons" options={buttons} selected={selectedButton} onSelect={setSelectedButton} type="button" emptyMessage="Add button photos to public/buttons/thumbs" />
        </aside>
      )}

      {viewMode === "image" && (
        <header className="atelierHeader">
          <div className="brandLockup">
            <span className="brandBadge">ATELIER 3D</span>
            <h1>Tailored to Form.</h1>
          </div>
          <p className="description">Select a signature weave below, then step into the 3D studio to customize dye and hardware.</p>
        </header>
      )}

      <section className="product" aria-label="Coat preview">
        {viewMode === "image" && coat && (
          <div className="watermarkText" aria-hidden="true">
            {coat.name.split(" ")[0]}
          </div>
        )}
        <div className="productGlow" />
        <div className="stagePedestal" aria-hidden="true" />

        {viewMode === "3d" && (
          <button type="button" className="backButton" onClick={() => changeView("image")} aria-label="Back to coats">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Collection
          </button>
        )}

        {viewMode === "3d" && coatModel && (
          <button type="button" className="rotateToggle" onClick={() => setAutoRotate((on) => !on)} aria-pressed={autoRotate} aria-label="Auto-rotate model">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
              <path d="M12.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            360° Spin
          </button>
        )}

        {viewMode === "image" ? (
          <CoatCarousel coats={coats} selected={selectedCoat} onSelect={setSelectedCoat} button={defaultPhotoButton} loading={previewIsLoading} onLoad={markImageLoaded} />
        ) : !coatModel && coat ? (
          <div
            className="preview3d"
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              opacity: 1,
              visibility: "visible",
              zIndex: 3,
            }}
          >
            <PhotoStudioView coat={coat} color={coatColor} button={button} />
          </div>
        ) : (
          <div className={`preview3d ${modelPreviewIsLoading ? "isLoading" : ""}`} aria-busy={modelPreviewIsLoading}>
            <PhotoLayers coat={coat} button={defaultPhotoButton} onLoad={markImageLoaded} />
            {modelPreviewIsLoading && (
              <div className="previewLoader" role="status">
                <span className="spinner" />
                <span>{modelIsLoading ? `Loading 3D model ${Math.round(modelProgress)}%` : "Preparing 3D view"}</span>
              </div>
            )}
            <Canvas
              className="modelCanvas"
              dpr={[1, 2]}
              shadows={{ type: THREE.PCFShadowMap }}
              camera={{ position: [CAMERA_TARGET[0], CAMERA_TARGET[1] + CAMERA_HEIGHT, CAMERA_DISTANCE], fov: CAMERA_FOV }}
              style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "auto", background: "transparent" }}
              gl={{
                antialias: true,
                outputColorSpace: THREE.SRGBColorSpace,
                toneMapping: DEFAULT_LOOK.toneMapping,
                toneMappingExposure: 0.55,
                alpha: true,
              }}
            >
              <ToneMapping look={modelLook(coatModel)} />
              <StudioKey look={modelLook(coatModel)} />

              {coatModel && (
                <Suspense fallback={null}>
                  <group position={MODEL_OFFSET} rotation={[0, MODEL_YAW, 0]}>
                    <Center key={coatModel}>
                      <CoatModel url={coatModel} button={button} color={coatColor}>
                        {MODEL_BUTTON_NODES[modelName(coatModel)] || !button ? null : <ButtonModel selectedButtonOption={button} />}
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
                minDistance={CAMERA_DISTANCE * 0.8}
                maxDistance={CAMERA_DISTANCE * 1.7}
              />
            </Canvas>
          </div>
        )}
      </section>

      {viewMode === "image" && coat && (
        <div className="selectBar">
          <div className="selectDock">
            <div className="selectInfo">
              <span className="selectIndex">0{selectedCoat + 1} / 0{coats.length}</span>
              <strong aria-live="polite">{coat.name}</strong>
              {coats.length > 1 && (
                <div className="carouselDots" role="tablist" aria-label="Select coat">
                  {coats.map((item, idx) => (
                    <button
                      key={item.src}
                      type="button"
                      role="tab"
                      aria-selected={idx === selectedCoat}
                      aria-label={`View ${item.name}`}
                      className={`carouselDot ${idx === selectedCoat ? "active" : ""}`}
                      onClick={() => setSelectedCoat(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="cta" onClick={() => changeView("3d")}>
              <span>Customize</span>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const SLOT_SPACING = 68;
const SIDE_SCALE = 0.78;
const SWIPE_DISTANCE = 45;

function CoatCarousel({ coats, selected, onSelect, button, loading, onLoad }: {
  coats: CustomizerOption[]; selected: number; onSelect: Dispatch<SetStateAction<number>>;
  button?: CustomizerOption; loading: boolean; onLoad: (src: string) => void;
}) {
  const count = coats.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const previousSlots = useRef(new Map<string, number>());
  const swipeStart = useRef<number | null>(null);
  const swiped = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 680);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const step = useCallback((direction: number) => {
    if (count > 1) onSelect((current) => (current + direction + count) % count);
  }, [count, onSelect]);

  const half = Math.floor(count / 2);
  const items = coats
    .map((coat, index) => ({
      coat,
      index,
      slot: count === 2 ? (index === selected ? 0 : 1) : ((index - selected + count + half) % count) - half,
    }))
    .filter((item) => Math.abs(item.slot) <= 2);

  const wrapped = (src: string, slot: number) => {
    const before = previousSlots.current.get(src);
    return before !== undefined && Math.abs(slot - before) > 1;
  };
  useEffect(() => {
    previousSlots.current = new Map(items.map((item) => [item.coat.src, item.slot]));
  });

  // Tighter spacing and smaller side scale specifically for mobile view
  const activeSlotSpacing = isMobile ? 40 : SLOT_SPACING;
  const activeSideScale = isMobile ? 0.65 : SIDE_SCALE;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let gesture: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const active = gesture !== undefined;
      clearTimeout(gesture);
      gesture = setTimeout(() => { gesture = undefined; }, 160);
      if (!active && Math.abs(event.deltaX) >= 4) step(event.deltaX > 0 ? 1 : -1);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      clearTimeout(gesture);
    };
  }, [step]);

  return (
    <>
      <div
        ref={rootRef}
        className={`carousel ${loading ? "isLoading" : ""}`}
        role="group"
        aria-roledescription="carousel"
        aria-label="Coat variants"
        aria-busy={loading}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          step(event.key === "ArrowRight" ? 1 : -1);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          swipeStart.current = event.clientX;
          swiped.current = false;
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (start === null || Math.abs(event.clientX - start) < SWIPE_DISTANCE) return;
          swiped.current = true;
          step(event.clientX < start ? 1 : -1);
        }}
        onPointerCancel={() => { swipeStart.current = null; }}
        onDragStart={(event) => event.preventDefault()}
      >
        {loading && <div className="previewLoader" role="status"><span className="spinner" /><span>Preparing garment</span></div>}
        {items.map(({ coat, index, slot }) => {
          const distance = Math.abs(slot);
          const scale = distance === 0 ? 1 : activeSideScale ** distance;
          const classes = ["carouselItem", slot === 0 ? "active" : "side", wrapped(coat.src, slot) ? "wrapped" : ""].join(" ").trim();
          return (
            <div
              key={coat.src}
              className={classes}
              role={distance === 1 ? "button" : undefined}
              aria-label={distance === 1 ? `Choose ${coat.name}` : undefined}
              aria-hidden={distance > 1 ? true : undefined}
              style={{
                transform: `translateX(${slot * activeSlotSpacing}%) scale(${scale})`,
                opacity: distance === 0 ? 1 : distance === 1 ? 0.75 : distance === 2 ? 0.3 : 0,
                zIndex: 3 - distance,
                pointerEvents: distance > 1 ? "none" : undefined,
              }}
              onClick={() => {
                if (swiped.current) { swiped.current = false; return; }
                if (slot !== 0) onSelect(index);
              }}
            >
              <PhotoLayers coat={coat} button={button} onLoad={onLoad} priority={distance <= 1} />
            </div>
          );
        })}
        {!count && <p className="emptyPreview">Add a coat image to<br /><code>public/coats</code></p>}
      </div>

      {count > 1 && (
        <>
          <button type="button" className="carouselArrow prev" onClick={() => step(-1)} aria-label="Previous coat">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="carouselArrow next" onClick={() => step(1)} aria-label="Next coat">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </>
      )}
    </>
  );
}

function FittedCoatStage({
  aspectRatio,
  children,
}: {
  aspectRatio: number;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const update = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch || !aspectRatio) return;

      const containerRatio = cw / ch;
      let width: number;
      let height: number;
      if (containerRatio > aspectRatio) {
        height = ch;
        width = ch * aspectRatio;
      } else {
        width = cw;
        height = cw / aspectRatio;
      }
      setBox({
        left: (cw - width) / 2,
        top: (ch - height) / 2,
        width,
        height,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspectRatio]);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {box && (
        <div
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            pointerEvents: "none",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function PhotoLayers({ coat, button, onLoad, priority = true }: { coat?: CustomizerOption; button?: CustomizerOption; onLoad: (src: string) => void; priority?: boolean }) {
  const [aspectRatio, setAspectRatio] = useState<number>(3 / 4);

  if (!coat) return null;
  const key = modelName(coat.model ?? coat.src);
  const positions = PHOTO_BUTTONS[key] ?? DEFAULT_PHOTO_BUTTONS;
  const isCoat4 = isCoat4Key(key);
  const isCoat5 = isCoat5Key(key);
  const frontButtonWidth = isCoat4 ? COAT_4_FRONT_BUTTON_WIDTH : COAT_5_FRONT_BUTTON_WIDTH;

  return (
    <>
      <Image
        src={coat.src}
        alt={`${coat.name} coat`}
        fill
        priority={priority}
        sizes="(max-width: 800px) 90vw, 50vw"
        className="layer"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setAspectRatio(img.naturalWidth / img.naturalHeight);
          }
          onLoad(coat.src);
        }}
      />
      {button && (isCoat4 || isCoat5 ? (
        <FittedCoatStage aspectRatio={aspectRatio}>
          {positions.map((position, index) => (
            <span
              key={index}
              className="photoButton"
              style={{
                position: "absolute",
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${frontButtonWidth}%`,
                aspectRatio: "1 / 1",
                height: "auto",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            >
              <Image src={button.src} alt={index === 0 ? `${button.name} buttons` : ""} fill sizes="48px" style={{ objectFit: "contain" }} />
            </span>
          ))}
        </FittedCoatStage>
      ) : positions.map((position, index) => (
        <span key={index} className="layer photoButton" style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${PHOTO_BUTTON_WIDTH}%` }}>
          <Image src={button.src} alt={index === 0 ? `${button.name} buttons` : ""} fill sizes="48px" style={{ objectFit: "contain" }} />
        </span>
      )))}
    </>
  );
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

function ColorGroup({ title, options, selected, onSelect }: {
  title: string; options: ClothColor[]; selected: number; onSelect: (index: number) => void;
}) {
  return (
    <fieldset className="optionGroup">
      <legend>{title}</legend>
      {options.length ? (
        <div className="colorGrid">
          {options.map((option, index) => (
            <button type="button" key={option.name} className={`colorOption ${selected === index ? "selected" : ""}`} onClick={() => onSelect(index)} aria-pressed={selected === index} aria-label={`Choose ${option.name}`}>
              <span className="colorChip" style={{ background: option.swatch }} />
              <span>{option.name}</span>
            </button>
          ))}
        </div>
      ) : <p className="emptyOptions">No colour options for this coat</p>}
    </fieldset>
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

// Exterior background mask supporting both dark and light/off-white studio backdrops
function computeExteriorMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const total = width * height;
  const isBg = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;

  let borderLumaSum = 0;
  let borderSamples = 0;
  for (let x = 0; x < width; x += 4) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    borderLumaSum += 0.2126 * data[topIdx] + 0.7152 * data[topIdx + 1] + 0.0722 * data[topIdx + 2];
    borderLumaSum += 0.2126 * data[botIdx] + 0.7152 * data[botIdx + 1] + 0.0722 * data[botIdx + 2];
    borderSamples += 2;
  }
  const isLightBackdrop = borderSamples > 0 && borderLumaSum / borderSamples > 170;

  const isBackdropPixel = (idx: number) => {
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    if (isLightBackdrop) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      return minC > 215 && maxC - minC < 22;
    }
    return r <= 5 && g <= 5 && b <= 5;
  };

  // Protected zones: main coat silhouette + hands/wrists + mannequin stand
  const isProtected = (x: number, y: number) => {
    const nx = x / width;
    const ny = y / height;
    const inTorso = nx > 0.20 && nx < 0.80 && ny > 0.16 && ny < 0.90;
    const inLeftHandAndWrist = nx > 0.14 && nx < 0.35 && ny > 0.76 && ny < 0.98;
    const inRightHandAndWrist = nx > 0.65 && nx < 0.86 && ny > 0.76 && ny < 0.98;
    const inStand = nx > 0.44 && nx < 0.56 && ny > 0.84 && ny <= 1.0;
    return inTorso || inLeftHandAndWrist || inRightHandAndWrist || inStand;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (isProtected(x, y) || !isBackdropPixel(idx)) break;
      isBg[idx] = 1;
    }
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (isProtected(x, y) || !isBackdropPixel(idx)) break;
      isBg[idx] = 1;
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      if (isProtected(x, y) || !isBackdropPixel(idx)) break;
      isBg[idx] = 1;
    }
  }

  for (let i = 0; i < total; i++) {
    if (isBg[i]) stack[top++] = i;
  }

  while (top > 0) {
    const curr = stack[--top];
    const x = curr % width;
    const y = (curr - x) / width;

    if (isProtected(x, y)) continue;

    if (x > 0) {
      const n = curr - 1;
      if (!isBg[n] && !isProtected(x - 1, y) && isBackdropPixel(n)) { isBg[n] = 1; stack[top++] = n; }
    }
    if (x < width - 1) {
      const n = curr + 1;
      if (!isBg[n] && !isProtected(x + 1, y) && isBackdropPixel(n)) { isBg[n] = 1; stack[top++] = n; }
    }
    if (y > 0) {
      const n = curr - width;
      if (!isBg[n] && !isProtected(x, y - 1) && isBackdropPixel(n)) { isBg[n] = 1; stack[top++] = n; }
    }
    if (y < height - 1) {
      const n = curr + width;
      if (!isBg[n] && !isProtected(x, y + 1) && isBackdropPixel(n)) { isBg[n] = 1; stack[top++] = n; }
    }
  }

  return isBg;
}

function PhotoStudioView({ coat, color, button }: { coat: CustomizerOption; color?: string; button?: CustomizerOption }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<ImageData | null>(null);
  const bgMaskRef = useRef<Uint8Array | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(3 / 4);

  const key = modelName(coat.model ?? coat.src);
  const isCoat4 = isCoat4Key(key);
  const isCoat5 = isCoat5Key(key);
  const positions = isCoat4
    ? COAT_4_STUDIO_BUTTONS
    : isCoat5
      ? COAT_5_STUDIO_BUTTONS
      : (PHOTO_BUTTONS[key] ?? DEFAULT_PHOTO_BUTTONS);
  const studioButtonWidth = isCoat4
    ? COAT_4_STUDIO_BUTTON_WIDTH
    : isCoat5
      ? COAT_5_STUDIO_BUTTON_WIDTH
      : PHOTO_BUTTON_WIDTH;

  const renderPixels = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseImageRef.current;
    const bgMask = bgMaskRef.current;
    if (!canvas || !base || !bgMask) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, data: srcData } = base;
    const output = ctx.createImageData(width, height);
    const dst = output.data;

    const targetClothHsl = color ? rgbToHsl(...hexToRgb(color)) : null;

    for (let y = 0; y < height; y++) {
      const ny = y / height;
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const pixelIndex = y * width + x;
        const i = pixelIndex * 4;

        // Exterior backdrop -> transparent
        if (bgMask[pixelIndex]) {
          dst[i] = 0;
          dst[i + 1] = 0;
          dst[i + 2] = 0;
          dst[i + 3] = 0;
          continue;
        }

        const r = srcData[i];
        const g = srcData[i + 1];
        const b = srcData[i + 2];
        const a = srcData[i + 3];

        const [h, s, l] = rgbToHsl(r, g, b);

        if (isCoat4) {
          // Non-fabric regions: full wooden neck block, full wooden hands & wrists (narrow x so coat hem stays untouched), stand pole, and dark inner shirt
          const inUpperNeckWood = nx > 0.425 && nx < 0.575 && ny < 0.205;
          const inLowerNeckWood = nx > 0.432 && nx < 0.568 && ny >= 0.205 && ny < 0.248;
          const inLeftHand = nx > 0.150 && nx < 0.265 && ny > 0.818;
          const inRightHand = nx > 0.735 && nx < 0.850 && ny > 0.818;
          const inStandPole = nx > 0.47 && nx < 0.53 && ny > 0.875;
          const inDarkChestOpening = nx > 0.42 && nx < 0.56 && ny > 0.235 && ny < 0.53 && l < 0.16;

          const isExcluded =
            inUpperNeckWood ||
            inLowerNeckWood ||
            inLeftHand ||
            inRightHand ||
            inStandPole ||
            inDarkChestOpening;

          const isCreamLinen =
            !isExcluded &&
            l > 0.13 &&
            l < 0.95 &&
            s >= 0.015 &&
            s <= 0.82 &&
            h >= 0.042 &&
            h <= 0.26;

          if (targetClothHsl && isCreamLinen) {
            const [tH, tS, tL] = targetClothHsl;
            const lumaRatio = Math.min(1.35, Math.max(0.35, l / 0.68));
            const newL = Math.min(0.94, Math.max(0.06, tL * lumaRatio));
            const newS = Math.min(0.92, Math.max(0.12, tS * (0.85 + (s / 0.45) * 0.15)));
            const [nr, ng, nb] = hslToRgb(tH, newS, newL);
            dst[i] = nr;
            dst[i + 1] = ng;
            dst[i + 2] = nb;
          } else {
            dst[i] = r;
            dst[i + 1] = g;
            dst[i + 2] = b;
          }
          dst[i + 3] = a;
          continue;
        }

        // Coat-5 / Teal Tartan: target only the teal/cyan plaid fabric
        const isCoatFabric = l > 0.025 && s > 0.18 && h >= 0.40 && h <= 0.62;
        if (targetClothHsl && isCoatFabric) {
          const [tH, tS, tL] = targetClothHsl;
          const newS = Math.min(1, tS * (s / 0.72));
          const lightnessScale = tL < 0.35 ? 0.55 + tL : 0.95;
          const newL = Math.min(1, l * lightnessScale);
          const [nr, ng, nb] = hslToRgb(tH, newS, newL);
          dst[i] = nr;
          dst[i + 1] = ng;
          dst[i + 2] = nb;
        } else {
          dst[i] = r;
          dst[i + 1] = g;
          dst[i + 2] = b;
        }
        dst[i + 3] = a;
      }
    }

    ctx.putImageData(output, 0, 0);
  }, [color, isCoat4]);

  useEffect(() => {
    const img = new window.Image();
    img.src = coat.src;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      canvas.width = w;
      canvas.height = h;
      if (w && h) setAspectRatio(w / h);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      baseImageRef.current = imageData;
      bgMaskRef.current = computeExteriorMask(imageData.data, canvas.width, canvas.height);
      renderPixels();
    };
  }, [coat.src, renderPixels]);

  useEffect(() => {
    renderPixels();
  }, [renderPixels]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          zIndex: 4,
          pointerEvents: "none",
        }}
      />
      {button && (
        <FittedCoatStage aspectRatio={aspectRatio}>
          {positions.map((position, index) => (
            <span
              key={index}
              className="photoButton"
              style={{
                position: "absolute",
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${studioButtonWidth}%`,
                aspectRatio: "1 / 1",
                height: "auto",
                transform: "translate(-50%, -50%)",
                opacity: 1,
                visibility: "visible",
                zIndex: 6,
                pointerEvents: "none",
              }}
            >
              <Image src={button.src} alt={index === 0 ? `${button.name} buttons` : ""} fill sizes="48px" style={{ objectFit: "contain" }} />
            </span>
          ))}
        </FittedCoatStage>
      )}
    </div>
  );
}