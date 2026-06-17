import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOpenAI } from "./openai.server";
import { getServerConfig } from "../config.server";
import { initialBrands } from "../mock-data";
import { cleanStringsDeep } from "./text-cleanup";
import { loadCompetitorList } from "./competitor-store.server";
import type { CompetitorScanOutput } from "./types";

export type { CompetitorScanOutput, CompetitorMove } from "./types";

const RESEARCH_INSTRUCTIONS = `You are a competitor-analysis researcher with LIVE WEB SEARCH.

For a single brand you will be given:
- The brand's industry + audience.
- A list of 3-6 competitor names + domains.

Your job:
1. For EACH competitor, search the web for content they've published in the PAST 30 DAYS (blog posts, social posts, news features, video uploads). Use site: queries where helpful.
2. Identify the TOPICS / ANGLES they're publishing about.
3. Identify CONTENT GAPS: themes the audience cares about that NO competitor has covered recently, or that competitors are covering badly.

Return prose (NOT JSON):
- A short summary paragraph of what the competitive landscape is doing this month.
- For each competitor: 1-3 specific recent moves (topic, approx publish date, URL, 1-line summary).
- A list of 3-5 content gaps the brand could own.
- A "Spotted brands:" section — any OTHER brand or publisher you saw during search that is publishing similar content for the same audience but is NOT in the configured competitor list. For each: name, official root domain, 1-line reason it's a real competitor.
- A "Sources:" list mapping each citation to a real URL.

GUARDS FOR SPOTTED BRANDS:
- Only include brands you saw publishing relevant content in the past 60 days.
- Skip generic publishers (NYT, BBC, Forbes, Reddit, Wikipedia, Medium, LinkedIn the platform).
- Skip the brand's own domain.
- Skip universities, government sites, and pure listing aggregators unless they're clearly publishing branded content.
- 0-3 spotted brands per scan. Quality over quantity. If you didn't see any, return zero.

STYLE RULES:
- Do NOT use em-dashes (Unicode U+2014) or en-dashes (Unicode U+2013).
- Be specific. Quote post titles where useful.`;

const STRUCTURE_SYSTEM = `Convert the research prose into JSON:
{
  "summary": string,
  "moves": [
    {
      "competitor": string,
      "domain": string,
      "topic": string,
      "publishedAround": string,
      "url": string,
      "summary": string
    }
  ],
  "gaps": [string],
  "spottedBrands": [
    { "name": string, "domain": string, "reason": string }
  ],
  "sources": [ { "title": string, "url": string } ]
}
At most 12 moves total. At most 6 gaps. At most 3 spottedBrands. Skip any move you don't have a real URL for. For spottedBrands, the domain must be a real root domain (e.g. "example.com"), no paths.

STYLE: NEVER use em-dashes (Unicode U+2014) or en-dashes (Unicode U+2013).`;

export const runCompetitorScan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1) }))
  .handler(async ({ data }): Promise<CompetitorScanOutput> => {
    const brand = initialBrands.find((b) => b.id === data.brandId);
    if (!brand) throw new Error(`Brand not found: ${data.brandId}`);

    // Read the persisted (auto-evolving) competitor list, falling back to the
    // mock-data seed on first scan.
    const persisted = await loadCompetitorList(brand.id);
    const competitors = persisted.map((c) => ({ name: c.name, domain: c.domain }));
    if (competitors.length === 0) {
      return {
        brandId: brand.id,
        generatedAt: new Date().toISOString(),
        summary: "No competitors configured for this brand. Seed some in src/lib/mock-data.ts under brand.competitors.",
        moves: [],
        gaps: [],
        spottedBrands: [],
        sources: [],
      };
    }

    const openai = getOpenAI();
    const { openaiChatModel } = getServerConfig();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const year = now.getUTCFullYear();

    const brief = `Current date: ${today} (year ${year}). Treat anything older than 60 days as stale.
Brand: ${brand.name}
Industry: ${brand.industry}
Audience: ${brand.audience}

Competitors to scan:
${competitors.map((c) => `- ${c.name} (${c.domain})`).join("\n")}`;

    let researchProse = "";
    let searchError: string | undefined;

    try {
      researchProse = await withTimeout(
        runWebSearch(openai, brief),
        90_000,
        "Competitor web search timed out after 90s.",
      );
    } catch (e) {
      searchError = e instanceof Error ? e.message : String(e);
      console.warn(`[competitor-agent] ${brand.id}: search failed:`, searchError);
      // Fallback: reason from knowledge alone
      const fb = await openai.chat.completions.create({
        model: openaiChatModel,
        temperature: 0.5,
        messages: [
          { role: "system", content: "You have no web access. Speculate what competitors might be publishing, flag clearly this is NOT live data." },
          { role: "user", content: brief },
        ],
      });
      researchProse = fb.choices[0]?.message?.content ?? "";
    }

    const structureRes = await openai.chat.completions.create({
      model: openaiChatModel,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: STRUCTURE_SYSTEM },
        { role: "user", content: `${brief}\n\nRESEARCH PROSE:\n"""\n${researchProse}\n"""\n\nStructure this into JSON.` },
      ],
    });

    const parsed = JSON.parse(structureRes.choices[0]?.message?.content ?? "{}");
    const result: CompetitorScanOutput = {
      brandId: brand.id,
      generatedAt: new Date().toISOString(),
      summary: String(parsed.summary ?? ""),
      moves: Array.isArray(parsed.moves)
        ? parsed.moves.slice(0, 12).map((m: Record<string, unknown>) => ({
            competitor: String(m.competitor ?? ""),
            domain: String(m.domain ?? ""),
            topic: String(m.topic ?? ""),
            publishedAround: String(m.publishedAround ?? ""),
            url: String(m.url ?? ""),
            summary: String(m.summary ?? ""),
          }))
        : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 6).map(String) : [],
      spottedBrands: Array.isArray(parsed.spottedBrands)
        ? parsed.spottedBrands
            .slice(0, 3)
            .map((s: Record<string, unknown>) => ({
              name: String(s.name ?? "").trim(),
              domain: String(s.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
              reason: String(s.reason ?? "").trim(),
            }))
            .filter((s: { name: string; domain: string }) => s.name && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.domain))
        : [],
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.slice(0, 12).map((s: Record<string, unknown>) => ({ title: String(s.title ?? ""), url: String(s.url ?? "") }))
        : [],
      searchError,
    };
    return cleanStringsDeep(result);
  });

async function runWebSearch(
  openai: { responses?: { create: (args: Record<string, unknown>) => Promise<unknown> } },
  brief: string,
): Promise<string> {
  if (!openai.responses?.create) throw new Error("Responses API not available on this SDK build.");
  const raw = (await openai.responses.create({
    model: "gpt-4o-mini",
    tools: [{ type: "web_search_preview" }],
    input: [
      { role: "system", content: RESEARCH_INSTRUCTIONS },
      { role: "user", content: `${brief}\n\nDo the research now.` },
    ],
  })) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof raw.output_text === "string" && raw.output_text) return raw.output_text;
  const chunks: string[] = [];
  for (const item of raw.output ?? []) for (const c of item.content ?? []) if (typeof c.text === "string") chunks.push(c.text);
  return chunks.join("\n").trim();
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
