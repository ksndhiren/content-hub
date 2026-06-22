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
  /** Public URL of the brand's favicon, used as the small in-app brand icon
   *  (sidebar, brand picker, dashboard hero). Falls back to gradient+initials. */
  iconUrl?: string;
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
    colors: ["#1f4789", "#3eb5e4", "#ff9a60"],
    logoUrl: "https://internwise.com/logo-horizontal.png",
    iconUrl: "https://www.google.com/s2/favicons?domain=internwise.com&sz=128",
    font: "inter",
    cta: "Apply now",
    competitors: [
      { name: "Save the Student", domain: "savethestudent.org" },
      { name: "Bright Network", domain: "brightnetwork.co.uk" },
      { name: "Prospects", domain: "prospects.ac.uk" },
      { name: "RateMyApprenticeship", domain: "ratemyapprenticeship.co.uk" },
    ],
    visualStyle:
      "Internwise designs in a bold cobalt-blue editorial / social-commentary lane (think the kind of confident, slightly playful career-advice carousels that perform well on Instagram and LinkedIn). Every slide leans into ONE visible idea, big and unmissable. SIGNATURE ELEMENTS — use most of these on every slide: (1) Cobalt-blue background (#2b48e0) as the dominant ground, sometimes paired with a crumpled-paper / cream texture on outro slides. (2) Big bold WHITE typography in a heavy modern geometric sans (PP Neue Montreal Bold / Söhne Breit / Inter Display Black vibe), large enough to fill 40-60% of the canvas. (3) 1-3 KEY WORDS in the text are highlighted by a solid coloured RECTANGLE BLOCK behind them — yellow #FFD43B for positive/curious accents, coral/red #ef4444 for tension, cream #faf6ee for emphasis. The rectangle hugs the letter cap-heights tightly. (4) A photo collage or single cutout subject — real photographs of young adults (vary ethnicity, ages 18-24, expressive faces) with their backgrounds removed, combined with surreal props (an oversized traffic cone over the head, scrabble letter tiles spelling a word, a paper money loop, polaroid frames, phone-shaped mockups, alarm clocks, sticky notes). (5) Hand-drawn or paper-cut burst shapes (yellow stars, jagged starbursts, halftone dot bursts) BEHIND the cutout subject for emphasis. (6) Oversized pull-quote marks (huge 99 / 66) as graphic punctuation when the text reads like a quote. Subjects are NEVER full-frame slick stock photos — they're cutouts on the cobalt ground, often slightly tilted or breaking out of a shape. Reserve ~22% top-left as a quiet square for the logo overlay added by code. NEVER include: starry skies, sparkle particles, lens flares, chibi/anime, Pixar/Disney, generic motivational stock photos (high-fives, suits pointing at charts), watermarks, fake brand logos, illegible tiny text, pill chips, source lines, gen-AI uncanny faces.",
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
    colors: ["#1d2734", "#e6cf60"],
    logoUrl: "https://reportingwise.com/logo.svg",
    iconUrl: "https://www.google.com/s2/favicons?domain=reportingwise.com&sz=128",
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
    website: "www.flora-hr.co.uk",
    colors: ["#2c5826", "#d5a952"],
    logoUrl: "https://www.flora-hr.co.uk/logo.png",
    iconUrl: "https://www.google.com/s2/favicons?domain=flora-hr.co.uk&sz=128",
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

// Weeks helper. Returns ONLY the current working week. We roll over to the
// NEXT week's Monday on Sunday, so Monday-morning users land on the new week.
// Mon-Sat → this Monday. Sun → next Monday.
export const weeks: string[] = (() => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = today.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  const offsetToMon = (dow + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - offsetToMon);
  if (dow === 0) monday.setUTCDate(monday.getUTCDate() + 7);
  return [`Week of ${monday.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`];
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
