import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands } from "../mock-data";
import type { BrandBrief, SeoAgentOutput, SeoSource } from "./types";
import { cleanStringsDeep } from "./text-cleanup";

const RESEARCH_INSTRUCTIONS = `You are the research half of an SEO agent. You have LIVE WEB SEARCH. Use it aggressively.

For ONE brand, find what is genuinely trending and being talked about IN THE PAST 30 DAYS:
1. Topics, keywords, and angles competitor brands and publications have published RECENTLY.
2. Questions the audience is actually asking on Reddit, X/Twitter, LinkedIn, TikTok, forums in the past 30 days.
3. Content gaps: themes the audience cares about that competitors are missing or doing badly.

EDITORIAL MISSION (HARD RULES):
- We EDUCATE early-career Gen Z (18-24): students, graduates, interns, first-job seekers.
- Every opportunity must teach a skill, decode a process, share a tactic, debunk a myth, or hand them data they can act on.
- DO NOT surface "Company X is hiring", "NGO Y is recruiting interns", job listings, employer spotlights, employer rankings, or any post that promotes a specific employer/NGO/charity/corporate. We are not a job board.
- No naming a specific company, NGO, charity, university, or government body as the subject of the post. Use them only as anonymised data points ("a top-4 consulting firm", "a UK retailer") if absolutely needed.
- Topics should feel like things a smart older sibling would tell them: CV tactics, interview frameworks, salary negotiation, skills that pay, AI for jobseekers, application math, mental models, common traps.

SEARCH STRATEGY:
- BUDGET: run AT MOST 4 web searches total. Pick high-leverage queries. Do not iterate endlessly.
- Add date filters to your queries (current month name, current year, "this month", "past month") to bias results toward recency.
- Prefer dated sources: news articles, dated blog posts, dated Reddit threads, dated LinkedIn posts.
- For each opportunity, you MUST have seen at least one source published in the past 60 days. If you cannot find one, DROP that opportunity.
- Reject generic evergreen topics ("how to write a CV", "what are internships") unless you find a fresh angle in the recent results.

OUTPUT FORMAT (prose, NOT JSON):
- 8 to 12 candidate opportunities. For each: keyword/topic phrase, publish date of the source you saw (e.g. "May 2026 LinkedIn post by X"), a 1-line evidence-grounded rationale quoting the source where possible, and a content angle.
- A "Sources:" list mapping each citation to a real URL with its publish date.

STYLE RULES:
- NEVER use the em-dash character (Unicode U+2014) or the en-dash character (Unicode U+2013). Use commas, periods, or an ASCII hyphen "-" only when needed.
- Be specific. Quote the source's headline or a phrase from the post when relevant.`;

const STRUCTURE_SYSTEM = `You are the structuring half of an SEO agent.
You receive RESEARCH PROSE from a web-search-enabled model. Convert it into clean JSON.

Return ONLY valid JSON:
{
  "summary": string,
  "opportunities": [
    {
      "keyword": string,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "difficulty": "low" | "medium" | "high",
      "rationale": string,
      "contentAngle": string
    }
  ],
  "sources": [ { "title": string, "url": string } ]
}

Exactly 5 opportunities. DIVERSITY: ~2 list-shape topics, ~3 punchy-shape topics. Never return 5 of the same shape.

STYLE: NEVER use the em-dash character (Unicode U+2014) or the en-dash character (Unicode U+2013) anywhere. Use commas, periods, or an ASCII hyphen "-" only when needed (e.g. ranges like "5-10").

If the research prose is generic or evergreen, push back: pick the 5 that have the freshest evidence and rewrite the rationale to quote the dated source.`;

export function brandToBrief(b: (typeof initialBrands)[number]): BrandBrief {
  return {
    id: b.id, name: b.name, industry: b.industry, audience: b.audience,
    tone: b.tone, website: b.website, colors: b.colors, initials: b.initials,
  };
}

