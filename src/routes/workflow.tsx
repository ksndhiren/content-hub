import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentOutputModal } from "@/components/AgentOutputModal";
import type { Agent, AgentStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Search, FileText, PenTool, Wand2, ImageIcon, ShieldCheck, Activity, ArrowRight } from "lucide-react";

const agentIcons: Record<string, typeof Search> = {
  "gap-finder": Search,
  keyword: Activity,
  writer: FileText,
  prompt: PenTool,
  graphic: ImageIcon,
  review: ShieldCheck,
};

const statusColor: Record<AgentStatus, string> = {
  Idle: "bg-muted text-muted-foreground",
  Running: "bg-blue-100 text-blue-800",
  Completed: "bg-emerald-100 text-emerald-800",
  Failed: "bg-rose-100 text-rose-800",
};

export const Route = createFileRoute("/workflow")({
  head: () => ({ meta: [{ title: "AI Workflow — Graphic Studio" }] }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const { agents } = useApp();
  const [viewing, setViewing] = useState<Agent | null>(null);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">AI Workflow</h1>
          <p className="text-sm text-muted-foreground mt-1">A look behind the scenes: the agents that build each week's batch.</p>
        </div>

        <section>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Wand2 className="h-4 w-4" /> Weekly batch timeline</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {agents.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2 shrink-0">
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 min-w-[150px]">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
                    <div className="text-xs font-medium mt-0.5">{a.name}</div>
                    <Badge className={cn("mt-1.5 text-[10px] border-0", statusColor[a.status])}>{a.status}</Badge>
                  </div>
                  {i < agents.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const Icon = agentIcons[agent.id] || Activity;
            return (
              <div key={agent.id} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-10 w-10 rounded-lg bg-surface grid place-items-center"><Icon className="h-5 w-5" /></div>
                  <Badge className={cn("text-[10px] border-0", statusColor[agent.status])}>{agent.status}</Badge>
                </div>
                <div>
                  <div className="font-semibold text-sm">{agent.name}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{agent.role}</p>
                </div>
                <div className="text-xs bg-surface rounded-lg p-3 text-muted-foreground line-clamp-3">{agent.output}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Last run {agent.lastRun}</span>
                  <Button size="sm" variant="outline" onClick={() => setViewing(agent)} className="h-7 text-xs">View output</Button>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <AgentOutputModal agent={viewing} onClose={() => setViewing(null)} />
    </AppLayout>
  );
}
