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

SEARCH STRATEGY:
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
  .inputValidator(z.object({ brandId: z.string().min(1) }))
  .handler(async ({ data }): Promise<SeoAgentOutput> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    const openai = getOpenAI();
    const { openaiChatModel } = getServerConfig();

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();

    const briefBlock = `Current date: ${todayIso} (year ${year}). Treat anything older than 60 days as stale unless it's evergreen.
Brand: ${brand.name}
Industry: ${brand.industry}
Audience: ${brand.audience}
Tone of voice: ${brand.tone}
Website: ${brand.website ?? "n/a"}`;

    // ---------- STEP 1: research via Responses API + web_search tool ----------
    let researchProse = "";
    let researchSources: SeoSource[] = [];
    let searchError: string | undefined;

    try {
      const res = await runWebSearchResearch(openai, briefBlock);
      researchProse = res.text;
      researchSources = res.sources;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Web search step failed:", msg);
      searchError = msg;
      // Fall back to plain reasoning so the pipeline still produces something.
      const fallback = await openai.chat.completions.create({
        model: openaiChatModel,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You have no web access. Return your best knowledge-only candidate opportunities and flag that this is NOT live-web-grounded." },
          { role: "user", content: `${briefBlock}\n\nProduce 8-12 candidate opportunities as prose.` },
        ],
      });
      researchProse = fallback.choices[0]?.message?.content ?? "";
    }

    // ---------- STEP 2: structure into JSON ----------
    const structure = await openai.chat.completions.create({
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
    });

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
