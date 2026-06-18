import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Download, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphicAgentOutput, LogoPlacement, LogoVariant } from "@/lib/agents/types";

interface Props {
  data: GraphicAgentOutput;
}

type Tone = "light" | "dark";
interface UrlState {
  show: boolean;
  x: number;
  y: number;
  width: number;
  tone: Tone;
  plate: boolean;
}

/**
 * Preview canvas with two independently controlled overlays on top of the
 * server-generated baseSvg: the brand logo, and the brand website URL.
 * Both can be dragged, resized, toggled light/dark, and exported into the
 * final PNG. The server no longer bakes either overlay, so the user has
 * full control here.
 */
export function EditableLogoCanvas({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<LogoPlacement>(data.initialPlacement);
  const [variant, setVariant] = useState<LogoVariant>(data.recommendedVariant);
  const dragTarget = useRef<null | "logo" | "url">(null);
  const dragInfo = useRef<null | { sx: number; sy: number; px: number; py: number; cw: number; ch: number }>(null);

  const initialUrl = useMemo<UrlState>(() => {
    const tone: Tone = data.cornerTone === "dark" ? "dark" : "light";
    return {
      show: !!data.defaultShowUrl && !!data.brandWebsite,
      x: 0.18,
      y: 0.92,
      width: 0.64,
      tone,
      plate: true,
    };
  }, [data.cornerTone, data.defaultShowUrl, data.brandWebsite]);
  const [url, setUrl] = useState<UrlState>(initialUrl);

  const availableVariants = useMemo(
    () => (["default", "white"] as LogoVariant[]).filter((v) => data.logos[v]),
    [data.logos],
  );

  useEffect(() => {
    setPlacement(data.initialPlacement);
    setVariant(data.recommendedVariant);
    setUrl(initialUrl);
  }, [data, initialUrl]);

  const activeLogo = data.logos[variant];
  const aspect = activeLogo?.aspectRatio ?? 1;
  const logoH = placement.width / aspect;
  // "white" variant = same image, CSS-inverted at render time so the dark
  // wordmark renders white. This is what makes the toggle actually do something.
  const invertLogo = variant === "white";

  const baseSvgDataUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(data.baseSvg)}`,
    [data.baseSvg],
  );

  const onPointerDown = (target: "logo" | "url") => (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current.getBoundingClientRect();
    dragTarget.current = target;
    const px = target === "logo" ? placement.x : url.x;
    const py = target === "logo" ? placement.y : url.y;
    dragInfo.current = { sx: e.clientX, sy: e.clientY, px, py, cw: rect.width, ch: rect.height };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    const t = dragTarget.current;
    if (!d || !t) return;
    const dx = (e.clientX - d.sx) / d.cw;
    const dy = (e.clientY - d.sy) / d.ch;
    if (t === "logo") {
      setPlacement((p) => ({
        ...p,
        x: clamp(d.px + dx, 0, 1 - p.width),
        y: clamp(d.py + dy, 0, 1 - logoH),
      }));
    } else {
      setUrl((u) => ({
        ...u,
        x: clamp(d.px + dx, 0, 1 - u.width),
        y: clamp(d.py + dy, 0, 1),
      }));
    }
  };

  const onPointerUp = () => { dragInfo.current = null; dragTarget.current = null; };

  const onSizeChange = (v: number[]) => {
    const newW = v[0] / 100;
    const newH = newW / aspect;
    setPlacement((p) => ({
      x: clamp(p.x, 0, 1 - newW),
      y: clamp(p.y, 0, 1 - newH),
      width: newW,
    }));
  };

  const onUrlSizeChange = (v: number[]) => {
    const newW = v[0] / 100;
    setUrl((u) => ({ ...u, x: clamp(u.x, 0, 1 - newW), width: newW }));
  };

  const reset = () => {
    setPlacement(data.initialPlacement);
    setVariant(data.recommendedVariant);
    setUrl(initialUrl);
  };

  // URL overlay sizing constants. urlHeight is computed off width so that it
  // visually stays roughly the same proportion regardless of width slider.
  const urlFontPct = 0.045; // 4.5% of canvas height = font size
  const urlPlatePadY = 0.018;
  const urlHeightPct = urlFontPct + urlPlatePadY * 2;

  /** Export = rasterise baseSvg, then draw logo + URL overlay on top with
   *  the user's chosen settings. */
  const exportPng = async () => {
    const TARGET = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = TARGET; canvas.height = TARGET;
    const ctx = canvas.getContext("2d")!;

    const base = await loadImage(baseSvgDataUrl);
    ctx.drawImage(base, 0, 0, TARGET, TARGET);

    if (activeLogo) {
      // Logo plate
      const lw = placement.width * TARGET;
      const lh = lw / aspect;
      const lx = placement.x * TARGET;
      const ly = placement.y * TARGET;
      const padX = lw * 0.12;
      const padY = lh * 0.4;
      const plateColor = invertLogo ? "#0b1f4a" : "#ffffff";
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = plateColor;
      roundedRect(ctx, lx - padX, ly - padY, lw + padX * 2, lh + padY * 2, Math.min((lh + padY * 2) * 0.4, 36));
      ctx.fill();
      ctx.restore();
      // Logo image with optional invert
      const logo = await loadImage(activeLogo.dataUrl);
      if (invertLogo) {
        // Draw to an offscreen canvas, invert via filter, then drawImage onto main.
        const off = document.createElement("canvas");
        off.width = Math.ceil(lw); off.height = Math.ceil(lh);
        const octx = off.getContext("2d")!;
        octx.filter = "brightness(0) invert(1)";
        octx.drawImage(logo, 0, 0, lw, lh);
        ctx.drawImage(off, lx, ly);
      } else {
        ctx.drawImage(logo, lx, ly, lw, lh);
      }
    }

    if (url.show && data.brandWebsite) {
      drawUrlOverlay(ctx, TARGET, data.brandWebsite, url);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const dl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dl; a.download = `${data.brandId}-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(dl);
    }, "image/png");
  };

  // URL overlay CSS for the live preview. Mirrors what drawUrlOverlay paints
  // onto the export canvas, so what-you-see-is-what-you-get.
  const urlBg = url.tone === "dark" ? "#ffffff" : "#0b1f4a";
  const urlFg = url.tone === "dark" ? "#0b1f4a" : "#ffffff";

  return (
    <div className="space-y-3 max-w-sm">
      <div
        ref={containerRef}
        className="relative aspect-square w-full rounded-xl overflow-hidden border border-border bg-surface select-none"
      >
        <img
          src={baseSvgDataUrl}
          alt="Generated graphic"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* Draggable logo */}
        {activeLogo ? (
          <div
            onPointerDown={onPointerDown("logo")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute touch-none cursor-grab active:cursor-grabbing rounded-lg hover:ring-2 hover:ring-primary/60 transition-shadow"
            style={{
              left: `${placement.x * 100}%`,
              top: `${placement.y * 100}%`,
              width: `${placement.width * 100}%`,
              height: `${logoH * 100}%`,
              backgroundColor: invertLogo ? "rgba(11,31,74,0.94)" : "rgba(255,255,255,0.94)",
              padding: `${logoH * 0.4 * 100}% ${placement.width * 0.12 * 100}%`,
              borderRadius: 8,
            }}
          >
            <img
              src={activeLogo.dataUrl}
              alt="Brand logo"
              className="relative w-full h-full object-contain pointer-events-none"
              style={{ filter: invertLogo ? "brightness(0) invert(1)" : undefined }}
              draggable={false}
            />
          </div>
        ) : null}

        {/* Draggable URL overlay */}
        {url.show && data.brandWebsite ? (
          <div
            onPointerDown={onPointerDown("url")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute touch-none cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary/60 transition-shadow flex items-center justify-center"
            style={{
              left: `${url.x * 100}%`,
              top: `${(url.y - urlHeightPct) * 100}%`,
              width: `${url.width * 100}%`,
              height: `${urlHeightPct * 100}%`,
              backgroundColor: url.plate ? `${urlBg}E8` : "transparent",
              color: urlFg,
              borderRadius: 9999,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 600,
              fontSize: `clamp(10px, ${urlFontPct * 100}cqi, 32px)`,
              letterSpacing: "0.02em",
              containerType: "inline-size",
            }}
          >
            {data.brandWebsite}
          </div>
        ) : null}
      </div>

      {/* Logo controls */}
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

      {/* URL overlay controls */}
      {data.brandWebsite ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">URL overlay</span>
              <span className="text-[10px] text-muted-foreground font-mono">{data.brandWebsite}</span>
            </div>
            <Switch checked={url.show} onCheckedChange={(v) => setUrl((u) => ({ ...u, show: v }))} />
          </div>
          {url.show ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12 shrink-0">Size</span>
                <Slider
                  value={[Math.round(url.width * 100)]}
                  min={30}
                  max={95}
                  step={1}
                  onValueChange={onUrlSizeChange}
                  className="flex-1"
                />
                <span className="text-xs font-mono tabular-nums w-10 text-right">{Math.round(url.width * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12 shrink-0">Tone</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  {(["light", "dark"] as Tone[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setUrl((u) => ({ ...u, tone: t }))}
                      className={cn(
                        "text-xs px-3 py-1.5 capitalize transition-colors",
                        url.tone === t ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <span className="ml-auto flex items-center gap-2 text-xs">
                  Plate
                  <Switch checked={url.plate} onCheckedChange={(v) => setUrl((u) => ({ ...u, plate: v }))} />
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={reset} className="gap-1.5 flex-1">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button size="sm" onClick={exportPng} className="gap-1.5 flex-1">
          <Download className="h-3.5 w-3.5" /> Export PNG
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Drag the logo or URL to reposition. Toggle plate / tone / size per slide.
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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawUrlOverlay(ctx: CanvasRenderingContext2D, S: number, text: string, u: UrlState) {
  const fontSize = Math.round(S * 0.045);
  const padX = Math.round(S * 0.025);
  const padY = Math.round(S * 0.018);
  ctx.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const textW = ctx.measureText(text).width;
  // Use the user's width slider as the MAX width; clamp the actual plate to
  // hug the text + padding.
  const maxPlateW = u.width * S;
  const plateW = Math.min(textW + padX * 2, maxPlateW);
  const plateH = fontSize + padY * 2;
  // Anchor by Y from the saved overlay state (which represents the BOTTOM
  // edge of the overlay, matching what the preview renders).
  const yBottom = u.y * S;
  const yTop = yBottom - plateH;
  const xLeft = u.x * S + (u.width * S - plateW) / 2;
  const bg = u.tone === "dark" ? "#ffffff" : "#0b1f4a";
  const fg = u.tone === "dark" ? "#0b1f4a" : "#ffffff";
  if (u.plate) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = bg;
    roundedRect(ctx, xLeft, yTop, plateW, plateH, plateH / 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, xLeft + plateW / 2, yTop + plateH / 2 + 1);
}
