import { readdir } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import CoatCustomizer, { type CustomizerOption } from "./coat-customizer";

const SUPPORTED_IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

function labelFromFilename(filename: string) {
  return path.parse(filename).name
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getImages(folder: "coats" | "buttons"): Promise<CustomizerOption[]> {
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
        SUPPORTED_IMAGE_TYPES.has(path.extname(entry.name).toLowerCase()) &&
        !(folder === "buttons" && entry.name.toLowerCase() === "placeholder.png")
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      .map((entry) => {
        const model = models.get(path.parse(entry.name).name.toLowerCase());
        return {
          src: `/${folder}/${encodeURIComponent(entry.name)}`,
          name: labelFromFilename(entry.name),
          ...(model && { model: `/${folder}/${encodeURIComponent(model)}` }),
        };
      });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
}

export default async function Home() {
  await connection();
  const [coats, buttons] = await Promise.all([getImages("coats"), getImages("buttons")]);
  return <CoatCustomizer coats={coats} buttons={buttons} />;
}
