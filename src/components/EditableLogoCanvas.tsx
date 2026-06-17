import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphicAgentOutput, LogoPlacement, LogoVariant } from "@/lib/agents/types";

interface Props {
  data: GraphicAgentOutput;
}

/**
 * Preview = server's baseSvg (background + photo + typography + chip strip)
 * with the brand logo overlaid as a draggable + resizable layer on top.
 * Everything is real vector content so the typography is always sharp and readable.
 */
export function EditableLogoCanvas({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<LogoPlacement>(data.initialPlacement);
  const [variant, setVariant] = useState<LogoVariant>(data.recommendedVariant);
  const draggingRef = useRef<null | { sx: number; sy: number; px: number; py: number; cw: number; ch: number }>(null);

  const availableVariants = useMemo(
    () => (["default", "white"] as LogoVariant[]).filter((v) => data.logos[v]),
    [data.logos],
  );

  useEffect(() => {
    setPlacement(data.initialPlacement);
    setVariant(data.recommendedVariant);
  }, [data]);

  const activeLogo = data.logos[variant];
  const aspect = activeLogo?.aspectRatio ?? 1;
  const logoH = placement.width / aspect;

  // Convert baseSvg to a usable image source for the preview.
  const baseSvgDataUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(data.baseSvg)}`,
    [data.baseSvg],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current.getBoundingClientRect();
    draggingRef.current = {
      sx: e.clientX, sy: e.clientY,
      px: placement.x, py: placement.y,
      cw: rect.width, ch: rect.height,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.cw;
    const dy = (e.clientY - d.sy) / d.ch;
    setPlacement((p) => ({
      ...p,
      x: clamp(d.px + dx, 0, 1 - p.width),
      y: clamp(d.py + dy, 0, 1 - logoH),
    }));
  };

  const onPointerUp = () => { draggingRef.current = null; };

  const onSizeChange = (v: number[]) => {
    const newW = v[0] / 100;
    const newH = newW / aspect;
    setPlacement((p) => ({
      x: clamp(p.x, 0, 1 - newW),
      y: clamp(p.y, 0, 1 - newH),
      width: newW,
    }));
  };

  const reset = () => {
    setPlacement(data.initialPlacement);
    setVariant(data.recommendedVariant);
  };

  /** Export = rasterise baseSvg, then draw the user-positioned logo on top. */
  const exportPng = async () => {
    const TARGET = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = TARGET; canvas.height = TARGET;
    const ctx = canvas.getContext("2d")!;

    const base = await loadImage(baseSvgDataUrl);
    ctx.drawImage(base, 0, 0, TARGET, TARGET);

    if (activeLogo) {
      const logo = await loadImage(activeLogo.dataUrl);
      const lw = placement.width * TARGET;
      const lh = lw / aspect;
      const lx = placement.x * TARGET;
      const ly = placement.y * TARGET;
      ctx.drawImage(logo, lx, ly, lw, lh);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${data.brandId}-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="space-y-3 max-w-sm">
      <div
        ref={containerRef}
        className="relative aspect-square w-full rounded-xl overflow-hidden border border-border bg-surface select-none"
      >
        {/* Fully composed base (photo + typography + chip strip) */}
        <img
          src={baseSvgDataUrl}
          alt="Generated graphic"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* Draggable brand logo on top */}
        {activeLogo ? (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute touch-none cursor-grab active:cursor-grabbing rounded-lg hover:ring-2 hover:ring-primary/60 transition-shadow"
            style={{
              left: `${placement.x * 100}%`,
              top: `${placement.y * 100}%`,
              width: `${placement.width * 100}%`,
              height: `${logoH * 100}%`,
            }}
          >
            <img
              src={activeLogo.dataUrl}
              alt="Brand logo"
              className="relative w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          </div>
        ) : null}
      </div>

      {availableVariants.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Logo</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {availableVariants.map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={cn(
                  "text-xs px-3 py-1.5 capitalize transition-colors",
                  variant === v ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {v}{v === data.recommendedVariant ? " ★" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Size</span>
          <Slider
            value={[Math.round(placement.width * 100)]}
            min={8}
            max={45}
            step={1}
            onValueChange={onSizeChange}
            className="flex-1"
          />
          <span className="text-xs font-mono tabular-nums w-10 text-right">{Math.round(placement.width * 100)}%</span>
        </div>
        <Button size="sm" variant="outline" onClick={reset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button size="sm" onClick={exportPng} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export PNG
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Drag the logo to move it. AI scored <b>{data.bestPosition}</b> as the best position.
      </p>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
