"use client";

import Image from "next/image";
import { useState, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Environment } from "@react-three/drei";
import * as THREE from "three";

export type CustomizerOption = { src: string; name: string };
const ITEMS_PER_PAGE = 10;

// Preload both models early
useGLTF.preload("/suit.glb");
useGLTF.preload("/buttons/buttons.glb");

function CoatModel() {
  const { scene } = useGLTF("/suit.glb");

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 1.0;
          mat.metalness = 0.0;
          if (mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
          }
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}

function ButtonModel({ selectedButtonOption }: { selectedButtonOption?: CustomizerOption }) {
  const { scene } = useGLTF("/buttons/buttons.glb");

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.roughness = 0.3;
          mat.metalness = 0.1;
          mat.needsUpdate = true;
        }
      }
    });
  }, [scene]);

  return <primitive object={scene} />;
}

export default function CoatCustomizer({ coats, buttons }: { coats: CustomizerOption[]; buttons: CustomizerOption[] }) {
  const [selectedCoat, setSelectedCoat] = useState(0);
  const [selectedButton, setSelectedButton] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(() => new Set());
  
  const coat = coats[selectedCoat];
  const button = buttons[selectedButton];

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
        
        {/* Preview container: Square shape with transparent background */}
        <div 
          className="preview" 
          style={{ 
            width: "100%", 
            maxWidth: "555px",
            maxHeight: "585px", 
            borderRadius: "0px", 
            overflow: "hidden", 
            position: "relative",
            margin: "-4rem auto 0 auto",
            background: "transparent"
          }}
        >
          <Canvas
            camera={{ position: [0, 0.05, 0.95], fov: 38 }}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "auto", background: "transparent" }}
            gl={{ 
              outputColorSpace: THREE.SRGBColorSpace, 
              toneMapping: THREE.LinearToneMapping, 
              toneMappingExposure: 1.15,
              alpha: true 
            }}
          >
            {/* Ambient fill light */}
            <ambientLight intensity={1.0} />

            {/* Frontal light for general visibility */}
            <directionalLight position={[2, 4, 3]} intensity={0.7} />

            {/* Optimized Top-Down Highlight Light: Positioned slightly forward and higher up to directly hit the shoulders */}
            <directionalLight position={[0, 6, 1.5]} intensity={2.2} />

            <Suspense fallback={null}>
              <group position={[0, -0.13, 0]}>
                <Center>
                  <CoatModel />
                  <ButtonModel selectedButtonOption={button} />
                </Center>
              </group>

              <Environment preset="apartment" environmentIntensity={0.25} />
            </Suspense>

            <OrbitControls 
              target={[0, 0.05, 0]} 
              enableZoom={true} 
              enableRotate={true} 
              enablePan={false}
              minDistance={0.3}
              maxDistance={2.2}
            />
          </Canvas>

          {button && (
            <div style={{ display: "none" }}>
              <Image src={button.src} alt="" width={1} height={1} onLoad={() => markImageLoaded(button.src)} />
            </div>
          )}

          {!coat && <p className="emptyPreview">Ensure <code>suit.glb</code> is placed in<br /><code>public/</code></p>}
        </div>
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
                  <span className={`swatch ${type}`}><Image src={type === "button" ? "/buttons/placeholder.png" : option.src} alt="" fill sizes="96px" /></span>
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