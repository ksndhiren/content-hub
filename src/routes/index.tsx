import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { StatCard } from "@/components/StatCard";
import { Images, ClipboardCheck, CheckCircle2, Calendar, TrendingUp, Trophy, Search } from "lucide-react";
import { pipelineStages, stageColor } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dashboard — Graphic Studio" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { selectedBrand, graphicsForView, selectedWeek } = useApp();

  const total = graphicsForView.length;
  const pending = graphicsForView.filter((g) => g.status === "Needs Review" || g.status === "Draft").length;
  const approved = graphicsForView.filter((g) => g.status === "Approved").length;
  const scheduled = graphicsForView.filter((g) => g.status === "Scheduled").length;

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
          <StatCard label="Graphics this week" value={total} icon={Images} hint="Generated" />
          <StatCard label="Pending review" value={pending} icon={ClipboardCheck} hint="Awaiting action" />
          <StatCard label="Approved" value={approved} icon={CheckCircle2} hint="Ready to schedule" />
          <StatCard label="Scheduled" value={scheduled} icon={Calendar} hint="Queued for publish" />
          <StatCard label="Avg engagement" value="4.8%" icon={TrendingUp} delta={1.2} />
          <StatCard label="Best platform" value="Instagram" icon={Trophy} hint="By engagement" />
          <StatCard label="Keyword opportunities" value="27" icon={Search} hint="Found this week" />
          <StatCard label="Posts published" value={12} icon={CheckCircle2} delta={8} />
        </div>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold">This week's content pipeline</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Track each stage from research to publish.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {pipelineStages.map((stage, i) => (
              <div key={stage.name} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
                <div className="font-medium text-sm mt-1">{stage.name}</div>
                <Badge className={cn("mt-2 text-[10px] border-0", stageColor[stage.status])}>{stage.status}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><span className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5" /> <span><b>7 graphics</b> generated for {selectedBrand.name} · 2h ago</span></li>
              <li className="flex items-start gap-3"><span className="h-2 w-2 rounded-full bg-blue-500 mt-1.5" /> Content Writer agent finished drafting captions · 3h ago</li>
              <li className="flex items-start gap-3"><span className="h-2 w-2 rounded-full bg-amber-500 mt-1.5" /> Review Assistant flagged 2 captions · 4h ago</li>
              <li className="flex items-start gap-3"><span className="h-2 w-2 rounded-full bg-violet-500 mt-1.5" /> 3 posts published to Instagram · 1d ago</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Top keyword opportunities</h3>
            <ul className="space-y-2 text-sm">
              {["graduate scheme advice", "cv writing tips", "interview prep", "first internship", "career change 2026"].map((k) => (
                <li key={k} className="flex items-center justify-between">
                  <span>{k}</span>
                  <span className="text-xs text-muted-foreground">High intent</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
