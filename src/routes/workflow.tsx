import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Search, FileText, ImageIcon, Loader2, Play, AlertCircle, RefreshCw,
  Sparkles, Layers, Image as LucideImage, ChevronDown, ChevronRight, CheckCircle2,
  Download as DownloadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { runWeeklyPlan, replacePost } from "@/lib/agents/pipeline.server";
import { runGraphicAgent } from "@/lib/agents/graphic-agent.server";
// Force-bundle the inner-agent server handlers. pipeline.server.ts calls
// these server-to-server; without an import from a route, the TanStack Start
// build leaves them as client stubs only and never registers handlers, so
// the worker 500s with "Server function info not found".
import "@/lib/agents/seo-agent.server";
import "@/lib/agents/writer-agent.server";
import "@/lib/agents/competitor-agent.server";
import { savePlan, loadPlan, saveCompetitorScan, loadCompetitorScan } from "@/lib/agents/plan-store.server";
import { saveGraphic, loadGraphicsForPlan, dropGraphicsForPost, dropAllGraphicsForWeek } from "@/lib/agents/graphic-store.server";
import type { CompetitorScanOutput } from "@/lib/agents/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditableLogoCanvas } from "@/components/EditableLogoCanvas";
import {
  PLATFORM_RULES,
  type GraphicAgentOutput,
  type PostPlan,
  type PostSlide,
  type WeeklyPlan,
} from "@/lib/agents/types";
import type { Platform } from "@/lib/mock-data";
import { platformIconColor } from "@/lib/mock-data";

export const Route = createFileRoute("/workflow")({
  head: () => ({ meta: [{ title: "AI Workflow | Content Hub" }] }),
  component: WorkflowPage,
});

function slideKey(postId: string, index: number) {
  return `${postId}:${index}`;
}

