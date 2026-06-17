import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runSeoAgent } from "./seo-agent.server";
import { runWriterAgent } from "./writer-agent.server";
import { runCompetitorScan } from "./competitor-agent.server";
import { mergeSpottedBrands } from "./competitor-store.server";
import { initialBrands } from "../mock-data";
import type { WeeklyPlan, SeoOpportunity, CompetitorScanOutput } from "./types";
import { cleanStringsDeep } from "./text-cleanup";

/** Regenerate a single post from a new opportunity / angle. The caller passes
 *  a fresh keyword + angle and (optionally) which format to lock. The writer
 *  produces a new PostPlan that replaces the original on the client / on disk. */
export const replacePost = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      brandId: z.string().min(1),
      keyword: z.string().min(1),
      contentAngle: z.string().min(1),
      rationale: z.string().optional(),
      intent: z.enum(["informational", "commercial", "transactional", "navigational"]).default("informational"),
      difficulty: z.enum(["low", "medium", "high"]).default("medium"),
      requestedFormat: z.enum(["single", "carousel"]).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const post = await runWriterAgent({
      data: {
        brandId: data.brandId,
        opportunity: {
          keyword: data.keyword,
          contentAngle: data.contentAngle,
          rationale: data.rationale ?? "Manually requested replacement.",
          intent: data.intent,
          difficulty: data.difficulty,
        },
        requestedFormat: data.requestedFormat,
      },
    });
    return cleanStringsDeep(post);
  });

/** Decides which opportunities should become carousels vs single posts.
 *  Targets ~40% carousels (e.g. 2 of 5). Carousel = topics that read as
 *  numbered breakdowns / frameworks / step-by-steps; everything else stays single. */
function assignFormats(opportunities: SeoOpportunity[]): ("single" | "carousel")[] {
  const CAROUSEL_RX = /\b(\d+\s*(tips|ways|steps|mistakes|reasons|things|signs|rules|hacks|lessons|secrets)|how to|step.?by.?step|guide|framework|breakdown|explained|checklist|playbook|method|strategy|balance|master(ing)?|manage|juggle|optimi[sz]e|improve|maximi[sz]e)\b/i;

  // Score each opportunity for "list-ness".
  const scored = opportunities.map((opp, i) => {
    const blob = `${opp.keyword} ${opp.contentAngle} ${opp.rationale}`;
    return { i, score: CAROUSEL_RX.test(blob) ? 1 : 0 };
  });

  // Target: 2 carousels for a 5-post week, 1 for 3-4 posts, 3 for 6-7.
  const total = opportunities.length;
  const targetCarousels = total <= 2 ? 0 : total <= 4 ? 1 : total <= 5 ? 2 : 3;

  // Pick the top N most "list-y"; ties broken by original order.
  const carouselIndexes = new Set(
    scored
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, targetCarousels)
      .map((s) => s.i),
  );

  return opportunities.map((_, i) => (carouselIndexes.has(i) ? "carousel" : "single"));
}

/** Runs the SEO agent then the writer agent for each top opportunity, returning
 *  a full weekly content plan. NO graphics are generated here, the user
 *  reviews the plan first and then triggers graphics on demand. */
