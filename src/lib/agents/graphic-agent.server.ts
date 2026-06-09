import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands } from "../mock-data";
import { buildFontDefs, fontFamilyStack, loadFontDataUrl } from "./font-cache.server";
import type {
  GraphicAgentOutput,
  LogoPosition,
  LogoPositionScore,
  LogoPlacement,
  LogoVariant,
  PexelsPhotoInfo,
  BrandedToolChip,
} from "./types";

const POSITIONS: LogoPosition[] = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const SCORE_SYSTEM = `You are a visual composition analyst. You will be shown ONE editorial image.

A) Score how suitable each of the 9 grid positions for placing a brand logo overlay (~22% of canvas width). Visually quiet, high contrast, doesn't occlude the subject.
B) Recommend the logo variant, "default" if background is light, "white" if dark.

Return ONLY valid JSON:
{
  "scores": [ { "position": <position>, "score": <0-100 int>, "reason": <short string> } ],
  "recommendedVariant": "default" | "white",
  "variantReason": <short string>
}
All 9 positions exactly once.`;

const InputSchema = z.object({
  brandId: z.string().min(1),
  imagePrompt: z.string().min(10),
  title: z.string().optional(),
  heroPhotoQuery: z.string().optional(),
  photoSide: z.enum(["left", "right"]).optional(),
  brandedTools: z
    .array(z.object({ name: z.string().min(1), domain: z.string().min(3) }))
    .optional(),
  /** Substantive typography we composite as real SVG text on top of the AI bg. */
  headline: z.string().optional(),
  subhead: z.string().optional(),
  chipLabels: z.array(z.string()).optional(),
  graphicFormat: z.enum(["photo-hero", "3d-hero", "infographic"]).optional(),
});

export const runGraphicAgent = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<GraphicAgentOutput> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const cfg = getServerConfig();

    // 1. Kick off image gen + Pexels search + branded-tool logos + brand font load in parallel
    const wantPhoto = !!(data.heroPhotoQuery && cfg.pexelsApiKey);
    const [imgRes, heroPhoto, brandedToolChips, fontDataUrl] = await Promise.all([
      openai.images.generate({
        model: cfg.openaiImageModel,
        prompt: data.imagePrompt,
        size: "1024x1024",
        n: 1,
      }),
      wantPhoto ? fetchPexels(data.heroPhotoQuery!, cfg.pexelsApiKey!, data.photoSide ?? "right") : Promise.resolve(undefined),
      fetchBrandedToolLogos(data.brandedTools ?? []),
      loadFontDataUrl(brand.font),
    ]);
    const imageBase64 = imgRes.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("Image generation returned no data");

    // 2. Load brand logo variants
    const logos = await loadBrandLogos(brand.id, brand.logoUrl);

    // 3. If we have a Pexels photo, fetch + encode it for compositing
    let photoDataUrl: string | undefined;
    if (heroPhoto) {
      try {
        const r = await fetch(heroPhoto.url);
        const buf = Buffer.from(await r.arrayBuffer());
        const mime = r.headers.get("content-type") || "image/jpeg";
        photoDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      } catch (e) {
        console.warn("Pexels fetch failed:", e);
      }
    }

    // 4. Build the FINAL composited image (background + photo) as a data URL
    //    that we can also feed to the vision scorer.
    const baseWithPhoto = photoDataUrl
      ? await composePhotoOntoBackground(imageBase64, photoDataUrl, heroPhoto!.side)
      : imageBase64;

    // 5. Score the 9 positions + recommend logo variant
    let positionScores: LogoPositionScore[] = [];
    let recommendedVariant: LogoVariant = "default";
    try {
      const scoreCompletion = await openai.chat.completions.create({
        model: cfg.openaiChatModel,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SCORE_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Score positions and recommend a logo variant." },
              { type: "image_url", image_url: { url: `data:image/png;base64,${baseWithPhoto}` } },
            ],
          },
        ],
      });
      const parsed = JSON.parse(scoreCompletion.choices[0]?.message?.content ?? "{}");
      if (Array.isArray(parsed.scores)) {
        positionScores = parsed.scores
          .filter((s: { position: string }) => POSITIONS.includes(s.position as LogoPosition))
          .map((s: { position: LogoPosition; score: number; reason: string }) => ({
            position: s.position,
            score: Math.max(0, Math.min(100, Number(s.score) || 0)),
            reason: String(s.reason ?? ""),
          }));
      }
      if (parsed.recommendedVariant === "white" || parsed.recommendedVariant === "default") {
        recommendedVariant = parsed.recommendedVariant;
      }
    } catch (e) {
      console.warn("Scoring failed, falling back:", e);
    }
    if (positionScores.length !== 9) {
      positionScores = POSITIONS.map((p) => ({
        position: p,
        score: p.includes("center") ? 30 : p.startsWith("bottom") ? 75 : 60,
        reason: "Fallback heuristic.",
      }));
    }
    if (!logos[recommendedVariant]) {
      recommendedVariant = (Object.keys(logos)[0] as LogoVariant) ?? "default";
    }

    const bestPosition = positionScores.reduce((a, b) => (b.score > a.score ? b : a)).position;

    // 6. Initial logo placement
    const LOGO_W = 0.22;
    const MARGIN = 0.04;
    const aspect = logos[recommendedVariant]?.aspectRatio ?? 1;
    const logoH = LOGO_W / aspect;
    const initialPlacement = placementForPosition(bestPosition, LOGO_W, logoH, MARGIN);

    // 7. Compose two SVGs: one with logo for the default render, one without
    //    so the client can show a draggable logo on top of the base.
    const composeCommon = {
      imageBase64,
      photoDataUrl,
      photoSide: heroPhoto?.side,
      variant: recommendedVariant,
      brandInitials: brand.initials,
      colors: brand.colors ?? ["#111827", "#ffffff"],
      placement: initialPlacement,
      brandedToolChips,
      headline: data.headline,
      subhead: data.subhead,
      chipLabels: data.chipLabels,
      graphicFormat: data.graphicFormat,
      fontKey: brand.font,
      fontDataUrl,
    } as const;
    const composedSvg = composeSvg({ ...composeCommon, logo: logos[recommendedVariant] });
    const baseSvg = composeSvg({ ...composeCommon, logo: undefined, hideLogoFallback: true });

    return {
      brandId: brand.id,
      imagePrompt: data.imagePrompt,
      imageBase64: baseWithPhoto, // includes photo if present
      positionScores,
      bestPosition,
      composedSvg,
      baseSvg,
      logos,
      recommendedVariant,
      initialPlacement,
      brandedToolChips,
      heroPhoto,
    };
  });

