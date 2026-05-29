import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Graphic } from "@/lib/mock-data";
import { platformIconColor, statusColor } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Eye, RefreshCw, Pencil, Check, Calendar, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/app-store";

interface Props {
  graphic: Graphic;
  onView: (g: Graphic) => void;
  onEditCaption: (g: Graphic) => void;
}

export function GraphicCard({ graphic, onView, onEditCaption }: Props) {
  const { updateGraphic, regenerateGraphic } = useApp();
  const [busy, setBusy] = useState(false);

  const approve = () => {
    updateGraphic(graphic.id, { status: "Approved" });
    toast.success("Post approved", { description: graphic.title });
  };
  const schedule = () => {
    updateGraphic(graphic.id, { status: "Scheduled" });
    toast.success("Post scheduled", { description: graphic.title });
  };
  const regen = async () => {
    setBusy(true);
    await regenerateGraphic(graphic.id);
    setBusy(false);
    toast.success("Graphic regenerated");
  };

  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-all flex flex-col">
      <div className={cn("relative aspect-square w-full overflow-hidden", graphic.gradient)}>
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
        <div className="absolute inset-0 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] uppercase tracking-wider text-white/80 font-medium">{graphic.keyword}</span>
            <Badge className={cn("text-[10px] border-0", statusColor[graphic.status])}>{graphic.status}</Badge>
          </div>
          <div>
            <div className="text-white text-xl sm:text-2xl font-bold leading-tight drop-shadow">{graphic.overlay}</div>
            <div className="text-white/80 text-xs mt-2">{graphic.objective}</div>
          </div>
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="font-medium text-sm leading-snug">{graphic.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{graphic.caption}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {graphic.platforms.map((p) => (
            <span key={p} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[p])}>
              {p}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-auto">
          <Button size="sm" variant="outline" onClick={() => onView(graphic)} className="h-8 text-xs">
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditCaption(graphic)} className="h-8 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Caption
          </Button>
          <Button size="sm" variant="outline" onClick={regen} disabled={busy} className="h-8 text-xs">
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Regen
          </Button>
          {graphic.status === "Approved" ? (
            <Button size="sm" onClick={schedule} className="h-8 text-xs">
              <Calendar className="h-3.5 w-3.5" /> Schedule
            </Button>
          ) : (
            <Button size="sm" onClick={approve} className="h-8 text-xs">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
