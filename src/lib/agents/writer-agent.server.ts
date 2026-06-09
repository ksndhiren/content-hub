import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands, type Platform } from "../mock-data";
import type { PostPlan, PostSlide, GraphicFormat, CaptionsByPlatform, SeoOpportunity } from "./types";
import { PLATFORM_RULES } from "./types";
import { cleanStringsDeep } from "./text-cleanup";

const SYSTEM = `You are the Content Writer Agent for a multi-brand content studio. For ONE SEO opportunity, produce a full social-media post: the body copy AND the graphics that carry the substance themselves.

CORE PRINCIPLE — THE GRAPHIC IS THE MESSAGE:
The graphic must be self-explanatory. A user scrolling past should get the value WITHOUT reading the caption. Every slide is a piece of information design, not decoration. The caption amplifies and adds nuance; it does not carry the message alone.

CONCRETE TEST: if your slideTitle is just the topic ("AI Internships", "Master Virtual Tools", "Networking Tips"), STOP. That is wrong. The slide headline must be a SPECIFIC claim, stat, hook, or insight.

EXAMPLES OF GOOD VS BAD SLIDE HEADLINES:
  GOOD: "AI roles pay £45k+ in 2026"  (specific stat)
  GOOD: "TikTok is hiring 200 AI interns"  (specific company + number)
  GOOD: "5 CV mistakes that block you"  (specific count + outcome)
  GOOD: "S is for Situation"  (specific framework step)
  BAD:  "AI Internships Matter"  (generic topic)
  BAD:  "Master Virtual Tools"  (generic topic)
  BAD:  "Network Online"  (generic topic)
  BAD:  "Networking Tips for Students"  (generic topic)

Return ONLY valid JSON matching this schema:
{
  "format": "single" | "carousel",
  "title": string,                 // <= 70 chars, the post-level headline
  "hook": string,                  // ONE sentence scroll-stopper. THIS BECOMES THE COVER SLIDE'S slideTitle for singles.
  "body": string,                  // 90-140 words. Must contain CONCRETE facts/insights/stats — not waffle. The slide headlines + chip labels for the carousel come from distilling this body.
  "captions": {
    <Platform>: { "text": string, "hashtags": string[] }
  },
  "graphicFormat": "photo-hero" | "3d-hero" | "infographic",
  "slides": [
    {
      "slideTitle": string,    // 3-6 words. The BOLD HEADLINE TEXT THAT IS RENDERED ON THE IMAGE. Must be a specific claim. Quote-worthy.
      "slideBody": string,     // 6-12 words. The SUBHEAD TEXT RENDERED UNDER THE HEADLINE on the image. Adds the concrete value behind the headline.
      "chipLabels": [string],  // 2-4 short labels (1-4 words each) shown as pill chips on the image. MUST be substantive: stats, role names, tools, numbers, properties. NEVER generic ("Connect", "Grow", "Engage", "Real experience", "High paying"). Examples: "£45k starting", "Python + TF", "Remote OK", "Apply by Aug 30".
      "imagePrompt": string,   // 140-200 word visual prompt. MUST instruct the image model to render the slideTitle and slideBody as actual readable typography on the image, plus the chipLabels as visible pill chips. The image model will render those text strings on the graphic.
      "graphicFormat": "photo-hero" | "3d-hero" | "infographic",
      "heroPhotoQuery": string | null,
      "photoSide": "left" | "right" | null,
      "brandedTools": [ { "name": string, "domain": string } ] | null
    }
  ]
}

CONNECTING HOOK/BODY TO SLIDES (CRITICAL):
- For SINGLE posts: slide 0's slideTitle = a punchier rewrite of the hook. slideBody distills the strongest specific point from body. chipLabels pull 2-4 concrete data points (stats, names, tools, numbers) from body.
- For CAROUSEL posts: slide 0 (cover) carries the hook headline. Slides 1..N each take ONE specific point from body and turn it into its own headline + subhead + chips. The whole body should be visible across the slides combined.

The hook and body are NOT discardable filler. If your slides don't contain the substance of body, you have failed. The user reviewing this should be able to compose the body from reading just the slides.

FORMAT (single vs carousel):
- "single" → ONE slide. Use for one-shot value posts, announcements, single statements, opinion pieces.
- "carousel" → 3 to 5 slides. Use for numbered breakdowns (5 tips, 4 steps), frameworks (STAR, SMART), or educational deep-dives.

graphicFormat per slide:
DEFAULT BIAS: photo-hero. Real human imagery wins on social. Pick anything else ONLY if a real photo cannot carry the slide.
- "photo-hero" → ALWAYS use for cover slide of carousels, single-image posts about people/jobs/careers/experiences/advice, body slides showing "what to do" or "day-in-the-life". Set heroPhotoQuery to a SPECIFIC 3-6 word Pexels query. Set photoSide.
- "3d-hero" → ONLY when no human plausibly fits and topic is genuinely abstract.
- "infographic" → ONLY for true bullet/step lists with no narrative.

BRANDED TOOLS: if a slide names external products/apps (Zoom, Slack, Trello, LinkedIn, Notion, ChatGPT, Figma, GitHub, etc.), set brandedTools to [{name, domain}] using each brand's official root domain. The agent fetches real logos and composites them as chips, so DO NOT also put their names in chipLabels (would duplicate). Image prompt must reserve a clean horizontal strip in the lower third for those chip overlays.

CAPTION RULES, per platform:
- Instagram   → text <=150 chars target (hard cap 2200). Hashtags 3-5. Caption must REINFORCE the slide substance (not repeat it verbatim) and add ONE extra angle or call-to-action. Hook in first line, line break, value, CTA.
- Threads     → text <=400 chars target (hard cap 500). Hashtags 0-2. Conversational, ask a question at the end.
- LinkedIn    → text 800-1300 chars target (hard cap 3000). Hashtags 3-5. Expand on body with professional framing, end with question. Use line breaks generously.
- Facebook    → text 40-80 chars target. Hashtags 0-2.
- X           → text <=250 chars target (hard cap 280). Hashtags 0-2. Punchy.
- YouTube Shorts → text <=95 chars target (hard cap 100). Hashtags 1-3.
Each caption MUST be unique to its platform.

PUNCTUATION RULE — APPLIES TO ALL TEXT:
NEVER use the em-dash character (Unicode U+2014). NEVER use the en-dash character (Unicode U+2013). Use commas, periods, or an ASCII hyphen "-" only when needed.

IMAGE PROMPT RULES (per slide.imagePrompt) — READ CAREFULLY, THIS HAS CHANGED:

The image model generates ONLY THE BACKGROUND ATMOSPHERE. All typography, all chips, the hero photo, and brand logos are composited on top by code afterwards as real vector layers. The image model is unreliable at typography, so we do not ask it to render any.

WHAT THE IMAGE MUST CONTAIN:
- A premium editorial BACKGROUND in the brand's palette and visual style.
- Smooth gradients, soft abstract geometric shapes (rounded arches, blurred blobs, diagonal bands, concentric circles), drop shadows, inner glows, depth-of-field.
- For "3d-hero" only: ONE photorealistic 3D-rendered object that signals the topic (e.g. a 3D laptop, glowing portal, brain sculpture, paper CV, stack of letter tiles). Studio-render quality, soft directional lighting. The object sits on ONE side of the canvas only.

WHAT THE IMAGE MUST NEVER CONTAIN:
- NO typography. NO letters, words, headlines, subheads, captions, taglines, watermarks, signatures.
- NO chip pills, badges, tags, or labelled buttons.
- NO human figures, faces, or character illustrations (real photos are composited separately).
- NO logos, brand marks, or wordmarks.
- NO starry skies, sparkle particles, or motion lines.
- NO cartoon, chibi, anime, Pixar/Disney aesthetic.

LAYOUT — leave defined empty zones for code overlays:
- For "photo-hero": leave the {photoSide} 50% of the canvas a clean gradient with NOTHING in it (no shapes, no objects). A real photograph will be composited there. The OPPOSITE 50% may contain soft background atmosphere (gradient + shapes) but NO typography or objects.
- For "3d-hero": the 3D object occupies ~45% of one side; the opposite side is a clean gradient with optional very subtle background shapes. Reserve the upper-left or upper-right area clear for headline typography overlay.
- For "infographic": the entire canvas is a soft brand-palette background gradient with subtle shapes. No focal object. The top third must be a quiet zone for headline overlay. The middle third is reserved for chip/card overlays.

OUTPUT FORMAT: single paragraph, 100-140 words. Describe ONLY the visual atmosphere of the background as instructed above. Do not mention typography, logos, or text under any circumstance.`;

