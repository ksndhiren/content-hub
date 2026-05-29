export type Platform = "Instagram" | "LinkedIn" | "Facebook" | "X" | "YouTube Shorts";
export type PostStatus = "Draft" | "Needs Review" | "Approved" | "Scheduled" | "Published";
export type AgentStatus = "Idle" | "Running" | "Completed" | "Failed";
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
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  lastRun: string;
  output: string;
}

export interface PlatformMetrics {
  platform: Platform;
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  engagementRate: number;
  clicks: number;
  bestPost: string;
  growth: number;
}

export interface SocialAccount {
  platform: Platform;
  handle: string;
  status: "Connected" | "Not Connected" | "Needs Reauth";
}

const gradients = ["gradient-1", "gradient-2", "gradient-3", "gradient-4", "gradient-5", "gradient-6"];

export const initialBrands: Brand[] = [
  {
    id: "internwise",
    name: "Internwise",
    industry: "EdTech / Careers",
    audience: "Students & early-career professionals",
    tone: "Encouraging, practical",
    platforms: ["Instagram", "LinkedIn", "X"],
    weeklyVolume: 7,
    status: "Active",
    gradient: "gradient-1",
    initials: "IW",
    website: "internwise.co.uk",
  },
  {
    id: "cranes",
    name: "Cranes Auctions",
    industry: "Industrial Auctions",
    audience: "Buyers & sellers of heavy equipment",
    tone: "Authoritative, direct",
    platforms: ["LinkedIn", "Facebook", "YouTube Shorts"],
    weeklyVolume: 5,
    status: "Active",
    gradient: "gradient-6",
    initials: "CA",
  },
  {
    id: "golf-carts",
    name: "Golf Carts Auctions",
    industry: "Vehicle Auctions",
    audience: "Golf course operators & resellers",
    tone: "Friendly, informative",
    platforms: ["Instagram", "Facebook", "YouTube Shorts"],
    weeklyVolume: 6,
    status: "Active",
    gradient: "gradient-2",
    initials: "GC",
  },
  {
    id: "open-door",
    name: "Open Door Centre",
    industry: "Mental Health Charity",
    audience: "Young adults & families",
    tone: "Warm, supportive",
    platforms: ["Instagram", "Facebook", "LinkedIn"],
    weeklyVolume: 8,
    status: "Active",
    gradient: "gradient-5",
    initials: "OD",
  },
  {
    id: "jeff-martin",
    name: "Jeff Martin Auctioneers",
    industry: "Industrial Auctions",
    audience: "Contractors & dealers",
    tone: "Confident, professional",
    platforms: ["LinkedIn", "Facebook", "X"],
    weeklyVolume: 6,
    status: "Active",
    gradient: "gradient-3",
    initials: "JM",
  },
];

export const weeks = [
  "Week of Jun 2, 2026",
  "Week of May 26, 2026",
  "Week of May 19, 2026",
  "Week of May 12, 2026",
];

const overlays = [
  "5 Tips for Landing Your First Internship",
  "Why Your CV Needs a Story",
  "Auction Highlights This Week",
  "Behind the Bid",
  "Mental Health Matters",
  "Small Steps, Big Change",
  "What Recruiters Really Want",
  "Top 3 Lots of the Week",
  "How to Stand Out in 2026",
  "Community Voices",
];

const objectives = ["Drive engagement", "Build awareness", "Generate leads", "Educate audience", "Promote event"];
const keywords = [
  "first internship",
  "cv writing tips",
  "industrial auction",
  "fleet equipment",
  "youth mental health",
  "graduate jobs",
  "career advice",
  "auction calendar",
  "golf cart sale",
  "support resources",
];
const statuses: PostStatus[] = ["Draft", "Needs Review", "Approved", "Scheduled", "Published", "Needs Review", "Approved"];

function pseudoRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    h = (h * 1103515245 + 12345) | 0;
    return Math.abs(h) / 2147483647;
  };
}

function buildGraphics(): Graphic[] {
  const out: Graphic[] = [];
  for (const brand of initialBrands) {
    for (const week of weeks) {
      const rand = pseudoRandom(brand.id + week);
      const count = Math.max(4, Math.round(brand.weeklyVolume * (0.6 + rand() * 0.6)));
      for (let i = 0; i < count; i++) {
        const overlay = overlays[Math.floor(rand() * overlays.length)];
        const keyword = keywords[Math.floor(rand() * keywords.length)];
        const platforms = brand.platforms.slice(0, 1 + Math.floor(rand() * brand.platforms.length));
        const baseCaption = `${overlay} — practical takeaways your audience will actually use. Tap in for more.`;
        out.push({
          id: `${brand.id}-${week}-${i}`,
          brandId: brand.id,
          week,
          title: overlay,
          platforms,
          caption: baseCaption,
          captionsByPlatform: Object.fromEntries(
            platforms.map((p) => [p, `[${p}] ${baseCaption}`])
          ),
          hashtags: ["#" + keyword.replace(/\s+/g, ""), "#weeklycontent", "#" + brand.name.replace(/\s+/g, "")],
          prompt: `Editorial flat illustration, soft gradient background, bold typography overlay reading "${overlay}", brand palette, minimal composition, 1:1 aspect ratio.`,
          objective: objectives[Math.floor(rand() * objectives.length)],
          audience: brand.audience,
          keyword,
          status: statuses[Math.floor(rand() * statuses.length)],
          gradient: gradients[Math.floor(rand() * gradients.length)],
          overlay,
          tone: brand.tone,
          lastEdited: `${1 + Math.floor(rand() * 6)}d ago`,
        });
      }
    }
  }
  return out;
}

