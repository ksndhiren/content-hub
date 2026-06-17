// Shared agent types, safe for both client and server (no server-only imports).
import type { Platform } from "../mock-data";

export interface BrandBrief {
  id: string;
  name: string;
  industry: string;
  audience: string;
  tone: string;
  website?: string;
  colors?: string[];
  initials: string;
}

export interface SeoOpportunity {
  keyword: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  difficulty: "low" | "medium" | "high";
  rationale: string;
  contentAngle: string;
}

export interface SeoSource {
  title: string;
  url: string;
}

export interface SeoAgentOutput {
  brandId: string;
  generatedAt: string;
  summary: string;
  opportunities: SeoOpportunity[];
  /** URLs the search-enabled model cited. Empty when web search is unavailable. */
  sources: SeoSource[];
  /** When web search step failed, the raw OpenAI error message. */
  searchError?: string;
}

// ---------- per-platform captions ----------

/** Hard caps and best-practice hashtag counts the writer is asked to respect.
 *  Update here if a platform changes its rules. */
export const PLATFORM_RULES: Record<Platform, { charLimit: number; recommendedChars: number; minHashtags: number; maxHashtags: number }> = {
  Instagram:        { charLimit: 2200,  recommendedChars: 150,  minHashtags: 3, maxHashtags: 5 },
  Threads:          { charLimit: 500,   recommendedChars: 400,  minHashtags: 0, maxHashtags: 2 },
  LinkedIn:         { charLimit: 3000,  recommendedChars: 1200, minHashtags: 3, maxHashtags: 5 },
  Facebook:         { charLimit: 63206, recommendedChars: 80,   minHashtags: 0, maxHashtags: 2 },
  X:                { charLimit: 280,   recommendedChars: 270,  minHashtags: 0, maxHashtags: 2 },
  "YouTube Shorts": { charLimit: 100,   recommendedChars: 95,   minHashtags: 1, maxHashtags: 3 },
};

export interface PlatformCaption {
  text: string;        // body copy (NO hashtags inline)
  hashtags: string[];  // tags without # symbol
}

export type CaptionsByPlatform = Partial<Record<Platform, PlatformCaption>>;

// ---------- slide / post / plan ----------

export type GraphicFormat = "photo-hero" | "3d-hero" | "infographic";

/** Layout templates the SVG composer can render. Each variant has a very
 *  different visual structure, so the weekly feed doesn't look like one template
 *  with different photos.
 *
 *  - split-portrait → headline column on one side, AI image on the other (current default)
 *  - stat-spotlight → giant number/percent dominates, supporting label below
 *  - checklist     → headline top, 3-5 numbered card-rows in centre (true infographic)
 *  - comparison    → two columns side-by-side with values (vs / before-after)
 *  - quote         → centred pull quote with small attribution
 *  - timeline      → 3-step horizontal flow with arrows
 */
export type LayoutVariant =
  // New design-system layouts (match the Internwise reference deck)
  | "hero-arch"          // big headline + accent word + arched corner photo (covers, outros, "the brutal job market")
  | "stat-cards"         // eyebrow + headline + vertical stack of 2-3 stat cards + arched photo
  | "bar-rows"           // eyebrow + headline + 3 horizontal rows (vs comparison) + bottom tagline
  | "category-list"      // eyebrow + headline + 3 vertical category cards + arched photo
  | "split-stats"        // eyebrow + headline + 2 huge stat boxes side-by-side + tagline
  | "quote"              // centred pull quote (kept as-is)
  // Legacy variants kept so old saved plans still render
  | "split-portrait"
  | "stat-spotlight"
  | "checklist"
  | "comparison"
  | "timeline";

export interface BrandedTool {
  /** Display name, e.g. "Zoom". */
  name: string;
  /** Root domain used for logo fetch, e.g. "zoom.us". */
  domain: string;
}

/** Subtype tells the composer which palette role to use for an accent. */
export type AccentTone = "positive" | "negative" | "neutral" | "highlight";

