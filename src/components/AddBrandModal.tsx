import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-store";
import type { Platform } from "@/lib/mock-data";
import { toast } from "sonner";

const ALL_PLATFORMS: Platform[] = ["Instagram", "LinkedIn", "Facebook", "X", "YouTube Shorts"];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddBrandModal({ open, onClose }: Props) {
  const { addBrand } = useApp();
  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    audience: "",
    tone: "",
    weeklyVolume: 5,
    platforms: ["Instagram", "LinkedIn"] as Platform[],
    notes: "",
  });

  const togglePlatform = (p: Platform) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p],
    }));
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Brand name required");
    addBrand({ ...form });
    toast.success(`${form.name} added`);
    onClose();
    setForm({ name: "", industry: "", website: "", audience: "", tone: "", weeklyVolume: 5, platforms: ["Instagram"], notes: "" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new brand</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Brand name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Co." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="acme.com" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Target audience</Label>
            <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tone of voice</Label>
              <Input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder="Warm, direct" />
            </div>
            <div className="grid gap-2">
              <Label>Weekly post count</Label>
              <Input type="number" min={1} max={30} value={form.weeklyVolume} onChange={(e) => setForm({ ...form, weeklyVolume: +e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PLATFORMS.map((p) => {
                const on = form.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground"}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Add brand</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
