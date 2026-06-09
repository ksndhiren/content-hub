import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import { BarChart3, Plug } from "lucide-react";

export const Route = createFileRoute("/performance")({
  head: () => ({ meta: [{ title: "Performance | Content Hub" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const { selectedBrand, socialAccounts } = useApp();
  const connected = socialAccounts.filter((a) => a.status === "Connected");

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">Live metrics for {selectedBrand.name} once channels are connected.</p>
        </div>

        {connected.length === 0 ? (
          <section className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <div className="h-12 w-12 rounded-xl bg-surface grid place-items-center mx-auto mb-4">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-semibold">No metrics yet</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Connect Meta (Instagram, Threads, Facebook), LinkedIn and X to pull followers, reach, impressions, engagement and click data.
            </p>
            <div className="mt-5">
              <Button asChild><Link to="/settings"><Plug className="h-4 w-4" /> Connect channels</Link></Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-4">
              See <code className="text-[11px]">docs/INTEGRATIONS.md</code> for full setup instructions.
            </p>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Connected: {connected.map((c) => c.platform).join(", ")}. Hook up your insights endpoints, see <code>docs/INTEGRATIONS.md</code>.
            </p>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
