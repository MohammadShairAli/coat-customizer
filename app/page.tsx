import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import CoatCustomizer, { type CustomizerOption } from "./coat-customizer";

const SITE_URL = "https://suite-customizer.blenspark.com";
const SUPPORTED_IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

const DISPLAY_NAMES: Record<string, string> = {
  "coat-1": "Charcoal Pinstripe",
  "coat-2": "Sage Corduroy",
  "coat-3": "Camel Twill",
  "coat-4": "Cream Linen",
  "coat-5": "Highland Check",
  black: "Jet Black",
  gray: "Slate Grey",
  white: "Ivory White",
  brown: "Reddish Brown",
  golden: "Woven Gold",
  green: "Emerald green",
};

// Picker order for coats; files not listed here follow in filename order.
const COAT_ORDER = ["coat-3", "coat-2", "coat-1", "coat-4", "coat-5"];

function coatRank(filename: string) {
  const index = COAT_ORDER.indexOf(path.parse(filename).name.toLowerCase());
  return index === -1 ? COAT_ORDER.length : index;
}

function labelFromFilename(filename: string) {
  const key = path.parse(filename).name.toLowerCase();
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  return path.parse(filename).name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getImages(folder: "coats"): Promise<CustomizerOption[]> {
  const directory = path.join(process.cwd(), "public", folder);

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    // A 3D model belongs to the image with the same base name, e.g. Coat-1.png + Coat-1.glb
    const models = new Map(
      entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".glb")
        .map((entry) => [path.parse(entry.name).name.toLowerCase(), entry.name]),
    );
    return entries
      .filter((entry) =>
        entry.isFile() &&
        SUPPORTED_IMAGE_TYPES.has(path.extname(entry.name).toLowerCase())
      )
      .sort((a, b) =>
        coatRank(a.name) - coatRank(b.name) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      )
      .map((entry) => {
        const model = models.get(path.parse(entry.name).name.toLowerCase());
        const thumbName = path.join(directory, "thumbs", entry.name);
        return {
          src: `/${folder}/${encodeURIComponent(entry.name)}`,
          name: labelFromFilename(entry.name),
          ...(model && { model: `/${folder}/${encodeURIComponent(model)}` }),
          ...(existsSync(thumbName) && { thumb: `/${folder}/thumbs/${encodeURIComponent(entry.name)}` }),
        };
      });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

// Buttons are cover photos: they show in the picker, dress the 3D buttons and are laid over the coat photo.
async function getButtons(): Promise<CustomizerOption[]> {
  try {
    const entries = await readdir(path.join(process.cwd(), "public", "buttons", "thumbs"), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && SUPPORTED_IMAGE_TYPES.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      .map((entry) => ({
        src: `/buttons/thumbs/${encodeURIComponent(entry.name)}`,
        name: labelFromFilename(entry.name),
      }));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

export default async function Home() {
  await connection();
  const [coats, buttons] = await Promise.all([getImages("coats"), getButtons()]);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "The Atelier — Bespoke Coat & Blazer Collection",
        itemListOrder: "https://schema.org/ItemListUnordered",
        numberOfItems: coats.length,
        itemListElement: coats.map((coat, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: coat.name,
            image: `${SITE_URL}${coat.src}`,
            brand: { "@type": "Brand", name: "The Atelier" },
            category: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
            description: `Custom tailored ${coat.name} available in bespoke fabric dyes and button finishes (${buttons.map((b) => b.name).join(", ")}) inside The Atelier 3D studio.`,
          },
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How does The Atelier 3D Coat Customizer work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Browse tailored coats in the collection carousel, then open the studio to inspect the garment in 360°, switch fabric dyes, and customize button hardware finishes in real time.",
            },
          },
          {
            "@type": "Question",
            name: "Which tailored coats and fabrics are available?",
            acceptedAnswer: {
              "@type": "Answer",
              text: `The collection features ${coats.map((c) => c.name).join(", ")}, each with curated fabric dye options and customizable button finishes.`,
            },
          },
          {
            "@type": "Question",
            name: "What button finishes can I choose from?",
            acceptedAnswer: {
              "@type": "Answer",
              text: `Available button finishes include ${buttons.map((b) => b.name).join(", ")}.`,
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <CoatCustomizer coats={coats} buttons={buttons} />

      {/* Crawl-accessible semantic catalog for Google & AI search engines (GEO) */}
      <section className="sr-only" aria-label="Bespoke Coat Collection Catalog">
        <h2>The Atelier — Bespoke Tailored Coats &amp; Blazers</h2>
        <p>
          Interactive 3D garment configurator to customize tailored weaves, fabric dyes, and button finishes.
        </p>
        <ul>
          {coats.map((coat) => (
            <li key={coat.src}>
              <h3>{coat.name}</h3>
              <p>Customizable fabric dye shades and button hardware finishes.</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}