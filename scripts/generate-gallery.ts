import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlotMetrics } from "@ligneclaire/engine";
import { exportSvg, getToolDiagnostics, listParamSets, listPrograms, workspaceRoot } from "@ligneclaire/node-runtime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const galleryDir = path.join(rootDir, "docs", "gallery");
const readmePath = path.join(rootDir, "README.md");
const galleryStartMarker = "<!-- SAMPLE_GALLERY:START -->";
const galleryEndMarker = "<!-- SAMPLE_GALLERY:END -->";
const thumbnailWidth = 280;
const cardsPerRow = 3;

type GalleryCard = Readonly<{
  slug: string;
  name: string;
  imagePath: string;
  metrics: PlotMetrics;
}>;

type GalleryProgram = Readonly<{
  id: string;
  title: string;
  description: string;
  cards: readonly GalleryCard[];
}>;

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDistanceMm(value: number): string {
  const meters = value / 1000;
  return `${meters.toFixed(1)} m`;
}

function chunk<T>(items: readonly T[], size: number): readonly T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function renderCardImage(card: GalleryCard): string {
  return [
    "<td align=\"center\" valign=\"top\">",
    `  <a href="${card.imagePath}">`,
    `    <img src="${card.imagePath}" alt="${card.name} (${card.slug})" width="${thumbnailWidth}" />`,
    "  </a>",
    "</td>",
  ].join("\n");
}

function renderCardCaption(card: GalleryCard): string {
  return [
    "<td align=\"center\" valign=\"top\">",
    `  <strong>${card.name}</strong><br />`,
    `  <code>${card.slug}</code><br />`,
    `  ${formatCount(card.metrics.pathCount)} paths<br />`,
    `  ${formatCount(card.metrics.segmentCount)} segments<br />`,
    `  ${formatDistanceMm(card.metrics.drawDistanceMm)} draw distance`,
    "</td>",
  ].join("\n");
}

function renderProgramGallery(program: GalleryProgram): string {
  const summaryLine =
    program.description.length > 0
      ? `\`${program.id}\` - ${program.description}`
      : `\`${program.id}\``;
  const blocks = [
    `### ${program.title}`,
    "",
    summaryLine,
    "",
  ];

  for (const row of chunk(program.cards, cardsPerRow)) {
    blocks.push("<table>");
    blocks.push("  <tr>");
    for (const card of row) {
      blocks.push(`    ${renderCardImage(card).replaceAll("\n", "\n    ")}`);
    }
    blocks.push("  </tr>");
    blocks.push("  <tr>");
    for (const card of row) {
      blocks.push(`    ${renderCardCaption(card).replaceAll("\n", "\n    ")}`);
    }
    blocks.push("  </tr>");
    blocks.push("</table>");
    blocks.push("");
  }

  return blocks.join("\n");
}

function renderGalleryMarkdown(programs: readonly GalleryProgram[]): string {
  const paramSetCount = programs.reduce((count, program) => count + program.cards.length, 0);

  return [
    `Rendered ${formatCount(programs.length)} checked-in programs across ${formatCount(paramSetCount)} parameter sets.`,
    "",
    "Each thumbnail links to the checked-in SVG export committed under `docs/gallery/`.",
    "",
    ...programs.map((program) => renderProgramGallery(program)),
  ].join("\n");
}

async function updateReadme(galleryMarkdown: string): Promise<void> {
  const current = await readFile(readmePath, "utf8");
  const startIndex = current.indexOf(galleryStartMarker);
  const endIndex = current.indexOf(galleryEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README.md is missing sample gallery markers.");
  }

  const before = current.slice(0, startIndex + galleryStartMarker.length);
  const after = current.slice(endIndex);
  const next = `${before}\n\n${galleryMarkdown}\n\n${after}`;
  await writeFile(readmePath, next, "utf8");
}

async function renderProgramGalleryAssets(): Promise<readonly GalleryProgram[]> {
  const programs = listPrograms();
  const renderedPrograms: GalleryProgram[] = [];
  const diagnostics = await getToolDiagnostics();
  const optimized = diagnostics.vpype.available;

  await rm(galleryDir, { force: true, recursive: true });
  await mkdir(galleryDir, { recursive: true });

  for (const program of programs) {
    const paramSets = await listParamSets(program.id);
    const programDir = path.join(galleryDir, program.id);
    await mkdir(programDir, { recursive: true });

    const cards: GalleryCard[] = [];

    for (const paramSet of paramSets.items) {
      const outputPath = path.join(programDir, `${paramSet.slug}.svg`);
      const outputPathRelativeToWorkspace = path.relative(workspaceRoot, outputPath);
      const renderResult = await exportSvg({
        programId: program.id,
        paramSetId: paramSet.slug,
        outPath: outputPathRelativeToWorkspace,
        optimized,
      });

      cards.push({
        slug: paramSet.slug,
        name: paramSet.name,
        imagePath: `./${path.posix.join("docs", "gallery", program.id, `${paramSet.slug}.svg`)}`,
        metrics: renderResult.metrics,
      });
    }

    renderedPrograms.push({
      id: program.id,
      title: program.title,
      description: program.description,
      cards,
    });
  }

  return renderedPrograms;
}

async function main(): Promise<void> {
  const programs = await renderProgramGalleryAssets();
  const galleryMarkdown = renderGalleryMarkdown(programs);
  await updateReadme(galleryMarkdown);
  process.stdout.write(
    `Rendered ${programs.length} program galleries to ${path.relative(rootDir, galleryDir)} and updated README.md\n`
  );
}

await main();