export interface PostSlide {
  index: number;
  /** Small uppercase eyebrow label above headline (e.g. "THE REALITY", "THE GAP"). */
  eyebrow?: string;
  /** Optional pill chip top-right (e.g. "2026 MARKET"). */
  cornerBadge?: string;
  /** 1-2 words in the headline to style differently (italic + accent). */
  accentWord?: string;
  /** Tone of the accent word — drives colour. */
  accentTone?: AccentTone;
  /** Final italic line at the bottom (e.g. "That's the bad news. Here's the good news."). */
  bottomTagline?: string;
  /** Same accent rule applied to bottomTagline. */
  bottomTaglineAccent?: string;
  /** What sits on the hero shape:
   *  "human"   → Pexels search + local bg-removal (real student/professional)
   *  "object"  → OpenAI image with transparent background (3D CV, calendar, clock, books)
   *  "none"    → no cutout, pure data + decoration */
  heroSubjectType?: "human" | "object" | "none";
  /** Used when heroSubjectType = "object". A specific 3D-render-style prompt
   *  for the object (e.g. "3D rendered paper CV with red REJECTED stamp,
   *  studio lighting, isolated on transparent background"). */
  heroObjectPrompt?: string;
  /** The big bold headline rendered ON the image. Must be a SPECIFIC claim,
   *  stat, hook or insight — not just the topic name. 3-6 words. */
  slideTitle: string;
  /** The subhead rendered under the headline ON the image. 6-12 words.
   *  Adds the concrete value behind the headline. */
  slideBody: string;
  /** Substantive chip labels rendered as pills on the image. Carry real
   *  information (e.g. "£45k starting", "Python required", "Remote-friendly"),
   *  NOT generic decoration ("Real experience", "High paying"). 2-4 chips. */
  chipLabels?: string[];
  /** Prompt fed to gpt-image for this slide. */
  imagePrompt: string;
  graphicFormat: GraphicFormat;
  heroPhotoQuery?: string;
  photoSide?: "left" | "right";
  /** External tool/product brands mentioned by this slide. Their real logos
   *  get fetched and composited as chips so the AI doesn't have to fake them. */
  brandedTools?: BrandedTool[];
  /** Which composer layout to render. When omitted, the composer treats it as "split-portrait". */
  layoutVariant?: LayoutVariant;
  /** For stat-spotlight layout: the headline number to render huge (e.g. "16%", "£45k", "7×"). */
  bigStat?: string;
  /** For stat-spotlight layout: the small label under the big number (e.g. "of applicants get hired"). */
  bigStatLabel?: string;
  /** For comparison layout: left and right column data. */
  comparison?: { leftLabel: string; leftValue: string; rightLabel: string; rightValue: string };
  /** Multiple ranked rows for "bar-rows" layout (matches the "Big corporate / Mid / Entry" reference).
   *  The row with `winning: true` is highlighted in the positive-tone accent. */
  barRows?: { label: string; value: string; tone: AccentTone; winning?: boolean }[];
  /** Stat cards for "stat-cards" layout (matches the "140 applications / 7% fewer" reference). */
  statCards?: { value: string; label: string; tone: AccentTone }[];
  /** Category cards for "category-list" layout (matches the "AI / Health / Infrastructure" reference). */
  categoryCards?: { title: string; subtitle: string; tone: AccentTone }[];
  /** For quote layout: optional attribution under the quote. */
  quoteAttribution?: string;
}

export interface PostPlan {
  id: string;
  opportunity: SeoOpportunity;
  format: "single" | "carousel";
  /** Post-level title (caption headline). */
  title: string;
  hook: string;
  body: string;
  /** Per-platform captions sized to each platform's limit. */
  captions: CaptionsByPlatform;
  /** 1 slide for single, 3-5 for carousel. */
  slides: PostSlide[];
}

export interface CompetitorMove {
  competitor: string;
  domain: string;
  topic: string;
  publishedAround: string;
  url: string;
  summary: string;
}

export interface SpottedBrand {
  name: string;
  domain: string;
  reason: string; // why we think this is a real competitor (1 line)
}

export interface CompetitorScanOutput {
  brandId: string;
  generatedAt: string;
  summary: string;
  moves: CompetitorMove[];
  gaps: string[];
  sources: { title: string; url: string }[];
  /** New brands the model noticed publishing similar content. Auto-merged into the watch list. */
  spottedBrands: SpottedBrand[];
  /** Visual-design trends extracted from competitor OG/hero images. Feeds the
   *  writer's imagePrompt so our designs ride relevant trend axes while
   *  deliberately differentiating. Undefined when no images could be read. */
  designIntel?: DesignIntel;
  searchError?: string;
}

export interface DesignIntel {
  /** 2-4 short observations of what competitors are doing visually right now. */
  trends: string[];
  /** 1-3 sentences naming the same trend axis but inverting it, so the writer
   *  has concrete "do the opposite" direction (e.g. "they're all dark navy + brutalist
   *  serif → go ivory + condensed sans"). */
  differentiate: string;
  /** URLs of competitor images the model actually read, kept for debugging. */
  observedFrom: string[];
}

export interface WeeklyPlan {
  brandId: string;
  week: string;
  generatedAt: string;
  seoSummary: string;
  sources: SeoSource[];
  searchError?: string;
  posts: PostPlan[];
  /** Optional competitor scan that fed into this plan. Saved alongside the plan. */
  competitorScan?: CompetitorScanOutput;
}

// ---------- graphic agent output ----------

export type LogoPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface LogoPositionScore {
  position: LogoPosition;
  score: number;
  reason: string;
}

export interface LogoPlacement {
  x: number;
  y: number;
  width: number;
}

export type LogoVariant = "default" | "white";

export interface PexelsPhotoInfo {
  url: string;
  pageUrl: string;
  photographer: string;
  photographerUrl: string;
  alt: string;
  side: "left" | "right";
}

export interface BrandedToolChip {
  name: string;
  domain: string;
  /** Base64 data URL of the fetched logo, or null when fetch failed. */
  logoDataUrl: string | null;
}

export interface GraphicAgentOutput {
  brandId: string;
  imagePrompt: string;
  imageBase64: string;
  positionScores: LogoPositionScore[];
  bestPosition: LogoPosition;
  /** Fully composed SVG including the logo at the AI-chosen position. */
  composedSvg: string;
  /** Same composition but WITHOUT the logo, so the client can overlay a draggable logo on top. */
  baseSvg: string;
  logos: Partial<Record<LogoVariant, { dataUrl: string; aspectRatio: number }>>;
  recommendedVariant: LogoVariant;
  initialPlacement: LogoPlacement;
  brandedToolChips?: BrandedToolChip[];
}