const InputSchema = z.object({
  brandId: z.string().min(1),
  opportunity: z.object({
    keyword: z.string(),
    intent: z.string(),
    difficulty: z.string(),
    rationale: z.string(),
    contentAngle: z.string(),
  }),
  /** Optional format hint from the orchestrator, when provided the writer
   *  MUST use it instead of picking. Lets the weekly planner control the mix. */
  requestedFormat: z.enum(["single", "carousel"]).optional(),
});

export const runWriterAgent = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }): Promise<PostPlan> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const { openaiChatModel } = getServerConfig();

    const platformList = brand.platforms.join(", ");
    const platformRulesBlock = brand.platforms
      .map((p) => `- ${p}: hard cap ${PLATFORM_RULES[p].charLimit} chars, target ${PLATFORM_RULES[p].recommendedChars}, hashtags ${PLATFORM_RULES[p].minHashtags}-${PLATFORM_RULES[p].maxHashtags}`)
      .join("\n");

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();

    const userMsg = `Current date: ${todayIso} (year ${year}).
Use ${year} (or "this year") wherever you'd write a year. NEVER write 2023, 2024, or 2025 in any caption, title, slide, hashtag or image prompt, the current year is ${year}.

Brand: ${brand.name}
Industry: ${brand.industry}
Audience: ${brand.audience}
Tone of voice: ${brand.tone}
Brand colors (hex): ${(brand.colors ?? []).join(", ") || "neutral editorial palette"}

Brand visual style (BAKE INTO IMAGE PROMPTS VERBATIM):
${brand.visualStyle ?? "Clean editorial composition with bold typography and brand palette."}

Active platforms for this brand: ${platformList}
Per-platform rules:
${platformRulesBlock}

Opportunity:
- Keyword: ${data.opportunity.keyword}
- Intent: ${data.opportunity.intent}
- Angle: ${data.opportunity.contentAngle}
- Rationale: ${data.opportunity.rationale}

${
  data.requestedFormat
    ? `FORMAT IS LOCKED, you MUST output format = "${data.requestedFormat}". ${
        data.requestedFormat === "single"
          ? "Exactly 1 slide. Choose ONE strong focal element that carries the whole message, no numbered breakdown, no step list."
          : "Between 3 and 5 slides. Slide 0 is a cover slide with the topic title + chip tags; slides 1..n each cover ONE point/step/insight with its own clean focal element."
      }`
    : "Decide format (single vs carousel) consciously based on the opportunity."
}

Write the full plan now.`;

    const completion = await openai.chat.completions.create({
      model: openaiChatModel,
      response_format: { type: "json_object" },
      temperature: 0.85,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    // If the orchestrator locked a format, override whatever the model returned.
    if (data.requestedFormat) parsed.format = data.requestedFormat;
    const post = normaliseWriterOutput(parsed, brand.id, brand.platforms, data.opportunity as SeoOpportunity);
    // Safety-net: scrub any em-dashes / en-dashes the model leaked through.
    return cleanStringsDeep(post);
  });

