// Core shared types + brand seed.
// All mock/demo content has been removed, the app now starts empty until
// real content is produced by the agent pipeline or pulled in from connected
// social channels via the backend.

export type Platform = "Instagram" | "Threads" | "LinkedIn" | "Facebook" | "X" | "YouTube Shorts";
export type PostStatus = "Draft" | "Needs Review" | "Approved" | "Scheduled" | "Published";
export type StageStatus = "Completed" | "In Progress" | "Pending" | "Needs Review";

export interface Brand {
  id: string;
  name: string;
  industry: string;
  audience: string;
  tone: string;
  platforms: Platform[];
  weeklyVolume: number;
  status: "Active" | "Paused";
  gradient: string;
  initials: string;
  website?: string;
  notes?: string;
  colors?: string[];
  /** Path under /public to the brand logo PNG (e.g. /brands/internwise.png). */
  logoUrl?: string;
  /** Free-text visual style prompt passed to the writer/graphic agents.
   *  Describe palette, characters, type treatment, mood, props, anything
   *  the AI should bake into every image for this brand. */
  visualStyle?: string;
  /** Display font family. Maps to a WOFF2 file under /public/fonts/{font}.woff2.
   *  Currently supported: "inter", "manrope", "dmsans". */
  font?: "inter" | "manrope" | "dmsans";
}

export interface Graphic {
  id: string;
  brandId: string;
  week: string;
  title: string;
  platforms: Platform[];
  caption: string;
  captionsByPlatform: Partial<Record<Platform, string>>;
  hashtags: string[];
  prompt: string;
  objective: string;
  audience: string;
  keyword: string;
  status: PostStatus;
  gradient: string;
  overlay: string;
  tone: string;
  lastEdited: string;
  imageUrl?: string;       // raw generated image (data URL or hosted URL)
  composedSvg?: string;    // SVG with brand logo composited at best position
}

export interface SocialAccount {
  platform: Platform;
  handle: string;
  status: "Connected" | "Not Connected" | "Needs Reauth";
}

// Brand seed. In production these come from the backend; brand creation is
// an admin / backend action and is intentionally NOT exposed in the UI.
export const initialBrands: Brand[] = [
  {
    id: "internwise",
    name: "Internwise",
    industry: "EdTech / Careers",
    audience: "University students & graduates aged 18-24 looking for internships and first jobs",
    tone: "Smart, confident, peer-to-peer, like an older sibling who's been there. Encouraging but not patronising.",
    platforms: ["Instagram", "LinkedIn", "X"],
    weeklyVolume: 7,
    status: "Active",
    gradient: "gradient-1",
    initials: "IW",
    website: "internwise.co.uk",
    colors: ["#1e3a8a", "#fbbf24"],
    logoUrl: "/brands/internwise.png",
    font: "inter",
    visualStyle:
      "Sophisticated young-adult editorial graphic, Instagram-feed quality, aimed at 18-24 year-old uni students and graduates, NOT children. Build the design from CLEAN GEOMETRY: smooth deep-navy gradient backgrounds (#0b1f4a → #1e3a8a, or #1e3a8a → #4f46e5), soft-edged abstract shapes (rounded arches, blurred blobs, diagonal bands, concentric circles, soft squircles) layered with subtle drop shadows and inner-glow lighting for depth. Bright accent palette: warm sunshine yellow (#fbbf24), tangerine orange (#f97316), mint (#34d399). Hero element options (pick ONE per image): (a) a real photograph of a young adult (late teens to mid-twenties), handled by code, do not draw a person; OR (b) a clean photorealistic 3D-rendered object (a stylised brain, a glowing arch portal, a stack of letter tiles, a minimalist 3D laptop, a graduation cap, a paper CV with a stamp). 3D objects: Octane/Cycles studio-render quality, soft directional lighting, slight depth-of-field. Bold modern sans-serif display typography baked in: 1-4 key words, with solid-colour highlight blocks behind 1-2 of those words for emphasis. Small rounded pill-shaped chips with short label words. Reserve ~22% of one corner as quiet negative space for a logo overlay. STRICT RULES, DO NOT INCLUDE: starry backgrounds, star/sparkle particle accents, animated GIF-style motion lines, chibi/anime/cartoon faces, Pixar/Disney aesthetic, kids-book pastel palette, oversized cute eyes. The vibe is premium static editorial, Linear/Notion/Apple marketing crossed with Gen-Z LinkedIn.",
  },
  {
    id: "reportingwise",
    name: "Reportingwise",
    industry: "B2B SaaS / Analytics",
    audience: "Operations, finance and data teams",
    tone: "Clear, expert, no-jargon",
    platforms: ["LinkedIn", "X"],
    weeklyVolume: 5,
    status: "Active",
    gradient: "gradient-3",
    initials: "RW",
    website: "reportingwise.com",
    colors: ["#0f766e", "#0d3b66"],
    logoUrl: "/brands/reportingwise.png",
    font: "manrope",
    visualStyle:
      "Clean B2B SaaS editorial style. Calm teal and deep-navy palette with subtle data-viz motifs (sparkline curves, dashboard cards, donut fragments) as decorative background elements. Confident modern sans-serif typography with one colour highlight block. Minimal 3D iconography (chart icons, monitor frames). Plenty of negative space, feels expert, no-jargon, trustworthy. Reserve ~22% of one corner quiet for a logo overlay.",
  },
  {
    id: "flora-hr",
    name: "Flora HR",
    industry: "HR Tech",
    audience: "HR leaders & people ops teams at SMEs",
    tone: "Warm, modern, human",
    platforms: ["LinkedIn", "Instagram", "Facebook"],
    weeklyVolume: 6,
    status: "Active",
    gradient: "gradient-5",
    initials: "FH",
    website: "florahr.com",
    colors: ["#16a34a", "#064e3b"],
    logoUrl: "/brands/flora-hr.png",
    font: "dmsans",
    visualStyle:
      "Warm, modern HR-tech editorial style. Soft sage-green and cream palette with botanical leaf accents and organic shapes. Friendly bold sans-serif typography with rounded italic emphasis and pill-shaped highlight chips. 3D-rendered diverse character or hand-drawn props (a plant, a calendar, a smiling person at a desk). Inviting, human, not corporate. Reserve ~22% of one corner quiet for a logo overlay.",
  },
];

// Weeks helper, generates the current and previous 3 ISO weeks dynamically.
export const weeks: string[] = (() => {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday of current week
  for (let i = 0; i < 4; i++) {
    const start = new Date(d);
    start.setDate(d.getDate() - i * 7);
    out.push(`Week of ${start.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}`);
  }
  return out;
})();

export const platformIconColor: Record<Platform, string> = {
  Instagram: "bg-pink-100 text-pink-700",
  Threads: "bg-neutral-900 text-white",
  LinkedIn: "bg-blue-100 text-blue-700",
  Facebook: "bg-indigo-100 text-indigo-700",
  X: "bg-neutral-900 text-white",
  "YouTube Shorts": "bg-red-100 text-red-700",
};

export const statusColor: Record<PostStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  "Needs Review": "bg-amber-100 text-amber-800",
  Approved: "bg-emerald-100 text-emerald-800",
  Scheduled: "bg-blue-100 text-blue-800",
  Published: "bg-violet-100 text-violet-800",
};

export const stageColor: Record<StageStatus, string> = {
  Completed: "bg-emerald-100 text-emerald-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Pending: "bg-muted text-muted-foreground",
  "Needs Review": "bg-amber-100 text-amber-800",
};
