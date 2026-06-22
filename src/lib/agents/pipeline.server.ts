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
    const posts = await Promise.all(
      opportunities.map(async (opp, i) => {
        const post = await runWriterAgent({
          data: { brandId: brand.id, opportunity: opp, requestedFormat: formats[i], assignedLane: lanes[i] },
        });
        // Stamp the lane onto the post so per-slide regenerates can reuse it
        // and stay inside the same visual identity.
        return { ...post, assignedLane: lanes[i] };
      }),
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
  {
    name: "3D isometric diorama",
    brief: "Photoreal 3D isometric scene: a small landscape carved into wedges (forest, factory, classroom, etc.) at slight 3/4 perspective with shallow depth of field. Each wedge represents a category — label each with thin grey leader lines pointing to a percentage and one-line description. Magazine-masthead headline top-left in mixed editorial type (large sans or display serif + small italic dek). Source line at the bottom. Inspired by the Visual Capitalist 'U.S. Carbon Offsets' diorama and 'Renewable Energy by Country' panels.",
  },
  {
    name: "Photo-textured stacked bars",
    brief: "Stacked bar chart with 4-5 columns running across the canvas, each segment filled with a real photographic texture relevant to the category (e.g. flooded street, wildfire, drought field). Numbers in white sit ON the segments; column totals sit above. Headline top-left in a heavy display sans with one word italic-accented in brand yellow or coral. Inspired by the Visual Capitalist 'Rising Cost of Climate Events' chart.",
  },
  {
    name: "Half-circle gauge with photoreal hero",
    brief: "A horizon-style half-rainbow gauge ($0 on the left, $100 on the right) sweeps across the upper half, gradient-coloured red→amber→green. Country/category labels with circular flag chips sit along the curve. Below, a single photoreal 3D rendered object (a coin, a globe, a passport) anchors the canvas. Magazine-cover headline above the gauge — mixed Saol/Tiempos display serif with a small all-caps eyebrow. Source line at the bottom. Inspired by Visual Capitalist 'Where Does $100 Lose the Most Value'.",
  },
  {
    name: "Voronoi inside a 3D vessel",
    brief: "A 3D rendered vessel (a bowl, a globe, a translucent box, a cupped hand) sits centre-frame with a voronoi-style data partition mapped onto its visible surface. Each cell is a category with a flag chip + a number ($, %, count). Vessel rim has soft shadowing. Magazine-cover headline above the vessel in mixed serif+sans display type, one word HUGE and overflowing slightly. Background is a clean brand-palette gradient. Inspired by Visual Capitalist 'The 30 Largest Exporters of Food'.",
  },
  {
    name: "Character-cutout bar chart",
    brief: "Tall, narrow vertical bars stacked side-by-side, each bar topped with a photoreal cutout 'character' representing the category (a graduate, a CV stack, a software icon, etc.) — same trick as the VC blockbusters chart but using career/student themes. Year or category labels at the base of each bar. Cinematic textured sky background (golden hour or storm). Heavy condensed-sans masthead headline top-left, one word italic-accented. Inspired by Visual Capitalist 'Biggest Summer Blockbusters'.",
  },
  {
    name: "Magazine cover stat",
    brief: "A single shock stat at huge scale dominates the top two-thirds, rendered in mixed editorial type (display serif numerals + italic accent word). Beneath: a smaller dek explaining the stat, then a horizontal row of 3-4 mini-stat callouts with thin leader lines pointing into a photoreal 3D rendered object that anchors the bottom. Source line at the very bottom. Reads like a magazine cover essay.",
  },
  {
    name: "Annotated photograph",
    brief: "One full-bleed photoreal photograph of a real young-adult subject in a specific environment (a tube platform, a library nook, a co-working space, a kitchen at 11pm). Thin white leader lines connect 3-4 callout labels with stats, decisions or scripts to specific elements of the photo. Magazine-masthead headline runs across the top in a heavy geometric sans with one italic accent word.",
  },
  {
    name: "Comparison split poster",
    brief: "Canvas split vertically (or diagonally) into two contrasting halves — one in warm brand palette, one in cool. Each half holds a label, a big stat and one supporting photoreal 3D object. Centre seam has a vertical 'VS' or year band. Headline runs across the top in mixed serif + sans editorial type. Cinematic shadows.",
  },
  {
    name: "Process-flow infographic",
    brief: "A horizontal or staircase process flow with 3-5 numbered steps, each step a small photoreal 3D vignette (a CV, a calendar, a video call, a handshake) connected by thin lines with arrows. Step labels and a short tactic per step. Magazine-masthead headline top in mixed editorial type. Subtle grain texture and brand-palette wash.",
  },
  {
    name: "Editorial portrait + data card",
    brief: "Three-quarter editorial portrait of a real young-adult subject occupying 60% of the canvas (offset right). On the empty 40% to the left, a stack of overlapping data cards (each card carries one stat with a tiny icon, source and percentage). Magazine-cover headline top in mixed serif+sans, italic accent. Soft natural light, Kinfolk colour grade.",
  },
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