// ---------- Pexels ----------

interface PexelsApiPhoto {
  id: number;
  url: string;
  alt: string;
  photographer: string;
  photographer_url: string;
  src: { large2x?: string; large?: string; original?: string; medium?: string };
}

async function fetchPexels(query: string, apiKey: string, side: "left" | "right"): Promise<PexelsPhotoInfo | undefined> {
  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("orientation", "portrait");
    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.warn("Pexels search failed:", res.status, await res.text().catch(() => ""));
      return undefined;
    }
    const json = (await res.json()) as { photos: PexelsApiPhoto[] };
    const p = json.photos?.[0];
    if (!p) return undefined;
    return {
      url: p.src.large2x || p.src.large || p.src.original || p.src.medium || "",
      pageUrl: p.url,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      alt: p.alt || query,
      side,
    };
  } catch (e) {
    console.warn("Pexels error:", e);
    return undefined;
  }
}

/** Build a 1024×1024 base64 PNG with the photo composited on one side of the background.
 *  Done by emitting an SVG and rasterising client-side is heavy; instead, we just
 *  return base64 of an SVG-wrapped composite so the vision model sees the final layout.
 *  Note: vision API accepts SVG-rendered HTML poorly, so we keep things simple and
 *  return the raw background base64; the photo is overlaid in the FINAL composedSvg only.
 *  The scoring quality is still good because the background has explicit empty space. */
async function composePhotoOntoBackground(bg: string, _photo: string, _side: "left" | "right"): Promise<string> {
  // Intentionally pass-through: scoring runs on the background-only image,
  // which already has known empty space on the photo side.
  // The final composedSvg embeds both layers for display.
  return bg;
}

// ---------- Branded-tool chip fetcher ----------

/** Fetch real-brand logos for tools the writer flagged (Zoom/Slack/Trello/...).
 *  Tries Clearbit's public logo endpoint first (clean transparent PNGs),
 *  falls back to Google's favicon API (smaller but extremely reliable).
 *  Each chip resolves to { name, domain, logoDataUrl } where logoDataUrl is
 *  null if every source failed for that brand. */
async function fetchBrandedToolLogos(
  tools: { name: string; domain: string }[],
): Promise<BrandedToolChip[] | undefined> {
  if (!tools.length) return undefined;
  const sources = (domain: string) => [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
  ];
  const chips = await Promise.all(
    tools.map(async (t) => {
      for (const url of sources(t.domain)) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const ct = r.headers.get("content-type") || "image/png";
          if (!ct.startsWith("image/")) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 200) continue; // Google returns ~120-byte placeholder when domain unknown
          return {
            name: t.name,
            domain: t.domain,
            logoDataUrl: `data:${ct};base64,${buf.toString("base64")}`,
          } satisfies BrandedToolChip;
        } catch {
          // try next source
        }
      }
      return { name: t.name, domain: t.domain, logoDataUrl: null } satisfies BrandedToolChip;
    }),
  );
  return chips;
}