function WorkflowPage() {
  const { selectedBrand, selectedWeek } = useApp();
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [graphics, setGraphics] = useState<Record<string, GraphicAgentOutput>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ active: boolean; done: number; total: number }>({ active: false, done: 0, total: 0 });
  const [replaceTarget, setReplaceTarget] = useState<PostPlan | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorScanOutput | null>(null);

  const markBusy = (k: string, v: boolean) =>
    setBusy((prev) => {
      const n = new Set(prev);
      if (v) n.add(k); else n.delete(k);
      return n;
    });

  // Auto-load any saved plan whenever the user switches brand or week, or
  // navigates back into this route. useEffect deps already prevent unnecessary
  // re-runs; no ref-based dedup (which deadlocked under StrictMode/HMR).
  useEffect(() => {
    let cancelled = false;
    setLoadingSaved(true);
    setPlan(null);
    setGraphics({});
    setSavedAt(null);

    loadPlan({ data: { brandId: selectedBrand.id, week: selectedWeek } })
      .then((res) => {
        if (cancelled) return;
        if (res.plan) {
          setPlan(res.plan);
          setSavedAt(res.savedAt ?? null);
        }
      })
      .catch((e) => { if (!cancelled) console.warn("loadPlan failed:", e); })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });

    setCompetitors(null);
    loadCompetitorScan({ data: { brandId: selectedBrand.id, week: selectedWeek } })
      .then((res) => { if (!cancelled && res.scan) setCompetitors(res.scan); })
      .catch(() => { /* none yet, fine */ });

    // Auto-load any persisted graphics for this brand+week.
    loadGraphicsForPlan({ data: { brandId: selectedBrand.id, week: selectedWeek } })
      .then((res) => { if (!cancelled && res.graphics) setGraphics(res.graphics); })
      .catch((e) => { if (!cancelled) console.warn("loadGraphicsForPlan failed:", e); });

    return () => { cancelled = true; };
  }, [selectedBrand.id, selectedWeek]);


  const planWeek = async () => {
    setPlanning(true);
    setPlan(null);
    setGraphics({});
    setSavedAt(null);
    // Old graphics are stale for the new plan — wipe disk too.
    void dropAllGraphicsForWeek({ data: { brandId: selectedBrand.id, week: selectedWeek } })
      .catch((e) => console.warn("dropAllGraphicsForWeek failed:", e));
    try {
      const p = await runWeeklyPlan({
        data: { brandId: selectedBrand.id, week: selectedWeek, postCount: 5 },
      });
      setPlan(p);
      // If the pipeline ran a competitor scan, surface it immediately.
      if (p.competitorScan && typeof p.competitorScan === "object") {
        const cs = p.competitorScan as CompetitorScanOutput;
        setCompetitors(cs);
        try { await saveCompetitorScan({ data: { scan: cs, week: selectedWeek } }); } catch { /* ignore */ }
      }
      toast.success(`Plan ready, ${p.posts.length} posts drafted`);
      // Persist to disk so it survives reloads.
      try {
        const res = await savePlan({ data: { plan: p } });
        setSavedAt(res.savedAt);
      } catch (saveErr) {
        console.warn("Auto-save failed:", saveErr);
        toast.warning("Plan generated but auto-save failed", {
          description: saveErr instanceof Error ? saveErr.message : "Unknown error",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const generateSlide = async (post: PostPlan, slide: PostSlide) => {
    const k = slideKey(post.id, slide.index);
    markBusy(k, true);
    // CTA + website footer shows on every single-post slide and on the LAST
    // (outro) slide of every carousel.
    const isOutro = slide.index === post.slides.length - 1;
    try {
      const g = await runGraphicAgent({
        data: {
          brandId: post.opportunity ? plan!.brandId : selectedBrand.id,
          imagePrompt: slide.imagePrompt,
          title: slide.slideTitle,
          heroPhotoQuery: slide.heroPhotoQuery,
          photoSide: slide.photoSide,
          brandedTools: slide.brandedTools,
          headline: slide.slideTitle,
          subhead: slide.slideBody,
          chipLabels: slide.chipLabels,
          graphicFormat: slide.graphicFormat,
          showCta: isOutro,
          layoutVariant: slide.layoutVariant,
          bigStat: slide.bigStat,
          bigStatLabel: slide.bigStatLabel,
          comparison: slide.comparison,
          quoteAttribution: slide.quoteAttribution,
          eyebrow: slide.eyebrow,
          cornerBadge: slide.cornerBadge,
          accentWord: slide.accentWord,
          accentTone: slide.accentTone,
          bottomTagline: slide.bottomTagline,
          bottomTaglineAccent: slide.bottomTaglineAccent,
          barRows: slide.barRows,
          statCards: slide.statCards,
          categoryCards: slide.categoryCards,
          heroSubjectType: slide.heroSubjectType,
          heroObjectPrompt: slide.heroObjectPrompt,
        },
      });
      setGraphics((prev) => ({ ...prev, [k]: g }));
      // Persist so refresh / brand switch / week switch keeps the graphic.
      void saveGraphic({
        data: { brandId: selectedBrand.id, week: selectedWeek, slideKey: k, graphic: g },
      }).catch((e) => console.warn("saveGraphic failed:", e));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      markBusy(k, false);
    }
  };

  const generatePost = async (post: PostPlan) => {
    for (const slide of post.slides) {
      await generateSlide(post, slide);
    }
  };

  const generateAll = async () => {
    if (!plan) return;
    const total = plan.posts.reduce((acc, p) => acc + p.slides.length, 0);
    setBulk({ active: true, done: 0, total });
    try {
      let done = 0;
      for (const post of plan.posts) {
        for (const slide of post.slides) {
          await generateSlide(post, slide);
          done++;
          setBulk((b) => ({ ...b, done }));
        }
      }
      toast.success(`Generated ${total} graphics`);
    } finally {
      setBulk({ active: false, done: 0, total: 0 });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">AI Workflow</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Plan the week for <b>{selectedBrand.name}</b> first. Review the copy, then generate graphics on demand.
            </p>
            {savedAt && (
              <p className="text-[11px] text-emerald-700 mt-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Plan saved · {formatTimeAgo(savedAt)}
              </p>
            )}
            {loadingSaved && (
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading saved plan…
              </p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {plan && (
              <Button
                onClick={generateAll}
                disabled={bulk.active || busy.size > 0}
                className="gap-2"
              >
                {bulk.active ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {bulk.done} / {bulk.total}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate all graphics
                  </>
                )}
              </Button>
            )}
            <Button onClick={planWeek} disabled={planning} variant={plan ? "outline" : "default"} className="gap-2">
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {plan ? "Re-plan week" : planning ? "Planning…" : "Plan this week"}
            </Button>
          </div>
        </div>

        {!plan && !planning && !loadingSaved && (
          <EmptyPlan onClick={planWeek} brandName={selectedBrand.name} />
        )}

        {planning && <PlanningCard brandName={selectedBrand.name} />}

        {plan && (
          <>
            <SeoSummary summary={plan.seoSummary} sources={plan.sources} searchError={plan.searchError} />
            <CompetitorCard data={competitors} brandName={selectedBrand.name} />
            <div className="space-y-6">
              {plan.posts.map((post, i) => (
                <PostCard
                  key={post.id}
                  index={i}
                  post={post}
                  graphics={graphics}
                  busy={busy}
                  onGenerateSlide={generateSlide}
                  onGeneratePost={generatePost}
                  onReplace={() => setReplaceTarget(post)}
                />
              ))}
            </div>
          </>
        )}

        <ReplacePostDialog
          target={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onSubmit={async (input) => {
            if (!replaceTarget || !plan) return;
            const targetId = replaceTarget.id;
            setReplaceTarget(null);
            toast.loading("Rewriting post…", { id: "replace" });
            try {
              const newPost = await replacePost({
                data: { brandId: plan.brandId, ...input, requestedFormat: replaceTarget.format },
              });
              const updated: WeeklyPlan = {
                ...plan,
                posts: plan.posts.map((p) => (p.id === targetId ? newPost : p)),
              };
              setPlan(updated);
              // Drop graphics for old slides under the replaced post.
              void dropGraphicsForPost({ data: { brandId: plan.brandId, week: selectedWeek, postId: targetId } })
                .catch((e) => console.warn("dropGraphicsForPost failed:", e));
              setGraphics((prev) => {
                const n = { ...prev };
                Object.keys(n).forEach((k) => { if (k.startsWith(`${targetId}:`)) delete n[k]; });
                return n;
              });
              try {
                const res = await savePlan({ data: { plan: updated } });
                setSavedAt(res.savedAt);
              } catch (e) {
                console.warn("save after replace failed:", e);
              }
              toast.success("Post replaced", { id: "replace" });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Replace failed", { id: "replace" });
            }
          }}
        />
      </div>
    </AppLayout>
  );
}

function PlanningCard({ brandName }: { brandName: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  // Rough stage labels keyed off elapsed seconds; matches the server-side timing budget.
  const stage =
    elapsed < 5  ? "Scanning competitor moves (web search)…"
  : elapsed < 35 ? "Reading competitor blogs + social to find gaps…"
  : elapsed < 60 ? "SEO agent finding opportunities competitors are missing…"
  : elapsed < 85 ? "Structuring research into 5 opportunities…"
  : elapsed < 130 ? "Drafting 5 posts in parallel (writer agent)…"
  : "Still working — each web-search step has a 90s ceiling.";
  return (
    <div className="rounded-xl border border-border bg-card p-10 flex items-start gap-4 text-sm">
      <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5" />
      <div className="flex-1">
        <div className="font-medium">Planning {brandName}'s week, {elapsed}s elapsed</div>
        <div className="text-muted-foreground text-xs mt-1">{stage}</div>
      </div>
    </div>
  );
}

function EmptyPlan({ onClick, brandName }: { onClick: () => void; brandName: string }) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="h-12 w-12 rounded-xl bg-surface grid place-items-center mx-auto mb-4">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="font-semibold">No plan yet for {brandName}</div>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Click below to run the SEO agent and writer for this week. You'll review the copy first, graphics are only generated when you ask.
      </p>
      <div className="mt-5">
        <Button onClick={onClick} className="gap-2">
          <Play className="h-4 w-4" /> Plan this week
        </Button>
      </div>
    </section>
  );
}

function CompetitorCard({
  data, brandName,
}: {
  data: CompetitorScanOutput | null;
  brandName: string;
}) {
  if (!data) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Competitor radar</div>
        <p className="text-sm mt-1">Auto-scanned before planning. What competitors are publishing for {brandName} this month.</p>
      </div>
      {data && (
        <div className="space-y-4">
          <p className="text-sm">{data.summary}</p>
          {data.gaps.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Content gaps to own</div>
              <ul className="space-y-1.5">
                {data.gaps.map((g, i) => (
                  <li key={i} className="text-xs flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.moves.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Recent competitor moves ({data.moves.length})</div>
              <ul className="divide-y divide-border border border-border rounded-lg">
                {data.moves.map((m, i) => (
                  <li key={i} className="p-3 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{m.competitor}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{m.publishedAround}</span>
                    </div>
                    <div className="mt-0.5">{m.topic}</div>
                    {m.summary && <div className="text-muted-foreground mt-0.5">{m.summary}</div>}
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" className="text-[10px] underline text-muted-foreground mt-1 inline-block">
                        {m.url}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.searchError && (
            <p className="text-[11px] text-amber-700 font-mono break-all bg-amber-50 border border-amber-200 rounded p-2">
              Search error: {data.searchError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SeoSummary({ summary, sources, searchError }: { summary: string; sources: { title: string; url: string }[]; searchError?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-surface grid place-items-center shrink-0">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">SEO summary</div>
          <p className="text-sm mt-1">{summary}</p>
          {sources.length > 0 ? (
            <details className="mt-2">
              <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
                {sources.length} sources cited (live web search)
              </summary>
              <ul className="mt-2 space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground">
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="text-[11px] text-amber-700 mt-2 space-y-1">
              <p>No web sources cited, fell back to model-knowledge reasoning.</p>
              {searchError && (
                <p className="font-mono text-[10px] bg-amber-50 border border-amber-200 rounded p-2 break-all">
                  OpenAI error: {searchError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PostCard({
  index, post, graphics, busy, onGenerateSlide, onGeneratePost, onReplace,
}: {
  index: number;
  post: PostPlan;
  graphics: Record<string, GraphicAgentOutput>;
  busy: Set<string>;
  onGenerateSlide: (post: PostPlan, slide: PostSlide) => Promise<void>;
  onGeneratePost: (post: PostPlan) => Promise<void>;
  onReplace: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zipping, setZipping] = useState(false);
  const isCarousel = post.format === "carousel";
  const anyBusy = post.slides.some((s) => busy.has(slideKey(post.id, s.index)));
  const generatedCount = post.slides.filter((s) => graphics[slideKey(post.id, s.index)]).length;
  const allGenerated = generatedCount === post.slides.length;

  const downloadAllSlides = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const slug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carousel";
      for (const slide of post.slides) {
        const g = graphics[slideKey(post.id, slide.index)];
        if (!g) continue;
        const png = await rasterizeSvg(g.composedSvg);
        zip.file(`${String(slide.index + 1).padStart(2, "0")}-${slug}.png`, png);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setZipping(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-5 flex items-center gap-4 text-left hover:bg-surface/40 transition-colors"
      >
        <div className="h-8 w-8 rounded-md bg-surface grid place-items-center shrink-0 text-xs font-semibold text-muted-foreground">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold truncate">{post.title}</div>
            <Badge className={cn("text-[10px] border-0", isCarousel ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800")}>
              {isCarousel ? <Layers className="h-3 w-3 mr-1 inline" /> : <LucideImage className="h-3 w-3 mr-1 inline" />}
              {isCarousel ? `Carousel · ${post.slides.length} slides` : "Single"}
            </Badge>
            <Badge className="text-[10px] border-0 bg-muted text-muted-foreground capitalize">
              {post.opportunity.keyword}
            </Badge>
            {generatedCount > 0 && (
              <Badge className="text-[10px] border-0 bg-emerald-100 text-emerald-800">
                {generatedCount}/{post.slides.length} generated
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{post.hook}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onReplace(); }}
          disabled={anyBusy}
          className="h-8 text-xs gap-1.5 shrink-0"
          title="Swap this post for a different topic. Rewrites copy + image prompts."
        >
          Replace
        </Button>
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation(); void onGeneratePost(post); }}
          disabled={anyBusy}
          className="h-8 text-xs gap-1.5 shrink-0"
        >
          {anyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generatedCount > 0 ? "Regenerate" : "Generate"} {isCarousel ? "all" : "graphic"}
        </Button>
        {isCarousel && allGenerated && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); void downloadAllSlides(); }}
            disabled={zipping}
            className="h-8 text-xs gap-1.5 shrink-0"
            title="Download all carousel slides as a zip"
          >
            {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
            Download all
          </Button>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-5 space-y-6">
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <Lbl>Hook</Lbl>
              <p className="text-sm mt-1">{post.hook}</p>
              <Lbl className="mt-4">Body</Lbl>
              <p className="text-sm leading-relaxed whitespace-pre-line mt-1">{post.body}</p>
            </div>
            <PlatformCaptionsPanel post={post} />
          </div>

          <div className="space-y-4">
            <Lbl>Slides ({post.slides.length})</Lbl>
            {post.slides.map((slide) => (
              <SlideRow
                key={slide.index}
                post={post}
                slide={slide}
                graphic={graphics[slideKey(post.id, slide.index)]}
                busy={busy.has(slideKey(post.id, slide.index))}
                onGenerate={() => onGenerateSlide(post, slide)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PlatformCaptionsPanel({ post }: { post: PostPlan }) {
  const platforms = Object.keys(post.captions) as Platform[];
  const [active, setActive] = useState<Platform | null>(platforms[0] ?? null);
  if (!active) return null;
  const cap = post.captions[active];
  if (!cap) return null;
  const rule = PLATFORM_RULES[active];
  const len = cap.text.length;
  const overLimit = len > rule.charLimit;

  return (
    <div>
      <Lbl>Per-platform captions</Lbl>
      <div className="flex gap-1 mt-1 mb-3 flex-wrap">
        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => setActive(p)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-full border transition-colors",
              active === p
                ? "border-primary bg-primary/10 text-foreground font-medium"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5 align-middle", platformIconColor[p].split(" ")[0])} />
            {p}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
        <div className="text-sm whitespace-pre-line">{cap.text}</div>
        <div className="flex flex-wrap gap-1">
          {cap.hashtags.map((h) => (
            <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{h}</span>
          ))}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border">
          <span>
            Hashtags <b className="text-foreground">{cap.hashtags.length}</b>
            {" "}(rec {rule.minHashtags}-{rule.maxHashtags})
          </span>
          <span className={cn(overLimit && "text-rose-600 font-medium")}>
            {len} / {rule.charLimit} chars
          </span>
        </div>
      </div>
    </div>
  );
}

function SlideRow({
  post, slide, graphic, busy, onGenerate,
}: {
  post: PostPlan;
  slide: PostSlide;
  graphic: GraphicAgentOutput | undefined;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="p-3 flex items-center gap-3 bg-surface/50">
        <div className="h-6 w-6 rounded bg-surface grid place-items-center text-[10px] font-semibold text-muted-foreground">
          {slide.index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{slide.slideTitle || "(no title)"}</div>
          <div className="text-[11px] text-muted-foreground truncate">{slide.slideBody}</div>
        </div>
        <Badge className="text-[10px] border-0 bg-muted text-muted-foreground">
          {slide.graphicFormat.replace("-", " ")}
        </Badge>
        <Button
          size="sm"
          variant={graphic ? "outline" : "default"}
          onClick={onGenerate}
          disabled={busy}
          className="h-7 text-xs gap-1.5"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : graphic ? <RefreshCw className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {busy ? "Generating…" : graphic ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {!graphic && (
        <div className="px-3 py-3 border-t border-border bg-card space-y-2">
          {(slide.chipLabels?.length || slide.brandedTools?.length) ? (
            <div className="flex flex-wrap gap-1">
              {slide.chipLabels?.map((c) => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{c}</span>
              ))}
              {slide.brandedTools?.map((t) => (
                <span key={t.domain} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{t.name} (logo)</span>
              ))}
            </div>
          ) : null}
          <div className="text-[11px] text-muted-foreground italic">
            {slide.imagePrompt || "No image prompt, writer skipped this slide."}
          </div>
        </div>
      )}

      {graphic && (
        <div className="p-4 border-t border-border bg-card">
          <EditableLogoCanvas data={graphic} />
        </div>
      )}

      {/* Reference to post keeps post in scope; used for future actions. */}
      <span className="hidden">{post.id}</span>
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ReplacePostDialog({
  target, onClose, onSubmit,
}: {
  target: PostPlan | null;
  onClose: () => void;
  onSubmit: (input: { keyword: string; contentAngle: string; rationale?: string }) => void | Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [angle, setAngle] = useState("");
  useEffect(() => {
    if (target) { setKeyword(""); setAngle(""); }
  }, [target]);
  const ok = keyword.trim().length > 1 && angle.trim().length > 4;
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace post</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Replacing: <b>{target.title}</b>. The writer drafts a fresh post for the new topic below. Format ({target.format}) is preserved.
            </p>
            <div className="space-y-1.5">
              <Lbl>New topic / keyword</Lbl>
              <Input
                placeholder='e.g. "AI tools every intern should master"'
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Lbl>Angle / what to say about it</Lbl>
              <Textarea
                placeholder='e.g. "Walk through 5 free AI tools that save interns hours each week. Include real use cases."'
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!ok}
            onClick={() => onSubmit({ keyword: keyword.trim(), contentAngle: angle.trim() })}
          >
            Replace post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Lbl({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] uppercase tracking-wider text-muted-foreground", className)}>{children}</div>;
}

// Unused helper kept to satisfy import in case of future extension
export const _icons = { AlertCircle };

/** Rasterises an SVG string to a 1024x1024 PNG Blob, used by the carousel
 *  "Download all" path so each slide ships as a clean PNG. */
async function rasterizeSvg(svg: string): Promise<Blob> {
  const TARGET = 1024;
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load slide SVG"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = TARGET; canvas.height = TARGET;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, TARGET, TARGET);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
}
