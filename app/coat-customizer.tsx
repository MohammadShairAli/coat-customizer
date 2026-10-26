"use client";

import Image from "next/image";
import { useState, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, useProgress, Center } from "@react-three/drei";
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
    columns: 72,
    lines: 230,
    contrast: 0.14,
    saturation: 0.6,
    tint: [0.76, 0.74, 0.71],
    normalScale: 0.35,
  },
};

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
    let mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat.userData.buttonFinish) {
      // The atlas paints these buttons brown horn; drop it so the chosen colour is not multiplied into it
      mat = mat.clone();
      mat.userData.buttonFinish = true;
      mat.map = null;
      mat.roughnessMap = null;
      mesh.material = mat;
    }
    mat.color.set(finish.color);
    mat.metalness = finish.metalness;
    mat.roughness = finish.roughness;
    mat.envMapIntensity = finish.env;
    mat.needsUpdate = true;
  });
}

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

    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
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

// buttons.glb is one disc for every style. The photo overlays carry the real engraving;
// the 3D view follows the choice with the matching metal or horn finish.
type ButtonFinish = { color: string; metalness: number; roughness: number; env: number };

const BUTTON_FINISHES: Record<string, ButtonFinish> = {
  "button-1": { color: "#e2c56a", metalness: 0.95, roughness: 0.2, env: 1.35 },
  "button-2": { color: "#c6a15a", metalness: 0.72, roughness: 0.46, env: 0.9 },
  "button-3": { color: "#2a2624", metalness: 0.28, roughness: 0.34, env: 0.55 },
  "button-4": { color: "#f3eee4", metalness: 0.02, roughness: 0.48, env: 0.35 },
};

function buttonFinish(option?: CustomizerOption) {
  const key = option?.src.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
  return BUTTON_FINISHES[key] ?? BUTTON_FINISHES["button-1"];
}

function ButtonModel({ selectedButtonOption }: { selectedButtonOption?: CustomizerOption }) {
  const { scene } = useGLTF("/buttons/buttons.glb");
  const finishKey = selectedButtonOption?.src;

  useLayoutEffect(() => {
    const finish = buttonFinish(selectedButtonOption);
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial) return;

      const name = mat.name.toLowerCase();
      if (name.includes("button")) {
        mat.color.set(finish.color);
        mat.metalness = finish.metalness;
        mat.roughness = finish.roughness;
        mat.envMapIntensity = finish.env;
      } else {
        mat.metalness = 0;
        mat.roughness = 0.7;
      }
      mat.needsUpdate = true;
    });
  }, [scene, finishKey, selectedButtonOption]);

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

function StudioKey() {
  const overheadLeft = useRef<THREE.RectAreaLight>(null);
  const overheadRight = useRef<THREE.RectAreaLight>(null);
  const front = useRef<THREE.RectAreaLight>(null);

  useLayoutEffect(() => {
    overheadLeft.current?.lookAt(0, 0.05, 0);
    overheadRight.current?.lookAt(0, 0.05, 0);
    front.current?.lookAt(0, 0.02, 0);
  }, []);

  const wide = 2.4;
  const frontWidth = 1.4;
  const frontHeight = 1.6;

  return (
    <>
      <rectAreaLight ref={overheadLeft} position={[-1.15, 1.55, 0.55]} width={wide} height={wide} intensity={areaNits(wide, wide)} color="#ffffff" />
      <rectAreaLight ref={overheadRight} position={[1.25, 1.75, -0.7]} width={wide} height={wide} intensity={areaNits(wide, wide)} color="#ffffff" />
      <rectAreaLight ref={front} position={[0.18, 0.22, 1.05]} width={frontWidth} height={frontHeight} intensity={areaNits(frontWidth, frontHeight)} color="#ffffff" />
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
  const previewIsLoading = Boolean(
    (coat && !loadedImages.has(coat.src)) ||
    (button && !loadedImages.has(button.src)),
  );

  // Fetch the selected coat's 3D model in the background only after the image preview has finished loading
  useEffect(() => {
    if (previewIsLoading) return;
    if (coatModel) useGLTF.preload(coatModel);
    useGLTF.preload("/buttons/buttons.glb");
  }, [previewIsLoading, coatModel]);

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
            <PhotoLayers coat={coat} button={button} onLoad={markImageLoaded} />
            {!coat && <p className="emptyPreview">Add a coat image to<br /><code>public/coats</code></p>}
          </div>
        ) : (
        <div className={`preview3d ${modelPreviewIsLoading ? "isLoading" : ""}`} aria-busy={modelPreviewIsLoading}>
          <PhotoLayers coat={coat} button={button} onLoad={markImageLoaded} />
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
                      {MODEL_CLOTH[modelName(coatModel)]?.buttonNodes ? null : <ButtonModel selectedButtonOption={button} />}
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
        <OptionGroup title="02 — Select buttons" options={buttons} selected={selectedButton} onSelect={setSelectedButton} type="button" emptyMessage="Add images to public/buttons" />
        <div className="selectionSummary" aria-live="polite">
          <span>Your selection</span>
          <strong>{coat?.name ?? "No coat"} / {button?.name ?? "No buttons"}</strong>
        </div>
      </aside>
    </main>
  );
}

function PhotoLayers({ coat, button, onLoad }: { coat?: CustomizerOption; button?: CustomizerOption; onLoad: (src: string) => void }) {
  return (
    <>
      {coat && <Image src={coat.src} alt={`${coat.name} coat`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer" onLoad={() => onLoad(coat.src)} />}
      {button && <Image key={button.src} src={button.src} alt={`${button.name} buttons`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer" onLoad={() => onLoad(button.src)} />}
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