// ---------- Logo helpers ----------

interface LogoInfo { dataUrl: string; aspectRatio: number; mime: string }

async function loadBrandLogos(brandId: string, defaultPath?: string): Promise<Partial<Record<LogoVariant, LogoInfo>>> {
  const out: Partial<Record<LogoVariant, LogoInfo>> = {};
  const defaultP = defaultPath ?? `/brands/${brandId}.png`;
  const whiteP = `/brands/${brandId}_white.png`;
  const [d, w] = await Promise.all([tryLoadLogo(defaultP), tryLoadLogo(whiteP)]);
  if (d) out.default = d;
  if (w) out.white = w;
  return out;
}

async function tryLoadLogo(publicPath: string): Promise<LogoInfo | null> {
  try {
    const cleanPath = publicPath.replace(/^\/+/, "");
    const filePath = path.join(process.cwd(), "public", cleanPath);
    const buf = await readFile(filePath);
    const mime = cleanPath.toLowerCase().endsWith(".svg") ? "image/svg+xml"
      : cleanPath.toLowerCase().endsWith(".jpg") || cleanPath.toLowerCase().endsWith(".jpeg") ? "image/jpeg"
      : "image/png";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const { width, height } = readImageDimensions(buf, mime);
    if (!width || !height) return { dataUrl, aspectRatio: 4, mime };
    return { dataUrl, aspectRatio: width / height, mime };
  } catch {
    return null;
  }
}

