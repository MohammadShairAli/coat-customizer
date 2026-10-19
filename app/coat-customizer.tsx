"use client";

import Image from "next/image";
import { useState } from "react";

export type CustomizerOption = { src: string; name: string };

export default function CoatCustomizer({ coats, buttons }: { coats: CustomizerOption[]; buttons: CustomizerOption[] }) {
  const [selectedCoat, setSelectedCoat] = useState(0);
  const [selectedButton, setSelectedButton] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(() => new Set());
  const coat = coats[selectedCoat];
  const button = buttons[selectedButton];
  const previewIsLoading = Boolean(
    (coat && !loadedImages.has(coat.src)) ||
    (button && !loadedImages.has(button.src)),
  );

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
        <div className={`preview ${previewIsLoading ? "isLoading" : ""}`} aria-busy={previewIsLoading}>
          {previewIsLoading && <div className="previewLoader" role="status"><span className="spinner" /><span>Preparing your coat</span></div>}
          {coat && <Image src={coat.src} alt={`${coat.name} coat`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer" onLoad={() => markImageLoaded(coat.src)} />}
          {button && <>
            <Image src={button.src} alt={`${button.name} buttons`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer buttonUpper" onLoad={() => markImageLoaded(button.src)} />
            <Image src={button.src} alt="" fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer buttonLower" />
          </>}
          {!coat && <p className="emptyPreview">Add a coat image to<br /><code>public/coats</code></p>}
        </div>
      </section>

      <aside className="controls" aria-label="Customize your coat">
        <OptionGroup title="01 — Select coat" options={coats} selected={selectedCoat} onSelect={setSelectedCoat} type="coat" emptyMessage="Add images to public/coats" />
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
  return (
    <fieldset className="optionGroup">
      <legend>{title}</legend>
      {options.length ? (
        <div className="optionGrid">
          {options.map((option, index) => (
            <button type="button" key={option.src} className={`option ${selected === index ? "selected" : ""}`} onClick={() => onSelect(index)} aria-pressed={selected === index} aria-label={`Choose ${option.name}`}>
              <span className={`swatch ${type}`}><Image src={option.src} alt="" fill sizes="96px" /></span>
              <span>{option.name}</span>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : <p className="emptyOptions">{emptyMessage}</p>}
    </fieldset>
  );
}
