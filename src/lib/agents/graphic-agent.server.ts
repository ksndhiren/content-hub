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

BRAND TYPOGRAPHY (apply to every slide):
This is editorial-magazine typography, mixed serif + sans. Pick whichever fits the slide's lane:
- DISPLAY SERIF for magazine-masthead headlines (think Saol Display, Tiempos Headline, GT Sectra) — used when the brief mentions "magazine cover", "masthead", "editorial display" or a cover-style layout.
- HEAVY GEOMETRIC SANS for poster headlines and data labels (think PP Neue Montreal Bold, Söhne Breit Kräftig, Inter Display Black) — used when the brief is data-poster, infographic, or sans-headline lane.
Italic accent on 1-2 words inside the headline is welcome.
Body text, chart labels, source lines and chips use a CLEAN NEUTRAL SANS (Inter, Söhne, GT America). Numbers in charts can be display sans or display serif numerals — pick whichever reads cleanest at small size.

ABSOLUTELY BANNED (these tank the visual; regenerate if they appear):
- Italic script, calligraphy, handwritten, brush, sketch
- Comic, novelty, or game-show display fonts
- Outlined-only letters with no fill
- Gradient-filled letters or chrome effects
- Times New Roman or default Word-document serif

Aim for the typographic vibe of Visual Capitalist, Information is Beautiful, Pitch, Pop magazine, Monocle.

`;
    // No CTA / URL clause — code overlays the URL as an SVG layer afterwards
    // (same approach as the logo). We also tell the model not to render any
    // URL itself, so it doesn't compete with the overlay.
    const noUrlClause = `\n\nDO NOT render any URL, website address, "www.", ".com", domain name, social handle, or "Apply now" / "Click here" button on the canvas. The URL is added as a code overlay after the image is generated.`;

    const imgRes = await openai.images.generate({
      model: cfg.openaiImageModel,
      prompt: safeZonePreamble + data.imagePrompt + noUrlClause,
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

    // URL is now a client-controlled overlay (like the logo) — server no
    // longer stamps it into the SVG. We pass brandWebsite + defaultShowUrl
    // through the output so the client can render and toggle it.
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
      brandWebsite: brand.website?.replace(/^https?:\/\//, ""),
      defaultShowUrl: !!data.showCta,
      cornerTone,
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
  // The composed SVG no longer bakes the logo's white/invert filter — the
  // client toggle in EditableLogoCanvas drives that so the user can switch
  // light/dark variants in real time. Server still draws the default-tone
  // logo so the "raw" composed SVG (used by the carousel zip export) is
  // self-sufficient when downloaded without client interaction.
  let logoNode = "";
  if (logo) {
    const w = placement.width * S;
    const h = w / (logo.aspectRatio || 1);
    const x = placement.x * S;
    const y = placement.y * S;
    const padX = w * 0.12;
    const padY = h * 0.4;
    const plateColor = cornerTone === "dark" ? "#ffffff" : "#0b1f4a";
    const plateOpacity = 0.94;
    const rx = Math.min((h + padY * 2) * 0.4, 36);
    const invertOnLight = cornerTone === "light" ? ' style="filter:brightness(0) invert(1)"' : "";
    logoNode = `
  <rect x="${x - padX}" y="${y - padY}" width="${w + padX * 2}" height="${h + padY * 2}" rx="${rx}" fill="${plateColor}" fill-opacity="${plateOpacity}"/>
  <image href="${logo.dataUrl}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${invertOnLight}/>`;
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
