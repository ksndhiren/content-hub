import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { GraphicCard } from "@/components/GraphicCard";
import { GraphicDetailModal } from "@/components/GraphicDetailModal";
import { CaptionEditorModal } from "@/components/CaptionEditorModal";
import type { Graphic, PostStatus } from "@/lib/mock-data";
import { ImageOff } from "lucide-react";

export const Route = createFileRoute("/graphics")({
  head: () => ({ meta: [{ title: "Weekly Graphics — Graphic Studio" }] }),
  component: GraphicsPage,
});

const FILTERS: ("All" | PostStatus)[] = ["All", "Draft", "Needs Review", "Approved", "Scheduled", "Published"];

function GraphicsPage() {
  const { graphicsForView, selectedBrand, selectedWeek } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [viewing, setViewing] = useState<Graphic | null>(null);
  const [editing, setEditing] = useState<Graphic | null>(null);

  const filtered = filter === "All" ? graphicsForView : graphicsForView.filter((g) => g.status === filter);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Weekly Graphics</h1>
            <p className="text-sm text-muted-foreground mt-1">{selectedBrand.name} · {selectedWeek}</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <ImageOff className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No graphics here yet</div>
            <p className="text-sm text-muted-foreground mt-1">Try a different filter or generate a new batch.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((g) => (
              <GraphicCard key={g.id} graphic={g} onView={setViewing} onEditCaption={setEditing} />
            ))}
          </div>
        )}
      </div>

      <GraphicDetailModal graphic={viewing} onClose={() => setViewing(null)} />
      <CaptionEditorModal graphic={editing} onClose={() => setEditing(null)} />
    </AppLayout>
  );
}
