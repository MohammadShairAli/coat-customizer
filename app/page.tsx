import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import CoatCustomizer, { type CustomizerOption } from "./coat-customizer";

const SUPPORTED_IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

const DISPLAY_NAMES: Record<string, string> = {
  "coat-1": "Charcoal Pinstripe",
  "coat-2": "Sage Corduroy",
  "coat-3": "Camel Twill",
  black: "Jet Black",
  gray: "Slate Grey",
  white: "Ivory White",
  yellow: "Mustard",
};

// Picker order for coats; files not listed here follow in filename order.
const COAT_ORDER = ["coat-3", "coat-2", "coat-1"];

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
  return <CoatCustomizer coats={coats} buttons={buttons} />;
}
