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

BRAND TYPOGRAPHY (OVERRIDE any font instruction in the prompt below — use this on every slide):
Render the main HEADLINE in a heavy modern geometric sans-serif with a slight contemporary character — think "PP Neue Montreal Bold", "Söhne Breit Kräftig", "General Sans Bold", "Inter Display Black", or "Pangram Sans Black". Weight: bold to black. Tracking: tight. Case: title or sentence case (not all-caps). Crisp, confident, Gen Z editorial — the same vibe you see on Linear, Vercel, Substack and modern Instagram infographic accounts. Absolutely NO display serif, no "Saol", no "Tiempos", no "Times", no italic script, no handwritten, no condensed brutalist headline. Use this same headline typeface on EVERY slide for brand consistency. The subhead and chip text can be a lighter weight of the same family, or a clean neutral sans like Inter Regular.

`;
    const ctaClause = data.showCta && brand.website
      ? `\n\nMANDATORY URL FOOTER (render inside the safe zone, do not omit):
At the BOTTOM of the canvas, inside the 8% safe padding, render ONLY the website URL "${brand.website}" in the same headline typeface family at small-to-medium size, high contrast against the background, fully legible. Centre-align it or align it bottom-left — whichever flows best with the composition. DO NOT render a CTA button, pill, "Apply now" label, "Click here", arrow, or any other button-like element — the URL alone is the footer. DO NOT abbreviate the URL. The written CTA already lives in the headline/subhead above; the footer is just the URL.\n`
      : "";

    const imgRes = await openai.images.generate({
      model: cfg.openaiImageModel,
      prompt: safeZonePreamble + data.imagePrompt + ctaClause,
      size: "1024x1024",
      n: 1,
      quality: cfg.openaiImageQuality,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const imageBase64 = imgRes?.data?.[0]?.b64_json ?? "";
    if (!imageBase64) throw new Error("Image generation returned no data");

    // Brand logos are currently AI-rendered inline. When real PNG assets are
    // wired in later, swap these for static Vite imports (e.g.
    // `import internwiseLogo from "@/assets/brands/internwise.png?inline"`)
    // so they bundle into the JS — Cloudflare Pages has no filesystem at runtime.
    const logos: Partial<Record<LogoVariant, LogoInfo>> = {};
    const cornerTone = await classifyCornerTone(openai, cfg.openaiChatModel, imageBase64);
    const recommendedVariant: LogoVariant = cornerTone === "dark" ? "white" : "default";

    const LOGO_W = 0.22;
    const MARGIN = 0.04;
    const aspect = logos[recommendedVariant]?.aspectRatio ?? 1;
    const logoH = LOGO_W / aspect;
    const initialPlacement = placementForPosition("top-left", LOGO_W, logoH, MARGIN);

    const composedSvg = composeMinimalSvg(imageBase64, logos[recommendedVariant], initialPlacement);
    const baseSvg = composeMinimalSvg(imageBase64, undefined, initialPlacement);

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

function composeMinimalSvg(imageBase64: string, logo: LogoInfo | undefined, placement: LogoPlacement): string {
  const S = 1024;
  const href = `data:image/png;base64,${imageBase64}`;
  const logoNode = logo
    ? `<image href="${logo.dataUrl}" x="${placement.x * S}" y="${placement.y * S}" width="${placement.width * S}" preserveAspectRatio="xMinYMin meet"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <image href="${href}" x="0" y="0" width="${S}" height="${S}"/>
  ${logoNode}
</svg>`;
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