export const initialGraphics = buildGraphics();

export const initialAgents: Agent[] = [
  {
    id: "gap-finder",
    name: "Gap Finder",
    role: "Finds missing content topics, competitor gaps and audience questions.",
    status: "Completed",
    lastRun: "2h ago",
    output: "Identified 14 untouched topics across 3 competitors. Top gap: long-form interview clips.",
  },
  {
    id: "keyword",
    name: "Keyword Opportunity",
    role: "Surfaces search-friendly and social-friendly topic ideas.",
    status: "Completed",
    lastRun: "2h ago",
    output: "27 opportunity keywords found. Highest intent: 'graduate scheme advice'.",
  },
  {
    id: "writer",
    name: "Content Writer",
    role: "Writes post concepts, captions, hooks and platform variations.",
    status: "Running",
    lastRun: "Now",
    output: "Drafting captions for 7 posts. 4 of 7 complete.",
  },
  {
    id: "prompt",
    name: "Prompt Engineer",
    role: "Converts content ideas into detailed graphic generation prompts.",
    status: "Idle",
    lastRun: "1h ago",
    output: "Awaiting writer output. 0 prompts queued.",
  },
  {
    id: "graphic",
    name: "Graphic Generator",
    role: "Sends prompts to image generation and returns weekly graphics.",
    status: "Idle",
    lastRun: "1h ago",
    output: "Last batch: 7 graphics generated successfully.",
  },
  {
    id: "review",
    name: "Review Assistant",
    role: "Flags low-quality captions, weak hooks, spelling and brand mismatch.",
    status: "Idle",
    lastRun: "3h ago",
    output: "Flagged 2 captions for weak hooks. Suggested rewrites attached.",
  },
];

export function buildPerformance(brandId: string): PlatformMetrics[] {
  const rand = pseudoRandom(brandId + "perf");
  const platforms: Platform[] = ["Instagram", "LinkedIn", "Facebook", "X", "YouTube Shorts"];
  return platforms.map((p) => ({
    platform: p,
    followers: Math.round(2000 + rand() * 40000),
    reach: Math.round(5000 + rand() * 80000),
    impressions: Math.round(8000 + rand() * 120000),
    engagement: Math.round(200 + rand() * 5000),
    engagementRate: +(1 + rand() * 6).toFixed(2),
    clicks: Math.round(100 + rand() * 2000),
    bestPost: overlays[Math.floor(rand() * overlays.length)],
    growth: +(rand() * 12 - 2).toFixed(1),
  }));
}

export function buildEngagementTrend(brandId: string) {
  const rand = pseudoRandom(brandId + "trend");
  return ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"].map((w) => ({
    week: w,
    engagement: Math.round(500 + rand() * 2500),
    reach: Math.round(2000 + rand() * 10000),
  }));
}

export function buildContentTypes(brandId: string) {
  const rand = pseudoRandom(brandId + "types");
  return [
    { type: "Tips", value: Math.round(40 + rand() * 60) },
    { type: "Stories", value: Math.round(30 + rand() * 50) },
    { type: "Lists", value: Math.round(25 + rand() * 45) },
    { type: "Quotes", value: Math.round(20 + rand() * 40) },
    { type: "News", value: Math.round(15 + rand() * 35) },
  ];
}

export const initialSocialAccounts: SocialAccount[] = [
  { platform: "Instagram", handle: "@yourbrand", status: "Connected" },
  { platform: "LinkedIn", handle: "Your Brand Page", status: "Connected" },
  { platform: "Facebook", handle: "Your Brand", status: "Needs Reauth" },
  { platform: "X", handle: "@yourbrand", status: "Not Connected" },
  { platform: "YouTube Shorts", handle: "Your Brand", status: "Connected" },
];

export const pipelineStages: { name: string; status: StageStatus }[] = [
  { name: "Keyword Research", status: "Completed" },
  { name: "Content Writing", status: "Completed" },
  { name: "Prompt Creation", status: "In Progress" },
  { name: "Graphic Generation", status: "Pending" },
  { name: "Review", status: "Needs Review" },
  { name: "Approved", status: "Pending" },
  { name: "Scheduled", status: "Pending" },
];

export const platformIconColor: Record<Platform, string> = {
  Instagram: "bg-pink-100 text-pink-700",
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
