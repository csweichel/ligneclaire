import { useEffect, useRef, useState } from "react";
import type { GcodePreparedArtifact } from "../../types";

type GcodeVirtualPreviewProps = Readonly<{
  activeLineNumber: number;
  artifact: GcodePreparedArtifact | null;
  isPreparing: boolean;
  page: Readonly<{
    widthMm: number;
    heightMm: number;
  }> | null;
}>;

export function GcodeVirtualPreview({
  activeLineNumber,
  artifact,
  isPreparing,
  page,
}: GcodeVirtualPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({
    width: 1,
    height: 1,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) {
          setSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });

    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(size.width));
    const height = Math.max(1, Math.floor(size.height));
    canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
      paper: styles.getPropertyValue("--studio-paper").trim() || "#FFFDF8",
      textSecondary: styles.getPropertyValue("--studio-ink-soft").trim() || "#6B7280",
      line: styles.getPropertyValue("--studio-line-soft").trim() || "#D9DEE4",
      plotPrimary: styles.getPropertyValue("--studio-plot-primary").trim() || "#526A7A",
      mask: styles.getPropertyValue("--studio-mask").trim() || "#7DA7A0",
    };

    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);

    if (!artifact || artifact.preview.segments.length === 0) {
      context.fillStyle = colors.textSecondary;
      context.font = '13px "Avenir Next", "Helvetica Neue", sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Prepare G-code to preview the toolpath.", width / 2, height / 2);
      return;
    }

    const viewWidth = page?.widthMm ?? artifact.preview.bounds?.maxX ?? 1;
    const viewHeight = page?.heightMm ?? artifact.preview.bounds?.maxY ?? 1;
    const padding = 12;
    const scale = Math.min(
      (width - padding * 2) / Math.max(viewWidth, 1),
      (height - padding * 2) / Math.max(viewHeight, 1)
    );
    const offsetX = (width - viewWidth * scale) * 0.5;
    const offsetY = (height - viewHeight * scale) * 0.5;

    function project(point: { x: number; y: number }) {
      return {
        x: offsetX + point.x * scale,
        y: offsetY + (viewHeight - point.y) * scale,
      };
    }

    context.strokeStyle = colors.line;
    context.lineWidth = 1;
    context.strokeRect(offsetX, offsetY, viewWidth * scale, viewHeight * scale);

    context.lineCap = "round";
    context.lineJoin = "round";

    for (const segment of artifact.preview.segments) {
      const from = project(segment.from);
      const to = project(segment.to);
      const completed = segment.lineNumber <= activeLineNumber;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);

      if (segment.drawing) {
        context.strokeStyle = colors.plotPrimary;
        context.lineWidth = completed ? 1.8 : 1.2;
        context.globalAlpha = completed ? 0.96 : 0.24;
      } else {
        context.strokeStyle = colors.mask;
        context.lineWidth = 1;
        context.globalAlpha = completed ? 0.38 : 0.14;
      }

      context.stroke();
    }

    context.globalAlpha = 1;
  }, [activeLineNumber, artifact, page, size]);

  return (
    <div className="relative h-full min-h-0">
      <canvas
        aria-hidden={isPreparing}
        className="block h-full max-h-full min-h-0 w-full rounded-[20px] border border-slate-200/80 bg-[var(--studio-paper)]"
        ref={canvasRef}
      />

      {isPreparing ? (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center gap-3 rounded-[20px] border border-slate-200/80 bg-[rgba(255,253,248,0.88)] text-center text-slate-500 backdrop-blur-sm"
          role="status"
        >
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <div className="text-sm font-medium">Preparing G-code preview...</div>
        </div>
      ) : null}
    </div>
  );
}
