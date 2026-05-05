import type { PlotDocument, PlotLayer, Polyline } from "./document";
import { plotPalette } from "./palette";

export type SvgSerializeOptions = Readonly<{
  includeDebugLayers?: boolean;
  title?: string;
}>;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function toSvgPoint(x: number, y: number, canvasHeight: number): string {
  return `${formatNumber(x)} ${formatNumber(canvasHeight - y)}`;
}

function polylineToPath(polyline: Polyline, canvasHeight: number): string {
  const [first, ...rest] = polyline.points;
  const commands = [`M ${toSvgPoint(first!.x, first!.y, canvasHeight)}`];

  for (const point of rest) {
    commands.push(`L ${toSvgPoint(point.x, point.y, canvasHeight)}`);
  }

  if (polyline.closed) {
    commands.push("Z");
  }

  return commands.join(" ");
}

function renderLayer(layer: PlotLayer, canvasHeight: number): string {
  const stroke = escapeXml(layer.stroke ?? plotPalette.primary);
  const layerPaths = layer.paths
    .map(
      (path) =>
        `<path d="${polylineToPath(path, canvasHeight)}" fill="none" stroke="${stroke}" stroke-width="0.35" vector-effect="non-scaling-stroke" />`
    )
    .join("");

  return `<g id="${escapeXml(layer.id)}" data-label="${escapeXml(layer.label)}">${layerPaths}</g>`;
}

export function serializePlotDocumentToSvg(
  document: PlotDocument,
  options: SvgSerializeOptions = {}
): string {
  const layers = options.includeDebugLayers
    ? [...document.layers, ...(document.debugLayers ?? [])]
    : [...document.layers];
  const metadataEntries = Object.entries(document.metadata ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const metadata = metadataEntries
    .map(([key, value]) => `<metadata data-key="${escapeXml(key)}">${escapeXml(value)}</metadata>`)
    .join("");

  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : "";
  const layerMarkup = layers.map((layer) => renderLayer(layer, document.canvas.heightMm)).join("");
  const width = formatNumber(document.canvas.widthMm);
  const height = formatNumber(document.canvas.heightMm);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" fill="none">`,
    title,
    metadata,
    layerMarkup,
    `</svg>`,
  ].join("");
}
