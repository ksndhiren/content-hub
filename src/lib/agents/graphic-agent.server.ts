import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands } from "../mock-data";
import type {
  GraphicAgentOutput,
  LogoPosition,
  LogoPositionScore,
  LogoPlacement,
  LogoVariant,
} from "./types";

const POSITIONS: LogoPosition[] = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

// Schema stays permissive — workflow.tsx still passes a lot of legacy fields
// from older saved plans. Only `imagePrompt` is actually consumed now.
const InputSchema = z.object({
  brandId: z.string().min(1),
  imagePrompt: z.string().min(10),
  /** When true, force the model to render the brand CTA + website URL on the
   *  image. Set by the workflow page for outro slides and for single-slide posts. */
  showCta: z.boolean().optional(),
}).passthrough();

interface LogoInfo { dataUrl: string; aspectRatio: number; mime: string }

export const runGraphicAgent = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<GraphicAgentOutput> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const cfg = getServerConfig();

    const safeZonePreamble = `STRICT CANVAS RULES (read first, apply throughout):
The output is a square 1024x1024 graphic shown with NO bleed on Instagram and LinkedIn. ALL headline text, subhead text, pill chips, faces, hands, and critical subject details MUST sit fully inside the central 84% of the frame — i.e. keep an 8% empty padding ring around every edge. Letters that touch any edge will be cropped and ruin the post. Also reserve a clean empty square in the TOP-LEFT corner roughly 22% of the canvas wide and tall — no text, no faces, no busy detail there, it's where a brand logo gets stamped afterwards. Treat both rules as non-negotiable.

BRAND TYPOGRAPHY (HARD OVERRIDE — overrides every other font instruction in this prompt):
The HEADLINE typeface is a heavy modern GEOMETRIC SANS-SERIF. Reference letterforms: PP Neue Montreal Bold, Söhne Breit Kräftig, General Sans Bold, Inter Display Black, or Pangram Sans Black. The letters MUST have FLAT terminals, low contrast strokes, NO brackets, NO serifs of any kind, NO ball terminals, NO calligraphic curves, NO finials, NO drop shadows, NO italics. Weight: bold to black. Tracking: tight. Case: title or sentence case (not all-caps).

ABSOLUTELY BANNED on every slide (these are FAILURE conditions, regenerate if they appear):
- Display serif (Saol, Tiempos, Times, Georgia, Playfair, GT Sectra, Canela, anything with serifs)
- Slab serif
- Italic script, calligraphy, handwritten
- Brush, sketch, vintage, or hand-drawn lettering
- Outlined or wireframe type
- Gradient-filled letters

Same headline typeface on EVERY slide for brand consistency. Subhead + chip text can be a lighter weight of the same family or a clean neutral sans (Inter Regular). If you would normally pair the composition with a serif headline (e.g. magazine-cover style), STILL use the geometric sans — that's the whole point of the brand.

`;
    const ctaClause = data.showCta && brand.website
      ? `\n\nMANDATORY URL FOOTER (render inside the safe zone, do not omit):
At the BOTTOM of the canvas, inside the 8% safe padding, render ONLY the website URL "${brand.website}" in the same headline typeface family at small-to-medium size, high contrast against the background, fully legible. Centre-align it or align it bottom-left — whichever flows best with the composition. DO NOT render a CTA button, pill, "Apply now" label, "Click here", arrow, or any other button-like element — the URL alone is the footer. DO NOT abbreviate the URL. The written CTA already lives in the headline/subhead above; the footer is just the URL.\n`
      : "";

    // Final reminder pinned to the end of the prompt — image models weight
    // last-mile instructions more heavily for typography.
    const finalTypographyReminder = `\n\nFINAL CHECK BEFORE RENDERING:
The headline typeface is a HEAVY GEOMETRIC SANS-SERIF (PP Neue Montreal Bold / Söhne Breit / Inter Display Black). Flat terminals, no serifs, no brackets, no italic, no script. Even if the composition is "magazine cover" or "editorial" — the type is STILL geometric sans, never serif. If the headline you are about to render has any serifs, ball terminals, brackets, or calligraphic curves, REPLACE the typeface with a heavy geometric sans before rendering.`;

    const imgRes = await openai.images.generate({
      model: cfg.openaiImageModel,
      prompt: safeZonePreamble + data.imagePrompt + ctaClause + finalTypographyReminder,
      size: "1024x1024",
      n: 1,
      quality: cfg.openaiImageQuality,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const imageBase64 = imgRes?.data?.[0]?.b64_json ?? "";
    if (!imageBase64) throw new Error("Image generation returned no data");

    // Logo: fetch the brand's proper wordmark (mock-data.logoUrl) server-side
    // and inline it as a data URL on the SVG. Cloudflare workers can do a
    // network fetch but have no filesystem.
    const fetchedLogo = brand.logoUrl ? await fetchLogoAsDataUrl(brand.logoUrl) : null;
    const logos: Partial<Record<LogoVariant, LogoInfo>> = fetchedLogo
      ? { default: fetchedLogo, white: fetchedLogo }
      : {};
    const cornerTone = await classifyCornerTone(openai, cfg.openaiChatModel, imageBase64);
    const recommendedVariant: LogoVariant = cornerTone === "dark" ? "white" : "default";

    const LOGO_W = 0.22;
    const MARGIN = 0.04;
    const aspect = logos[recommendedVariant]?.aspectRatio ?? 1;
    const logoH = LOGO_W / aspect;
    const initialPlacement = placementForPosition("top-left", LOGO_W, logoH, MARGIN);

    const composedSvg = composeMinimalSvg(imageBase64, logos[recommendedVariant], initialPlacement, cornerTone);
    const baseSvg = composeMinimalSvg(imageBase64, undefined, initialPlacement, cornerTone);

    const positionScores: LogoPositionScore[] = POSITIONS.map((p) => ({
      position: p,
      score: p === "top-left" ? 100 : p.includes("center") ? 30 : 50,
      reason: "Static — AI now renders the whole image.",
    }));

    return {
      brandId: brand.id,
      imagePrompt: data.imagePrompt,
      imageBase64,
      positionScores,
      bestPosition: "top-left",
      composedSvg,
      baseSvg,
      logos,
      recommendedVariant,
      initialPlacement,
      brandedToolChips: undefined,
    };
  });

