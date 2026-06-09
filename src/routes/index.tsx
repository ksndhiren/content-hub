import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { StatCard } from "@/components/StatCard";
import { Images, ClipboardCheck, CheckCircle2, Calendar, Workflow, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard | Content Hub" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { selectedBrand, graphicsForView, selectedWeek, socialAccounts } = useApp();

  const total = graphicsForView.length;
  const pending = graphicsForView.filter((g) => g.status === "Needs Review" || g.status === "Draft").length;
  const approved = graphicsForView.filter((g) => g.status === "Approved").length;
  const scheduled = graphicsForView.filter((g) => g.status === "Scheduled").length;
  const hasContent = total > 0;
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
          <StatCard label="Graphics this week" value={total} icon={Images} hint="Generated" />
          <StatCard label="Pending review" value={pending} icon={ClipboardCheck} hint="Awaiting action" />
          <StatCard label="Approved" value={approved} icon={CheckCircle2} hint="Ready to schedule" />
          <StatCard label="Scheduled" value={scheduled} icon={Calendar} hint="Queued for publish" />
        </div>

        {!hasContent && (
          <EmptyPanel
            icon={Workflow}
            title="No content for this week yet"
            body="Run the agent pipeline to generate SEO opportunities, written copy and on-brand graphics."
            cta={{ to: "/workflow", label: "Open AI Workflow" }}
          />
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