// ---------- helpers ----------

function normaliseWriterOutput(
  parsed: Record<string, unknown>,
  brandId: string,
  brandPlatforms: Platform[],
  opportunity: PostPlan["opportunity"],
): PostPlan {
  const format = parsed.format === "carousel" ? "carousel" : "single";

  // Captions: only keep platforms the brand uses, trim to char limits.
  const captionsIn = (parsed.captions as Record<string, { text?: string; hashtags?: string[] }>) ?? {};
  const captions: CaptionsByPlatform = {};
  for (const p of brandPlatforms) {
    const c = captionsIn[p];
    if (!c) continue;
    const rule = PLATFORM_RULES[p];
    const text = String(c.text ?? "").slice(0, rule.charLimit);
    const tags = Array.isArray(c.hashtags) ? c.hashtags.map(String).map((t) => t.replace(/^#/, "").trim()).filter(Boolean) : [];
    captions[p] = { text, hashtags: tags.slice(0, rule.maxHashtags) };
  }

  // Slides
  const slidesIn = Array.isArray(parsed.slides) ? (parsed.slides as Record<string, unknown>[]) : [];
  const slides: PostSlide[] = slidesIn
    .slice(0, format === "carousel" ? 5 : 1)
    .map((s, i) => normaliseSlide(s, i));
  if (slides.length === 0) {
    slides.push({
      index: 0,
      slideTitle: String(parsed.title ?? "").slice(0, 60),
      slideBody: String(parsed.hook ?? ""),
      imagePrompt: String(parsed.imagePrompt ?? ""),
      graphicFormat: pickGraphicFormat(parsed.graphicFormat),
    });
  }

  // Belt-and-braces: the cover slide (index 0) is the hook — for ANY post (single
  // or carousel) it MUST be photo-hero unless the writer explicitly chose infographic
  // for a true list-only topic. This stops the model defaulting to safe 3d-hero covers.
  if (slides[0] && slides[0].graphicFormat === "3d-hero") {
    slides[0].graphicFormat = "photo-hero";
    if (!slides[0].heroPhotoQuery) {
      slides[0].heroPhotoQuery = inferPhotoQuery(slides[0].slideTitle, opportunity.keyword);
    }
    if (!slides[0].photoSide) slides[0].photoSide = "right";
  }

  // Belt-and-braces: append a strict "background only, no typography" clause to
  // every slide's imagePrompt. Typography is composited by code afterwards, not
  // rendered by the image model (which is unreliable at multi-text-element images).
  for (const s of slides) {
    s.imagePrompt = appendBackgroundOnlyClause(s.imagePrompt, s);
  }

  return {
    id: `${brandId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    opportunity,
    format,
    title: String(parsed.title ?? ""),
    hook: String(parsed.hook ?? ""),
    body: String(parsed.body ?? ""),
    captions,
    slides,
  };
}

function normaliseSlide(s: Record<string, unknown>, i: number): PostSlide {
  const graphicFormat = pickGraphicFormat(s.graphicFormat);
  return {
    index: i,
    slideTitle: String(s.slideTitle ?? "").slice(0, 80),
    slideBody: String(s.slideBody ?? ""),
    chipLabels: normaliseChipLabels(s.chipLabels),
    imagePrompt: String(s.imagePrompt ?? ""),
    graphicFormat,
    heroPhotoQuery: graphicFormat === "photo-hero" && typeof s.heroPhotoQuery === "string" && s.heroPhotoQuery ? s.heroPhotoQuery : undefined,
    photoSide: s.photoSide === "left" || s.photoSide === "right" ? s.photoSide : undefined,
    brandedTools: normaliseBrandedTools(s.brandedTools),
  };
}

function normaliseChipLabels(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return out.length ? out : undefined;
}

function normaliseBrandedTools(v: unknown): PostSlide["brandedTools"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => !!t)
    .map((t) => ({
      name: String(t.name ?? "").trim(),
      domain: String(t.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    }))
    .filter((t) => t.name && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(t.domain))
    .slice(0, 4);
  return out.length ? out : undefined;
}

function pickGraphicFormat(v: unknown): GraphicFormat {
  return v === "photo-hero" || v === "3d-hero" || v === "infographic" ? v : "3d-hero";
}

/** Final clause appended to every image prompt: hard "background only" guard.
 *  Typography is composited as real SVG text afterwards. */
function appendBackgroundOnlyClause(prompt: string, slide: PostSlide): string {
  const photoConstraint =
    slide.graphicFormat === "photo-hero" && slide.photoSide
      ? `Leave the ${slide.photoSide} 50% of the canvas an absolutely clean gradient with NOTHING in it (no shapes, no objects, no text). A real photograph will be composited there by code.`
      : slide.graphicFormat === "3d-hero"
      ? "Reserve the upper-left third as a quiet gradient zone for headline overlay text. The 3D object should sit on the right side."
      : "Leave the upper third and middle third of the canvas as quieter gradient zones; headline and chip overlays will be added there.";

  return `${prompt.trim()}

ABSOLUTE BACKGROUND-ONLY RULES (NON-NEGOTIABLE):
The generated image is a BACKGROUND ONLY. Code will composite all typography, chips, logos, and (for photo-hero) the human photograph on top afterwards.
- NO typography of any kind. NO letters, words, headlines, captions, taglines, watermarks. If you generate any text in the image, the design fails.
- NO chips, badges, or pills. NO logos or brand marks. NO human figures or character illustrations.
- ${photoConstraint}`;
}

/** Fallback Pexels query when the writer dropped one for a photo-hero slide. */
function inferPhotoQuery(slideTitle: string, keyword: string): string {
  const blob = `${slideTitle} ${keyword}`.toLowerCase();
  if (/intern|career|graduate|cv|resume|recruit|hire/.test(blob)) return "young professional smiling laptop";
  if (/network|team|meeting|collab/.test(blob)) return "diverse team office meeting";
  if (/skill|learn|study|study/.test(blob)) return "student studying laptop coffee";
  if (/interview/.test(blob)) return "confident professional handshake interview";
  return "young professional confident portrait";
}
