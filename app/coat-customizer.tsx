"use client";

import Image from "next/image";
import { useState, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, useProgress, Center } from "@react-three/drei";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import * as THREE from "three";

RectAreaLightUniformsLib.init();

export type CustomizerOption = { src: string; name: string; model?: string; thumb?: string };
type ViewMode = "3d" | "image";
const ITEMS_PER_PAGE = 10;
const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "3d", label: "3D" },
  { value: "image", label: "Image" },
];

function CoatModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  useLayoutEffect(() => {
    const root = scene as THREE.Object3D & { userData: { basePosition?: THREE.Vector3; baseScale?: THREE.Vector3 } };
    if (!root.userData.basePosition) {
      root.userData.basePosition = root.position.clone();
      root.userData.baseScale = root.scale.clone();
    }
    root.position.copy(root.userData.basePosition);
    root.scale.copy(root.userData.baseScale!);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Camel Twill is exported below the origin and shorter than the other coats, so the camera frames empty space.
    const fit = size.y > 0.001 ? 0.72 / size.y : 1;
    root.scale.multiplyScalar(fit);
    root.position.multiplyScalar(fit).sub(center.multiplyScalar(fit));
    root.updateMatrixWorld(true);

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const physical = mat as THREE.MeshPhysicalMaterial;
        // The cloth ships with a full white sheen, which lifts the sage toward mint.
        if (physical.isMeshPhysicalMaterial && physical.sheen > 0) {
          physical.sheen = 0;
          physical.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}

// buttons.glb is one disc for every style. The photo overlays carry the real engraving;
// the 3D view follows the choice with the matching metal or horn finish.
const BUTTON_FINISHES: Record<string, { color: string; metalness: number; roughness: number; env: number }> = {
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

        {viewMode === "image" ? (
          <div className={`preview ${previewIsLoading ? "isLoading" : ""}`} aria-busy={previewIsLoading}>
            {previewIsLoading && <div className="previewLoader" role="status"><span className="spinner" /><span>Preparing your coat</span></div>}
            {coat && <Image src={coat.src} alt={`${coat.name} coat`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer" onLoad={() => markImageLoaded(coat.src)} />}
            {button && <Image key={button.src} src={button.src} alt={`${button.name} buttons`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer" onLoad={() => markImageLoaded(button.src)} />}
            {!coat && <p className="emptyPreview">Add a coat image to<br /><code>public/coats</code></p>}
          </div>
        ) : (
        /* Preview container: tall transparent box so the model has room to zoom without clipping */
        <div className={`preview3d ${modelPreviewIsLoading ? "isLoading" : ""}`} aria-busy={modelPreviewIsLoading}>
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
            camera={{ position: [0, 0.05, 0.8], fov: 38 }}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "auto", background: "transparent" }}
            gl={{
              antialias: true,
              outputColorSpace: THREE.SRGBColorSpace,
              toneMapping: THREE.NeutralToneMapping,
              toneMappingExposure: 0.55,
              alpha: true,
            }}
          >
            <Exposure value={0.55} />
            <StudioKey />

            {coatModel && (
              <Suspense fallback={null}>
                <group position={[0, -0.13, 0]}>
                  <Center key={coatModel}>
                    <CoatModel url={coatModel} />
                    {coatModel.includes("Coat-3") ? null : <ButtonModel selectedButtonOption={button} />}
                    <ModelReady url={coatModel} onReady={setReadyModel} />
                  </Center>
                </group>
              </Suspense>
            )}

            <OrbitControls
              target={[0, 0.05, 0]}
              enableZoom={true}
              enableRotate={true}
              enablePan={false}
              // Default camera sits at 0.8. Closer than this turns the pinstripe into a corduroy close-up.
              minDistance={0.64}
              maxDistance={1.35}
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