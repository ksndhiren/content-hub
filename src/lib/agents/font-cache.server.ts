import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/** Brand font key → WOFF2 filename under public/fonts. */
const FONT_FILES: Record<string, string> = {
  inter: "inter.woff2",
  manrope: "manrope.woff2",
  dmsans: "dmsans.woff2",
};

/** Pretty display name used in CSS font-family. */
const FONT_DISPLAY_NAME: Record<string, string> = {
  inter: "Inter",
  manrope: "Manrope",
  dmsans: "DM Sans",
};

const cache = new Map<string, Promise<string>>();

/** Load a font as a base64 data URL, cached for the lifetime of the process.
 *  Returns null when the font key isn't recognised or the file is missing. */
export async function loadFontDataUrl(key?: string): Promise<string | null> {
  if (!key || !FONT_FILES[key]) return null;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const file = path.join(process.cwd(), "public", "fonts", FONT_FILES[key]);
      const buf = await readFile(file);
      return `data:font/woff2;base64,${buf.toString("base64")}`;
    })());
  }
  try {
    return await cache.get(key)!;
  } catch (e) {
    console.warn(`Failed to load font ${key}:`, e);
    cache.delete(key);
    return null;
  }
}

export function fontDisplayName(key?: string): string {
  return (key && FONT_DISPLAY_NAME[key]) || "Inter";
}

/** Build the SVG <defs> block with the embedded font. Empty string if no font. */
export function buildFontDefs(fontKey: string | undefined, dataUrl: string | null): string {
  if (!fontKey || !dataUrl) return "";
  const name = fontDisplayName(fontKey);
  // A single variable-font file covers all weights, so one @font-face is enough.
  return `<defs>
    <style>
      @font-face {
        font-family: '${name}';
        src: url('${dataUrl}') format('woff2');
        font-weight: 100 900;
        font-display: block;
      }
    </style>
  </defs>`;
}

/** CSS font-family stack to use in <text> elements. */
export function fontFamilyStack(fontKey?: string): string {
  const name = fontDisplayName(fontKey);
  return `'${name}', ui-sans-serif, system-ui, -apple-system, sans-serif`;
}