/** Quick vision check: is the top-left ~22% corner of the image visually
 *  light or dark? Drives the brand-logo variant choice (blue on light, white
 *  on dark). Falls back to "light" on any failure so the original blue logo
 *  is used by default. */
async function classifyCornerTone(
  openai: ReturnType<typeof getOpenAI>,
  model: string,
  imageBase64: string,
): Promise<"light" | "dark"> {
  try {
    const res = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at the TOP-LEFT 22% corner of this image only. Reply with one word: 'light' if that corner is overall light/bright (so a dark logo would be readable on it), or 'dark' if that corner is overall dark/saturated (so a white logo would be readable on it). Nothing else." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
    });
    const ans = (res.choices[0]?.message?.content ?? "").trim().toLowerCase();
    return ans.startsWith("dark") ? "dark" : "light";
  } catch (e) {
    console.warn("corner-tone classification failed:", e);
    return "light";
  }
}

function composeMinimalSvg(imageBase64: string, logo: LogoInfo | undefined, placement: LogoPlacement, cornerTone: "light" | "dark" = "light"): string {
  const S = 1024;
  const href = `data:image/png;base64,${imageBase64}`;
  let logoNode = "";
  if (logo) {
    const w = placement.width * S;
    const h = w / (logo.aspectRatio || 1);
    const x = placement.x * S;
    const y = placement.y * S;
    // Soft rounded-rect plate just behind the wordmark for legibility. White
    // on dark corners, navy on light corners. Sized to hug the wordmark.
    const padX = w * 0.12;
    const padY = h * 0.4;
    const plateColor = cornerTone === "dark" ? "#ffffff" : "#0b1f4a";
    const plateOpacity = 0.94;
    const rx = Math.min((h + padY * 2) * 0.4, 36);
    logoNode = `
  <rect x="${x - padX}" y="${y - padY}" width="${w + padX * 2}" height="${h + padY * 2}" rx="${rx}" fill="${plateColor}" fill-opacity="${plateOpacity}"/>
  <image href="${logo.dataUrl}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${cornerTone === "light" ? " style=\"filter:brightness(0) invert(1)\"" : ""}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <image href="${href}" x="0" y="0" width="${S}" height="${S}"/>${logoNode}
</svg>`;
}

/** Fetch a remote logo URL and return it as a data URL so it embeds in the
 *  SVG cleanly. Works on Cloudflare workers (no filesystem). Tries to read
 *  the PNG width/height from the IHDR chunk so we keep aspect ratio; falls
 *  back to assuming square if it can't. Returns null on any failure. */
async function fetchLogoAsDataUrl(url: string): Promise<LogoInfo | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/png";
    if (!mime.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 16) return null;
    const b64 = bytesToBase64(buf);
    let aspect = 1;
    if (mime.includes("png") && buf[0] === 0x89 && buf[1] === 0x50) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      if (w > 0 && h > 0) aspect = w / h;
    } else if (mime.includes("svg")) {
      const text = new TextDecoder().decode(buf).slice(0, 4096);
      const vb = text.match(/viewBox\s*=\s*["']([\d.\s-]+)["']/);
      if (vb) {
        const parts = vb[1].trim().split(/\s+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) aspect = parts[2] / parts[3];
      } else {
        const wm = text.match(/<svg[^>]*\swidth\s*=\s*["']?([\d.]+)/i);
        const hm = text.match(/<svg[^>]*\sheight\s*=\s*["']?([\d.]+)/i);
        if (wm && hm) aspect = parseFloat(wm[1]) / parseFloat(hm[1]);
      }
    }
    return { dataUrl: `data:${mime};base64,${b64}`, aspectRatio: aspect, mime };
  } catch {
    return null;
  }
}

function bytesToBase64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  // btoa is available on workers + modern Node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(s);
}

function placementForPosition(pos: LogoPosition, w: number, h: number, margin: number): LogoPlacement {
  const cx = (1 - w) / 2;
  const cy = (1 - h) / 2;
  const left = margin;
  const right = 1 - w - margin;
  const top = margin;
  const bottom = 1 - h - margin;
  switch (pos) {
    case "top-left":      return { x: left,  y: top,    width: w };
    case "top-center":    return { x: cx,    y: top,    width: w };
    case "top-right":     return { x: right, y: top,    width: w };
    case "middle-left":   return { x: left,  y: cy,     width: w };
    case "center":        return { x: cx,    y: cy,     width: w };
    case "middle-right":  return { x: right, y: cy,     width: w };
    case "bottom-left":   return { x: left,  y: bottom, width: w };
    case "bottom-center": return { x: cx,    y: bottom, width: w };
    case "bottom-right":  return { x: right, y: bottom, width: w };
  }
}
