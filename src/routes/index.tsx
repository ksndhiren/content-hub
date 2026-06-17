import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { StatCard } from "@/components/StatCard";
import { FileText, Images, Workflow, BarChart3, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadPlan } from "@/lib/agents/plan-store.server";
import type { WeeklyPlan } from "@/lib/agents/types";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard | Content Hub" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { selectedBrand, selectedWeek, socialAccounts } = useApp();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlan(null);
    loadPlan({ data: { brandId: selectedBrand.id, week: selectedWeek } })
      .then((res) => { if (!cancelled) setPlan(res.plan); })
      .catch(() => { /* no saved plan, fine */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrand.id, selectedWeek]);

  const totalPosts = plan?.posts.length ?? 0;
  const totalSlides = plan?.posts.reduce((acc, p) => acc + p.slides.length, 0) ?? 0;
  const singles = plan?.posts.filter((p) => p.format === "single").length ?? 0;
  const carousels = plan?.posts.filter((p) => p.format === "carousel").length ?? 0;
  const hasPlan = totalPosts > 0;
  const hasChannels = socialAccounts.some((a) => a.status === "Connected");

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">{selectedWeek}</div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{selectedBrand.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">Snapshot of this week's content pipeline.</p>
          </div>
          <div className={cn("hidden sm:flex h-14 w-14 rounded-xl items-center justify-center text-white font-semibold", selectedBrand.gradient)}>
            {selectedBrand.initials}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Posts planned" value={totalPosts} icon={FileText} hint={hasPlan ? "Drafted by writer" : "No plan yet"} />
          <StatCard label="Single posts" value={singles} icon={Images} hint="1-image posts" />
          <StatCard label="Carousels" value={carousels} icon={Layers} hint="Multi-slide posts" />
          <StatCard label="Total slides" value={totalSlides} icon={Images} hint="All graphics to generate" />
        </div>

        {!hasPlan && !loading && (
          <EmptyPanel
            icon={Workflow}
            title="No plan for this week yet"
            body="Run the agent pipeline to generate SEO opportunities and written copy. You can review the plan before generating any graphics."
            cta={{ to: "/workflow", label: "Open AI Workflow" }}
          />
        )}

        {hasPlan && (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Weekly plan</div>
                <p className="text-sm mt-1 max-w-2xl">{plan?.seoSummary}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/workflow">Open in workflow</Link>
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {plan?.posts.map((p, i) => (
                <li key={p.id} className="py-3 flex items-center gap-3">
                  <div className="h-7 w-7 rounded bg-surface grid place-items-center text-[11px] font-semibold text-muted-foreground shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.hook}</div>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border-0 font-medium shrink-0",
                    p.format === "carousel" ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800",
                  )}>
                    {p.format === "carousel" ? `Carousel · ${p.slides.length}` : "Single"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!hasChannels && (
          <EmptyPanel
            icon={BarChart3}
            title="No social channels connected"
            body="Connect Meta (Instagram, Threads, Facebook), LinkedIn and X to pull real performance metrics."
            cta={{ to: "/settings", label: "Connect channels" }}
          />
        )}
      </div>
    </AppLayout>
  );
}

function EmptyPanel({
  icon: Icon, title, body, cta,
}: {
  icon: typeof Workflow;
  title: string;
  body: string;
  cta: { to: string; label: string };
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-8 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="h-12 w-12 rounded-xl bg-surface grid place-items-center shrink-0">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{body}</p>
      </div>
      <Button asChild><Link to={cta.to}>{cta.label}</Link></Button>
    </section>
  );
}
