import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Graphic } from "@/lib/mock-data";
import { useApp } from "@/lib/app-store";
import { toast } from "sonner";

interface Props {
  graphic: Graphic | null;
  onClose: () => void;
}

export function CaptionEditorModal({ graphic, onClose }: Props) {
  const { updateGraphic } = useApp();
  const [text, setText] = useState("");

  useEffect(() => {
    if (graphic) setText(graphic.caption);
  }, [graphic]);

  if (!graphic) return null;

  return (
    <Dialog open={!!graphic} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit caption</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-1">{graphic.title}</div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              updateGraphic(graphic.id, { caption: text, lastEdited: "just now" });
              toast.success("Caption updated");
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
