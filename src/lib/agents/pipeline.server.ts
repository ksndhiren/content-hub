import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runSeoAgent } from "./seo-agent.server";
import { runWriterAgent } from "./writer-agent.server";
import { initialBrands } from "../mock-data";
import type { WeeklyPlan, SeoOpportunity } from "./types";
import { cleanStringsDeep } from "./text-cleanup";

/** Decides which opportunities should become carousels vs single posts.
 *  Targets ~40% carousels (e.g. 2 of 5). Carousel = topics that read as
 *  numbered breakdowns / frameworks / step-by-steps; everything else stays single. */
function assignFormats(opportunities: SeoOpportunity[]): ("single" | "carousel")[] {
  const CAROUSEL_RX = /\b(\d+\s*(tips|ways|steps|mistakes|reasons|things|signs|rules|hacks|lessons|secrets)|how to|step.?by.?step|guide|framework|breakdown|explained|checklist|playbook|method|strategy)\b/i;

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

    const seo = await runSeoAgent({ data: { brandId: brand.id } });
    const opportunities = seo.opportunities.slice(0, data.postCount);
    if (opportunities.length === 0) throw new Error("SEO agent returned no opportunities.");

    const formats = assignFormats(opportunities);

    // Writer runs are independent, run them in parallel with assigned formats.
    const posts = await Promise.all(
      opportunities.map((opp, i) =>
        runWriterAgent({
          data: { brandId: brand.id, opportunity: opp, requestedFormat: formats[i] },
        }),
      ),
    );

    const plan: WeeklyPlan = {
      brandId: brand.id,
      week: data.week,
      generatedAt: new Date().toISOString(),
      seoSummary: seo.summary,
      sources: seo.sources,
      searchError: seo.searchError,
      posts,
    };
    // Final sweep, even if any agent slipped a dash through, scrub the whole
    // plan before sending it to the client. Sources URLs are preserved as-is.
    return {
      ...cleanStringsDeep(plan),
      sources: plan.sources, // don't munge URLs
    };
  });
