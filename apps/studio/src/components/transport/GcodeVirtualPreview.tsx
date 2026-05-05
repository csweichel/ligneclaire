import { useEffect, useRef, useState } from "react";
import type { GcodePreparedArtifact } from "../../types";

type GcodeVirtualPreviewProps = Readonly<{
  activeLineNumber: number;
  artifact: GcodePreparedArtifact | null;
  page: Readonly<{
    widthMm: number;
    heightMm: number;
  }> | null;
}>;

export function GcodeVirtualPreview({
  activeLineNumber,
  artifact,
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

    context.fillStyle = "#f6f3eb";
    context.fillRect(0, 0, width, height);

    if (!artifact || artifact.preview.segments.length === 0) {
      context.fillStyle = "#6b7280";
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

    context.strokeStyle = "#d6d3cb";
    context.lineWidth = 1;
    context.strokeRect(offsetX, offsetY, viewWidth * scale, viewHeight * scale);

    context.lineCap = "round";
    context.lineJoin = "round";

    for (const segment of artifact.preview.segments) {
      const from = project(segment.from);
      const to = project(segment.to);
      const active = segment.lineNumber <= activeLineNumber;

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);

      if (segment.drawing) {
        context.strokeStyle = active ? "#2956c8" : "#232323";
        context.lineWidth = active ? 1.8 : 1.2;
        context.globalAlpha = active ? 0.95 : 0.48;
      } else {
        context.strokeStyle = active ? "#8aa4e8" : "#cbd5e1";
        context.lineWidth = 1;
        context.globalAlpha = active ? 0.85 : 0.5;
      }

      context.stroke();
    }

    context.globalAlpha = 1;
  }, [activeLineNumber, artifact, page, size]);

  return <canvas className="gcode-preview" ref={canvasRef} />;
}