export const runSeoAgent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      brandId: z.string().min(1),
      /** Optional competitor context from a fresh scan. Used to bias opportunities
       *  toward gaps competitors haven't covered. */
      competitorContext: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<SeoAgentOutput> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const { openaiChatModel } = getServerConfig();

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();

    const competitorBlock = data.competitorContext
      ? `

COMPETITOR CONTEXT (just scanned, fresh from web search):
${data.competitorContext}

USE THIS to bias your opportunities toward:
1. Gaps the competitors are NOT covering (highest priority).
2. Angles where you can do better than what competitors are publishing.
Avoid recommending opportunities a competitor has already covered well in the past 30 days.`
      : "";

    const briefBlock = `Current date: ${todayIso} (year ${year}). Treat anything older than 60 days as stale unless it's evergreen.
Brand: ${brand.name}
Industry: ${brand.industry}
Audience: ${brand.audience}
Tone of voice: ${brand.tone}
Website: ${brand.website ?? "n/a"}${competitorBlock}`;

    // ---------- STEP 1: research via Responses API + web_search tool ----------
    let researchProse = "";
    let researchSources: SeoSource[] = [];
    let searchError: string | undefined;

    const SEARCH_TIMEOUT_MS = 180_000;
    const t0 = Date.now();
    console.log(`[seo-agent] ${brand.id}: step 1 research (web search) starting…`);

    try {
      const res = await withTimeout(runWebSearchResearch(openai, briefBlock), SEARCH_TIMEOUT_MS, "Web search step timed out after 90s.");
      researchProse = res.text;
      researchSources = res.sources;
      console.log(`[seo-agent] ${brand.id}: step 1 done in ${Date.now() - t0}ms, ${researchSources.length} sources`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[seo-agent] ${brand.id}: step 1 failed in ${Date.now() - t0}ms:`, msg);
      searchError = msg;
      // Fall back to plain reasoning so the pipeline still produces something.
      const fallback = await withTimeout(
        openai.chat.completions.create({
          model: openaiChatModel,
          temperature: 0.7,
          messages: [
            { role: "system", content: "You have no web access. Return your best knowledge-only candidate opportunities and flag that this is NOT live-web-grounded." },
            { role: "user", content: `${briefBlock}\n\nProduce 8-12 candidate opportunities as prose.` },
          ],
        }),
        30_000,
        "Fallback reasoning step timed out after 30s.",
      );
      researchProse = fallback.choices[0]?.message?.content ?? "";
    }

    // ---------- STEP 2: structure into JSON ----------
    const t1 = Date.now();
    console.log(`[seo-agent] ${brand.id}: step 2 structure starting…`);
    const structure = await withTimeout(
      openai.chat.completions.create({
        model: openaiChatModel,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: STRUCTURE_SYSTEM },
          {
            role: "user",
            content: `${briefBlock}

RESEARCH PROSE FROM STEP 1:
"""
${researchProse}
"""

Structure this into JSON now.`,
          },
        ],
      }),
      30_000,
      "Structuring step timed out after 30s.",
    );
    console.log(`[seo-agent] ${brand.id}: step 2 done in ${Date.now() - t1}ms`);

    const parsed = JSON.parse(structure.choices[0]?.message?.content ?? "{}");

    const structuredSources: SeoSource[] = Array.isArray(parsed.sources)
      ? parsed.sources
          .map((s: Record<string, unknown>) => ({ title: String(s.title ?? ""), url: String(s.url ?? "") }))
          .filter((s: SeoSource) => s.url.startsWith("http"))
      : [];
    const sources = (structuredSources.length ? structuredSources : researchSources).slice(0, 12);

    const result: SeoAgentOutput = {
      brandId: brand.id,
      generatedAt: new Date().toISOString(),
      summary: parsed.summary ?? "",
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 5) : [],
      sources,
      searchError,
    };
    return cleanStringsDeep(result);
  });

/** Calls the OpenAI Responses API with the web_search tool. Returns the
 *  combined text output plus any URL citations from the response. */
async function runWebSearchResearch(
  // Loose typing, the Responses API isn't fully reflected on every SDK build.
  openai: { responses?: { create: (args: Record<string, unknown>) => Promise<unknown> } },
  briefBlock: string,
): Promise<{ text: string; sources: SeoSource[] }> {
  if (!openai.responses?.create) {
    throw new Error("This OpenAI SDK build does not expose the Responses API.");
  }

  const raw = (await openai.responses.create({
    model: "gpt-4o-mini",
    tools: [{ type: "web_search_preview" }],
    input: [
      { role: "system", content: RESEARCH_INSTRUCTIONS },
      { role: "user", content: `${briefBlock}\n\nDo the research and return prose. Cite real URLs you actually opened.` },
    ],
  })) as ResponsesApiResult;

  const text = extractText(raw);
  const sources = extractCitations(raw);
  if (!text) throw new Error("Web search returned empty output.");
  return { text, sources };
}

// ---------- response parsing ----------

interface ResponsesApiResult {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
}

function extractText(r: ResponsesApiResult): string {
  if (typeof r.output_text === "string" && r.output_text) return r.output_text;
  const chunks: string[] = [];
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractCitations(r: ResponsesApiResult): SeoSource[] {
  const out: SeoSource[] = [];
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      for (const a of c.annotations ?? []) {
        if (a.url && a.url.startsWith("http")) {
          out.push({ title: a.title ?? a.url, url: a.url });
        }
      }
    }
  }
  // Dedupe by URL
  return Array.from(new Map(out.map((s) => [s.url, s])).values());
}

/** Wraps a promise in a hard timeout. Rejects with the given message if it
 *  doesn't settle in time. Note: the underlying OpenAI call keeps running on
 *  OpenAI's side, but we stop waiting for it. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