export const runWeeklyPlan = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      brandId: z.string().min(1),
      week: z.string().min(1),
      postCount: z.number().int().min(1).max(7).default(5),
    }),
  )
  .handler(async ({ data }): Promise<WeeklyPlan> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const overall = Date.now();
    console.log(`[plan] ${brand.id} ${data.week}: starting`);

    // Step 0: competitor scan (web search). Feeds gaps into the SEO agent so
    // the plan is biased toward opportunities competitors are missing.
    let competitorScan: CompetitorScanOutput | null = null;
    let competitorContext: string | undefined;
    if (brand.competitors && brand.competitors.length > 0) {
      const tc = Date.now();
      try {
        competitorScan = await runCompetitorScan({ data: { brandId: brand.id } });
        // Auto-merge any newly-spotted brands into the persisted list so the
        // next scan picks them up. Silent — no user intervention.
        if (competitorScan.spottedBrands?.length) {
          try {
            const { added } = await mergeSpottedBrands(brand.id, competitorScan.spottedBrands);
            if (added.length) console.log(`[plan] ${brand.id}: discovered ${added.length} new competitors:`, added.map((a) => a.domain).join(", "));
          } catch (mergeErr) {
            console.warn(`[plan] ${brand.id}: failed to merge spotted brands:`, mergeErr);
          }
        }
        const gapBlock = competitorScan.gaps.length
          ? `Gaps no competitor has covered recently:\n${competitorScan.gaps.map((g) => `- ${g}`).join("\n")}\n\n`
          : "";
        const movesBlock = competitorScan.moves.length
          ? `Recent competitor moves to avoid duplicating:\n${competitorScan.moves
              .slice(0, 8)
              .map((m) => `- ${m.competitor}: "${m.topic}" (${m.publishedAround})`)
              .join("\n")}`
          : "";
        competitorContext = `${competitorScan.summary}\n\n${gapBlock}${movesBlock}`.trim();
        console.log(`[plan] ${brand.id}: competitor scan done in ${Date.now() - tc}ms (${competitorScan.moves.length} moves, ${competitorScan.gaps.length} gaps)`);
      } catch (e) {
        console.warn(`[plan] ${brand.id}: competitor scan failed (continuing without):`, e);
      }
    }

    const seo = await runSeoAgent({ data: { brandId: brand.id, competitorContext } });
    const opportunities = seo.opportunities.slice(0, data.postCount);
    if (opportunities.length === 0) throw new Error("SEO agent returned no opportunities.");
    console.log(`[plan] ${brand.id}: SEO done in ${Date.now() - overall}ms with ${opportunities.length} opportunities`);

    const formats = assignFormats(opportunities);
    const lanes = assignDesignLanes(opportunities.length);

    // Writer runs are independent, run them in parallel with assigned formats.
    const tw = Date.now();
    const designIntel = competitorScan?.designIntel
      ? { trends: competitorScan.designIntel.trends, differentiate: competitorScan.designIntel.differentiate }
      : undefined;
    const posts = await Promise.all(
      opportunities.map((opp, i) =>
        runWriterAgent({
          data: { brandId: brand.id, opportunity: opp, requestedFormat: formats[i], designIntel, assignedLane: lanes[i] },
        }),
      ),
    );
    console.log(`[plan] ${brand.id}: writer (x${posts.length}) done in ${Date.now() - tw}ms. total: ${Date.now() - overall}ms`);

    const plan: WeeklyPlan = {
      brandId: brand.id,
      week: data.week,
      generatedAt: new Date().toISOString(),
      seoSummary: seo.summary,
      sources: seo.sources,
      searchError: seo.searchError,
      posts,
      competitorScan: competitorScan ?? undefined,
    };
    // Final sweep, even if any agent slipped a dash through, scrub the whole
    // plan before sending it to the client. Sources URLs are preserved as-is.
    return {
      ...cleanStringsDeep(plan),
      sources: plan.sources, // don't munge URLs
    };
  });

// ---------- design-lane assignment ----------

/** Catalogue of distinct visual lanes. Each lane is a one-line spatial +
 *  palette + typography signature. The writer treats the assigned lane as
 *  the post's dominant identity; slides inside the post riff on the same
 *  lane with variations in composition and weight, not lane-jumping. */
export interface DesignLane {
  name: string;
  brief: string;
}

const LANES: DesignLane[] = [
  { name: "Editorial portrait",         brief: "Magazine-cover style. One human subject offset two-thirds, the other third is a calm brand-palette gradient reserved for typography. Shot-on-camera realism, Kinfolk aesthetic." },
  { name: "Oversized number",           brief: "Single huge stat or percentage takes 60-70% of the canvas. Heavy modern sans, tight tracking. Background is a flat brand colour with one subtle texture (grain, gradient, dot grid). Caption is short and below the number." },
  { name: "Brutalist type poster",      brief: "Typography is the entire artwork. Mixed weights and sizes of the same family, intentional overlaps, hard left alignment, off-grid placement. Two-tone palette only (one brand colour + one ink)." },
  { name: "Flat vector explainer",      brief: "Notion / Linear marketing aesthetic. Simple geometric illustration of the concept (icons, shapes, arrows). Soft palette, subtle grain, no people. Headline sits on a calm band of negative space." },
  { name: "3D still life",              brief: "Octane-render photoreal 3D objects (laptop, CV stack, calendar, books) on a coloured pedestal or floor. Soft directional lighting. Headline above or beside the object. No people." },
  { name: "Documentary photo",          brief: "Wide environmental real photograph of the scene (a uni library, a tube platform, a co-working desk). Low contrast, natural light, subject NOT centred. Headline overlaid on a quiet zone." },
  { name: "Minimal duotone",            brief: "Two colours only (one brand colour + ivory or ink). 70% negative space. Tiny precise headline top-left, one geometric accent shape. Feels like a Swiss design poster." },
  { name: "Magazine cover",             brief: "Cover-lines styling: a SINGLE bold headline top, smaller dek beneath, masthead-style label. Big square photo or 3D object centred. Inspired by Monocle / Pop Magazine. Calm palette." },
  { name: "Data-grid infographic",      brief: "Chart-like layout: 3-4 cards or bars with numbers, organised on a clean grid. Each card has its own pill of accent colour. No hero subject. Headline above the grid." },
  { name: "Soft-light photo collage",   brief: "Two or three loosely overlapping photo crops with white border (Polaroid feel), warm bokeh, headline beside them in a tight serif or condensed sans. Romantic, intimate." },
];

/** Assign one distinct lane per post. Random starting point + ordered walk
 *  through the catalogue gives a different mix each week without repeats
 *  inside a single plan (until we exceed the catalogue size). */
function assignDesignLanes(n: number): DesignLane[] {
  const shuffled = [...LANES].sort(() => Math.random() - 0.5);
  const out: DesignLane[] = [];
  for (let i = 0; i < n; i++) out.push(shuffled[i % shuffled.length]);
  return out;
}
