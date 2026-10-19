"use client";

import Image from "next/image";
import { useState } from "react";

const coats = [
  { src: "/Coat1.png", name: "Blue Check" },
  { src: "/Coat2.png", name: "Ivory Linen" },
];

const buttons = [
  { src: "/Button1.png", name: "Gold" },
  { src: "/Button2.png", name: "Silver Crest" },
];

export default function Home() {
  const [selectedCoat, setSelectedCoat] = useState(0);
  const [selectedButton, setSelectedButton] = useState(0);

  return ( 
    <main className="customizer">
      <section className="intro">
        <p className="eyebrow">The Atelier</p>
        <h1>Build your coat.</h1>
        <p className="description">Select a cloth and finish it with your preferred buttons.</p>
      </section>

      <section className="product" aria-label="Coat preview">
        <div className="productGlow" />
        <div className="preview">
          <Image src={coats[selectedCoat].src} alt={`${coats[selectedCoat].name} coat`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer" />
          <Image src={buttons[selectedButton].src} alt={`${buttons[selectedButton].name} buttons`} fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer buttonUpper" />
          <Image src={buttons[selectedButton].src} alt="" fill priority sizes="(max-width: 800px) 90vw, 50vw" className="layer buttonLayer buttonLower" />
        </div>
      </section>

      <aside className="controls" aria-label="Customize your coat">
        <OptionGroup title="01 — Select coat" options={coats} selected={selectedCoat} onSelect={setSelectedCoat} type="coat" />
        <OptionGroup title="02 — Select buttons" options={buttons} selected={selectedButton} onSelect={setSelectedButton} type="button" />
        <div className="selectionSummary" aria-live="polite">
          <span>Your selection</span>
          <strong>{coats[selectedCoat].name} / {buttons[selectedButton].name}</strong>
        </div>
      </aside>
    </main>
  );
}

function OptionGroup({ title, options, selected, onSelect, type }: {
  title: string;
  options: { src: string; name: string }[];
  selected: number;
  onSelect: (index: number) => void;
  type: "coat" | "button";
}) {
  return (
    <fieldset className="optionGroup">
      <legend>{title}</legend>
      <div className="optionGrid">
        {options.map((option, index) => (
          <button type="button" key={option.name} className={`option ${selected === index ? "selected" : ""}`} onClick={() => onSelect(index)} aria-pressed={selected === index} aria-label={`Choose ${option.name}`}>
            <span className={`swatch ${type}`}><Image src={option.src} alt="" fill sizes="96px" /></span>
            <span>{option.name}</span>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
