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
    return entries
      .filter((entry) => entry.isFile() && SUPPORTED_IMAGE_TYPES.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
      .map((entry) => ({
        src: `/${folder}/${encodeURIComponent(entry.name)}`,
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
  const [coats, buttons] = await Promise.all([getImages("coats"), getImages("buttons")]);
  return <CoatCustomizer coats={coats} buttons={buttons} />;
}
