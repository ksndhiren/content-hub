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
    name: "Cutout subject on burst shape",
    brief: "Cobalt-blue (#2b48e0) ground. A single real-photo CUTOUT young-adult subject (background removed) sits centre-canvas, often slightly tilted or breaking out of the frame, with a hand-drawn YELLOW jagged starburst or 8-point burst shape behind them at 70% canvas width. The subject can wear a surreal prop on their head (oversized traffic cone, paper bag, alarm clock) for emotional shorthand. Big bold WHITE headline (3-5 words) overlaid LEFT-of-subject, with 1-2 key words highlighted by a coral or yellow rectangle block tight to the letters.",
  },
  {
    name: "Photo collage circles",
    brief: "Cobalt-blue ground. THREE overlapping circle-cropped photographs at the TOP of the canvas (~45% of height) — each circle holds a different cutout subject or prop (a face, a hand holding cash, a calculator on phone). One circle larger and centred, two smaller flanking. Below the circles a WHITE highlight-block headline (3-6 words on a white rectangle, navy/cobalt text on top), then a short supporting line in white with 1-2 yellow-highlighted words. Right arrow icon bottom-right.",
  },
  {
    name: "Highlight-block text poster",
    brief: "Cobalt-blue ground, TEXT-DOMINANT — minimal or no imagery. Big bold white headline (4-8 words) fills the upper canvas with TWO key words wrapped in YELLOW rectangle highlight blocks tight to the letters. Below: ONE supporting line (8-15 words) in white, with 1-2 yellow-accented words. Optional small surreal prop or quote-mark graphic in a corner. Reads like a pull-quote poster.",
  },
  {
    name: "Object-as-metaphor centrepiece",
    brief: "Cobalt-blue or paper-textured ground. A single photoreal 3D rendered OBJECT serves as the metaphor for the topic, centred (e.g. a paper currency note bent into a loop with a tiny suited figure running inside it, scrabble letter tiles spelling a word, a green alarm clock surrounded by scattered letter tiles spelling 'PAYDAY', a polaroid-frame containing a person). White headline above in a highlight block (4-7 words). Object is the hero — bold, surreal, slightly playful.",
  },
  {
    name: "Side-by-side panel comparison",
    brief: "Canvas split vertically into two ROUNDED-CORNER panels with a thin white gap between them. Left panel is solid cobalt-blue and holds a 4-8 word question or statement in big bold white type with 1-2 yellow-highlighted words. Right panel is a paper-cut photograph — a real-photo cutout subject standing on or interacting with a slanted graphic device (a tilted blue calendar grid, a phone-frame, a scrabble board). Cream / off-white paper background OUTSIDE the panels.",
  },
  {
    name: "Sticky-note overload",
    brief: "Top 50% of canvas: cobalt-blue ground with 3-4 lines of bold white statements (sentences stacked, ONE key word highlighted in yellow on the final line). Bottom 50%: real photograph of a person covered/surrounded by HAND-WRITTEN STICKY NOTES (yellow squares with sketchy black ink labels — but the labels should look like real handwriting blobs, not crisp typography). Sticky notes on the face, shirt, table.",
  },
  {
    name: "Bullet-list payoff",
    brief: "Used for OUTRO slides. Cobalt-blue or cream paper ground. TOP-LEFT a 'Before assuming the worst:' or 'Here is what to do:' opener in white, then a 3-4 BULLET LIST below (round white bullets, simple short phrases 2-4 words each). Bottom area: a real-photo cutout of a subject hugging knees or sitting on a chair with a surreal heavy object (a rock, a stack of books) balanced on their head, against a halftone-dotted blue burst shape.",
  },
  {
    name: "Quote-mark callout",
    brief: "Cobalt-blue ground with a paper-textured rectangle highlight block containing the headline (4-8 words) styled as a QUOTE — large bold cobalt text on yellow / cream rectangle. To the side: a giant photoreal pull-quote mark (99 or 66) tilted at an angle, rendered as a paper cutout. Below the quote: 2 short supporting lines (8-15 words total) in white on cobalt with 1-2 yellow-highlighted words.",
  },
  {
    name: "Phone-mockup hero",
    brief: "Cobalt-blue ground. A real-photo iPhone-frame mockup sits centre or slightly off-centre, screen showing a calculator / messaging / banking app interface (real numerals on screen). Around the phone: a hand holding it, plus subtle scattered confetti of paper money or coins. Above the phone: a 3-5 word white headline with 1-2 yellow-highlighted words. The phone IS the hero.",
  },
  {
    name: "Tilted device + standing subject",
    brief: "Used for COVER slides. Canvas split vertically. Left panel solid cobalt-blue with a 6-10 word question in big bold white type, 1-2 yellow-highlighted words. Right panel: a TILTED 3D rendered blue device (calendar grid, phone, computer screen) at a dramatic angle with a real-photo cutout subject standing ON the device, looking down at it. Cream/paper background around the panels. Slightly surreal, dimensional.",
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
