import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Agent } from "@/lib/mock-data";

export function AgentOutputModal({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  if (!agent) return null;
  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent.name} — output</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">{agent.role}</div>
        <div className="bg-surface rounded-lg p-4 text-sm font-mono whitespace-pre-wrap">{agent.output}</div>
        <div className="text-xs text-muted-foreground">Last run {agent.lastRun}</div>
      </DialogContent>
    </Dialog>
  );
}
