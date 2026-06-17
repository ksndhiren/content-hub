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
  /** Short call-to-action shown in the outro footer (e.g. "Apply now", "Start free"). */
  cta?: string;
  /** Competitor brands the SEO + competitor-scan agents should monitor. Domains
   *  are used directly in web search queries; titles are display labels. */
  competitors?: { name: string; domain: string }[];
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
    audience: "Gen Z (18-24) — UK university students, graduates, early job seekers looking for internships and first jobs. Mobile-first, social-native, sceptical of corporate-speak, expect speed and substance.",
    tone: "Smart, confident, peer-to-peer, like an older sibling who's been there. Encouraging but not patronising.",
    platforms: ["Instagram", "LinkedIn", "X"],
    weeklyVolume: 7,
    status: "Active",
    gradient: "gradient-1",
    initials: "IW",
    website: "www.internwise.co.uk",
    colors: ["#1e3a8a", "#fbbf24"],
    logoUrl: "/brands/internwise.png",
    font: "inter",
    cta: "Apply now",
    competitors: [
      { name: "Save the Student", domain: "savethestudent.org" },
      { name: "Bright Network", domain: "brightnetwork.co.uk" },
      { name: "Prospects", domain: "prospects.ac.uk" },
      { name: "RateMyApprenticeship", domain: "ratemyapprenticeship.co.uk" },
    ],
    visualStyle:
      "Internwise is an editorial Gen-Z careers brand, the visual register sits between Apple/Linear marketing, Kinfolk/Pop magazine spreads, and high-end Instagram infographic accounts (visualscapital, chartr, futurism). Pick a different lane PER SLIDE — do not repeat: dark navy editorial, ivory + ink, full-bleed portrait, oversized number infographic, magazine-cover style, 3D still life, flat vector explainer, photoreal documentary, brutalist type poster, dusty-rose minimal. Brand palette (pull two per slide, ROTATE): deep navy #0b1f4a, sunshine yellow #fbbf24, tangerine #f97316, mint #34d399, coral #ef4444, ivory #faf6ee, ink #111111. Typography vibe to vary: modern editorial serif (Saol/Tiempos), brutalist condensed sans, handwritten accent, classic grotesque. Subjects, when human, are real 18-24-year-old students/graduates — mix ethnicities, vibes, settings every slide. Always reserve a clean ~22% top-left square as quiet space for the logo overlay. NEVER include: starry skies, sparkle particles, lens flares, chibi/anime, Pixar/Disney aesthetic, motivational stock-photo poses (high-fives, suits pointing at charts), watermarks, fake logos, illegible text, gen-AI uncanny perfection.",
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
    website: "www.reportingwise.com",
    colors: ["#0f766e", "#0d3b66"],
    logoUrl: "/brands/reportingwise.png",
    font: "manrope",
    cta: "Get started",
    competitors: [
      { name: "Tableau", domain: "tableau.com" },
      { name: "Looker", domain: "looker.com" },
      { name: "Sisense", domain: "sisense.com" },
    ],
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
    website: "www.florahr.com",
    colors: ["#16a34a", "#064e3b"],
    logoUrl: "/brands/flora-hr.png",
    font: "dmsans",
    cta: "Book a demo",
    competitors: [
      { name: "BambooHR", domain: "bamboohr.com" },
      { name: "Personio", domain: "personio.com" },
      { name: "HiBob", domain: "hibob.com" },
    ],
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
