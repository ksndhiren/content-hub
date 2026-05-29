import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Graphic } from "@/lib/mock-data";
import { platformIconColor, statusColor } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Calendar, Copy } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";

interface Props {
  graphic: Graphic | null;
  onClose: () => void;
}

export function GraphicDetailModal({ graphic, onClose }: Props) {
  const { updateGraphic } = useApp();
  if (!graphic) return null;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <Dialog open={!!graphic} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="grid md:grid-cols-2">
          <div className={cn("aspect-square md:aspect-auto md:min-h-[500px] relative", graphic.gradient)}>
            <div className="absolute inset-0 p-6 flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-white/80 font-medium">{graphic.keyword}</span>
              <div className="text-white text-3xl font-bold leading-tight drop-shadow">{graphic.overlay}</div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <DialogHeader className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn("border-0", statusColor[graphic.status])}>{graphic.status}</Badge>
                {graphic.platforms.map((p) => (
                  <span key={p} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[p])}>
                    {p}
                  </span>
                ))}
              </div>
              <DialogTitle className="text-xl">{graphic.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Caption</div>
              <div className="text-sm bg-surface rounded-lg p-3 relative">
                {graphic.caption}
                <button onClick={() => copy(graphic.caption, "Caption")} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Hashtags</div>
              <div className="flex flex-wrap gap-1.5">
                {graphic.hashtags.map((h) => (
                  <span key={h} className="text-xs bg-surface px-2 py-1 rounded-md">{h}</span>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Image prompt</div>
              <div className="text-xs bg-surface rounded-lg p-3 font-mono leading-relaxed">{graphic.prompt}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground uppercase tracking-wider mb-1">Objective</div>
                <div>{graphic.objective}</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-wider mb-1">Audience</div>
                <div>{graphic.audience}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Platform versions</div>
              <div className="space-y-2">
                {Object.entries(graphic.captionsByPlatform).map(([p, c]) => (
                  <div key={p} className="bg-surface rounded-lg p-3 text-xs">
                    <div className="font-medium mb-1">{p}</div>
                    <div className="text-muted-foreground">{c}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => { updateGraphic(graphic.id, { status: "Approved" }); toast.success("Approved"); onClose(); }}>
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => { updateGraphic(graphic.id, { status: "Scheduled" }); toast.success("Scheduled"); onClose(); }}>
                <Calendar className="h-4 w-4" /> Schedule
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
