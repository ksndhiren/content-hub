import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaptionEditorModal } from "@/components/CaptionEditorModal";
import type { Graphic, Platform, PostStatus } from "@/lib/mock-data";
import { statusColor, platformIconColor } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Copy, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/captions")({
  head: () => ({ meta: [{ title: "Captions | Content Hub" }] }),
  component: CaptionsPage,
});

function CaptionsPage() {
  const { graphics, brands, selectedBrandId, setSelectedBrandId, weeks, selectedWeek, setSelectedWeek, updateGraphic } = useApp();
  const [platform, setPlatform] = useState<Platform | "All">("All");
  const [status, setStatus] = useState<PostStatus | "All">("All");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Graphic | null>(null);

  const rows = useMemo(() => {
    return graphics
      .filter((g) => g.brandId === selectedBrandId)
      .filter((g) => g.week === selectedWeek)
      .filter((g) => platform === "All" || g.platforms.includes(platform))
      .filter((g) => status === "All" || g.status === status)
      .filter((g) => !q || g.title.toLowerCase().includes(q.toLowerCase()) || g.caption.toLowerCase().includes(q.toLowerCase()));
  }, [graphics, selectedBrandId, selectedWeek, platform, status, q]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast.success("Caption copied");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Captions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and refine captions across all platforms.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search captions" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "All")}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["All", "Instagram", "LinkedIn", "Facebook", "X", "YouTube Shorts"] as const).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as PostStatus | "All")}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["All", "Draft", "Needs Review", "Approved", "Scheduled", "Published"] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{weeks.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Post</th>
                  <th className="text-left font-medium px-4 py-3">Platforms</th>
                  <th className="text-left font-medium px-4 py-3 min-w-[260px]">Caption</th>
                  <th className="text-left font-medium px-4 py-3">Tone</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Edited</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id} className="border-t border-border hover:bg-surface/60">
                    <td className="px-4 py-3 font-medium">{g.title}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {g.platforms.map((p) => (
                          <span key={p} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[p])}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <div className="line-clamp-2 text-muted-foreground text-xs">{g.caption}</div>
                      <div className="flex flex-wrap gap-1 mt-1">{g.hashtags.slice(0, 3).map((h) => <span key={h} className="text-[10px] text-muted-foreground">{h}</span>)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{g.tone}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-[10px] border-0", statusColor[g.status])}>{g.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{g.lastEdited}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(g.caption)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Select value={g.status} onValueChange={(v) => updateGraphic(g.id, { status: v as PostStatus })}>
                          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(["Draft", "Needs Review", "Approved", "Scheduled", "Published"] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No captions match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CaptionEditorModal graphic={editing} onClose={() => setEditing(null)} />
    </AppLayout>
  );
}