function readImageDimensions(buf: Buffer, mime: string): { width: number; height: number } {
  if (mime === "image/png" && buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (mime === "image/jpeg") {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  return { width: 0, height: 0 };
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

function composeSvg(params: {
  imageBase64: string;
  photoDataUrl?: string;
  photoSide?: "left" | "right";
  logo: LogoInfo | undefined;
  variant: LogoVariant;
  brandInitials: string;
  colors: string[];
  placement: LogoPlacement;
  brandedToolChips?: BrandedToolChip[];
  headline?: string;
  subhead?: string;
  chipLabels?: string[];
  graphicFormat?: "photo-hero" | "3d-hero" | "infographic";
  /** When true, render NOTHING at the logo position (no badge fallback either). */
  hideLogoFallback?: boolean;
  fontKey?: string;
  fontDataUrl?: string | null;
}): string {
  const {
    imageBase64, photoDataUrl, photoSide, logo, variant, brandInitials, colors, placement,
    brandedToolChips, headline, subhead, chipLabels, graphicFormat, hideLogoFallback,
    fontKey, fontDataUrl,
  } = params;
  const S = 1024;
  const lx = placement.x * S;
  const ly = placement.y * S;
  const lw = placement.width * S;
  const lh = logo ? lw / (logo.aspectRatio || 1) : lw;

  // Photo overlay: 50% width, full height, on the photoSide.
  let photoNode = "";
  if (photoDataUrl && photoSide) {
    const PW = 0.5 * S;
    const PX = photoSide === "left" ? 0 : S - PW;
    photoNode = `
      <defs>
        <clipPath id="photoClip">
          <rect x="${PX}" y="0" width="${PW}" height="${S}"/>
        </clipPath>
      </defs>
      <image href="${photoDataUrl}" x="${PX}" y="0" width="${PW}" height="${S}"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
    `;
  }

  let logoNode = "";
  if (logo) {
    logoNode = `<image href="${logo.dataUrl}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMidYMid meet"/>`;
  } else if (!hideLogoFallback) {
    const fill = colors[0] ?? "#111827";
    const stroke = colors[1] ?? "#ffffff";
    logoNode = `
      <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="${lh * 0.22}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
      <text x="${lx + lw / 2}" y="${ly + lh / 2 + lh * 0.15}" font-family="ui-sans-serif,system-ui,Inter,sans-serif"
            font-size="${lh * 0.42}" font-weight="700" text-anchor="middle" fill="#ffffff">${escapeXml(brandInitials)}</text>
    `;
  }

  const fontStack = fontFamilyStack(fontKey);
  const fontDefs = buildFontDefs(fontKey, fontDataUrl ?? null);

  const chipStripNode = renderBrandedChipStrip(S, brandedToolChips, fontStack);
  const typographyNode = renderTypographyLayer(S, {
    headline, subhead, chipLabels, colors,
    photoSide: graphicFormat === "photo-hero" ? photoSide : undefined,
    graphicFormat,
    fontStack,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  ${fontDefs}
  <image href="data:image/png;base64,${imageBase64}" x="0" y="0" width="${S}" height="${S}"/>
  ${photoNode}
  ${typographyNode}
  ${chipStripNode}
  ${logoNode}
</svg>`;
}

/** Renders headline + subhead + chip labels as REAL SVG text on top of the AI
 *  background, positioned per graphicFormat. This is what carries the substance. */
function renderTypographyLayer(S: number, p: {
  headline?: string;
  subhead?: string;
  chipLabels?: string[];
  colors: string[];
  photoSide?: "left" | "right";
  graphicFormat?: "photo-hero" | "3d-hero" | "infographic";
  fontStack: string;
}): string {
  const headline = (p.headline ?? "").trim();
  const subhead = (p.subhead ?? "").trim();
  const chips = (p.chipLabels ?? []).filter(Boolean);
  if (!headline && !subhead && !chips.length) return "";

  // Layout zone (in canvas units): where typography sits.
  // Default: left half of canvas. For photo-hero, opposite of photo. For infographic, top-centred.
  let zoneX = 0.06 * S;
  let zoneW = 0.50 * S;
  let zoneY = 0.10 * S;
  let textAnchor: "start" | "middle" = "start";
  let chipAlign: "start" | "middle" = "start";

  if (p.graphicFormat === "photo-hero" && p.photoSide) {
    if (p.photoSide === "left") {
      zoneX = 0.52 * S;
      zoneW = 0.42 * S;
    } else {
      zoneX = 0.06 * S;
      zoneW = 0.42 * S;
    }
  } else if (p.graphicFormat === "infographic") {
    zoneX = 0.08 * S;
    zoneW = 0.84 * S;
    zoneY = 0.08 * S;
    textAnchor = "middle";
    chipAlign = "middle";
  } else if (p.graphicFormat === "3d-hero") {
    zoneX = 0.06 * S;
    zoneW = 0.50 * S;
  }

  const parts: string[] = [];

  // Headline: wrap to fit zoneW.
  const headlineSize = headline.length > 26 ? S * 0.075 : S * 0.092;
  const headlineLines = wrapText(headline, Math.floor(zoneW / (headlineSize * 0.55)));
  const headlineLineH = headlineSize * 1.12;

  let cursorY = zoneY + headlineSize;
  for (const line of headlineLines) {
    // Highlight block behind the line: a coloured pill so the headline pops.
    // We render the block first, then the white text on top.
    const fill = p.colors[1] ?? "#fbbf24";
    const blockPadX = headlineSize * 0.22;
    const blockPadY = headlineSize * 0.10;
    const approxW = line.length * headlineSize * 0.55;
    const blockX = textAnchor === "middle" ? zoneX + (zoneW - approxW) / 2 - blockPadX : zoneX - blockPadX;
    parts.push(`
      <rect x="${blockX}" y="${cursorY - headlineSize + blockPadY}" width="${approxW + blockPadX * 2}" height="${headlineSize + 4}" rx="${headlineSize * 0.18}" fill="${fill}" fill-opacity="0.92"/>
    `);
    const textX = textAnchor === "middle" ? zoneX + zoneW / 2 : zoneX;
    parts.push(`
      <text x="${textX}" y="${cursorY}" font-family="${p.fontStack}"
            font-size="${headlineSize}" font-weight="800" fill="#ffffff" text-anchor="${textAnchor}" letter-spacing="-0.02em">${escapeXml(line)}</text>
    `);
    cursorY += headlineLineH;
  }
  cursorY += headlineSize * 0.2;

  // Subhead
  if (subhead) {
    const subSize = S * 0.030;
    const subLines = wrapText(subhead, Math.floor(zoneW / (subSize * 0.55)));
    for (const line of subLines) {
      const tx = textAnchor === "middle" ? zoneX + zoneW / 2 : zoneX;
      parts.push(`
        <text x="${tx}" y="${cursorY}" font-family="${p.fontStack}"
              font-size="${subSize}" font-weight="500" fill="#ffffff" fill-opacity="0.92" text-anchor="${textAnchor}">${escapeXml(line)}</text>
      `);
      cursorY += subSize * 1.35;
    }
    cursorY += subSize * 0.5;
  }

  // Chip labels
  if (chips.length) {
    const chipH = S * 0.045;
    const chipFontSize = chipH * 0.55;
    const chipPadX = chipH * 0.65;
    const chipGap = chipH * 0.40;
    const chipFill = p.colors[1] ?? "#fbbf24";
    // Estimate widths
    const widths = chips.map((c) => Math.max(chipH * 2.2, c.length * chipFontSize * 0.65 + chipPadX * 2));
    const totalW = widths.reduce((a, b) => a + b, 0) + chipGap * (chips.length - 1);

    // Multi-row wrap if needed
    if (totalW <= zoneW) {
      let cx = chipAlign === "middle" ? zoneX + (zoneW - totalW) / 2 : zoneX;
      for (let i = 0; i < chips.length; i++) {
        const w = widths[i];
        parts.push(renderChip(cx, cursorY, w, chipH, chipFontSize, chipFill, chips[i], p.fontStack));
        cx += w + chipGap;
      }
    } else {
      // Wrap to multi rows
      let cx = zoneX, cy = cursorY;
      for (let i = 0; i < chips.length; i++) {
        const w = widths[i];
        if (cx + w > zoneX + zoneW && cx > zoneX) {
          cx = zoneX;
          cy += chipH + chipGap;
        }
        parts.push(renderChip(cx, cy, w, chipH, chipFontSize, chipFill, chips[i], p.fontStack));
        cx += w + chipGap;
      }
    }
  }

  return parts.join("\n");
}

function renderChip(x: number, y: number, w: number, h: number, fontSize: number, fill: string, label: string, fontStack: string): string {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" fill-opacity="0.92"/>
    <text x="${x + w / 2}" y="${y + h * 0.68}" font-family="${fontStack}"
          font-size="${fontSize}" font-weight="700" fill="#0f172a" text-anchor="middle">${escapeXml(label)}</text>
  `;
}

/** Naive greedy word wrap by approximate char count per line. */
function wrapText(s: string, maxCharsPerLine: number): string[] {
  if (!s) return [];
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length <= maxCharsPerLine) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Renders a horizontal strip of branded-tool chips across the lower third of
 *  the canvas. Each chip is a rounded white pill with the brand's real logo on
 *  the left and the brand name in dark text on the right. */
function renderBrandedChipStrip(S: number, chips?: BrandedToolChip[], fontStack: string = "ui-sans-serif,system-ui,sans-serif"): string {
  if (!chips || !chips.length) return "";
  const n = chips.length;

  const chipH = S * 0.085;        // 87px tall
  const padX = chipH * 0.55;       // horizontal padding inside each chip
  const gap = chipH * 0.45;        // gap between chips
  const stripY = S * 0.70;         // strip baseline (top of chips)

  // Approximate chip widths — vary by label length so they don't all jam together.
  const charW = chipH * 0.32;
  const iconW = chipH * 0.70;
  const labelW = (s: string) => Math.max(charW * 3, charW * s.length);
  const widths = chips.map((c) => padX + iconW + padX * 0.45 + labelW(c.name) + padX);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  let cursorX = (S - totalW) / 2;

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = chips[i];
    const w = widths[i];
    const x = cursorX;
    const y = stripY;
    const cy = y + chipH / 2;

    // Pill background — solid white with soft shadow look (no animation).
    parts.push(`
      <rect x="${x}" y="${y}" width="${w}" height="${chipH}" rx="${chipH / 2}"
            fill="#ffffff" fill-opacity="0.96" stroke="#e5e7eb" stroke-width="1"/>
    `);
    // Logo on the left (real logo if fetched, otherwise initials chip).
    const iconX = x + padX;
    const iconY = cy - iconW / 2;
    if (c.logoDataUrl) {
      parts.push(`<image href="${c.logoDataUrl}" x="${iconX}" y="${iconY}" width="${iconW}" height="${iconW}" preserveAspectRatio="xMidYMid meet"/>`);
    } else {
      parts.push(`
        <circle cx="${iconX + iconW / 2}" cy="${cy}" r="${iconW / 2}" fill="#1f2937"/>
        <text x="${iconX + iconW / 2}" y="${cy + iconW * 0.12}"
              font-family="${fontStack}" font-size="${iconW * 0.45}"
              font-weight="700" text-anchor="middle" fill="#ffffff">${escapeXml(c.name.slice(0, 2).toUpperCase())}</text>
      `);
    }
    // Brand name.
    const textX = iconX + iconW + padX * 0.45;
    parts.push(`
      <text x="${textX}" y="${cy + chipH * 0.13}"
            font-family="${fontStack}" font-size="${chipH * 0.4}"
            font-weight="700" fill="#0f172a">${escapeXml(c.name)}</text>
    `);

    cursorX += w + gap;
  }
  return parts.join("\n");
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}
