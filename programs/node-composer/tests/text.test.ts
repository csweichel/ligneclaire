import { describe, expect, it } from "vitest";
import { generateTextPaths } from "../text";
import { googleTextFontBase64 } from "../text-fonts";

describe("node-composer text helper", () => {
  it("renders deterministic outlined paths from bundled Google fonts", () => {
    const first = generateTextPaths({
      center: { x: 50, y: 50 },
      text: "Ligne Claire",
      fontId: "inter",
      fontSize: 18,
      fontWeight: 450,
    });
    const second = generateTextPaths({
      center: { x: 50, y: 50 },
      text: "Ligne Claire",
      fontId: "inter",
      fontSize: 18,
      fontWeight: 450,
    });

    expect(first.paths).toEqual(second.paths);
    expect(first.paths.length).toBeGreaterThan(10);
  });

  it("changes glyph outlines when the requested font weight changes", () => {
    const light = generateTextPaths({
      center: { x: 0, y: 0 },
      text: "A",
      fontId: "space-grotesk",
      fontSize: 30,
      fontWeight: 300,
    });
    const bold = generateTextPaths({
      center: { x: 0, y: 0 },
      text: "A",
      fontId: "space-grotesk",
      fontSize: 30,
      fontWeight: 700,
    });

    expect(light.paths).not.toEqual(bold.paths);
  });

  it("accepts externally resolved font data instead of only bundled ids", () => {
    const first = generateTextPaths({
      center: { x: 10, y: 20 },
      text: "External",
      fontId: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontDataBase64: googleTextFontBase64("inter"),
      fontCacheKey: "google:Inter:400",
    });
    const second = generateTextPaths({
      center: { x: 10, y: 20 },
      text: "External",
      fontId: "Inter",
      fontSize: 16,
      fontWeight: 400,
      fontDataBase64: googleTextFontBase64("inter"),
      fontCacheKey: "google:Inter:400",
    });

    expect(first.paths).toEqual(second.paths);
    expect(first.paths.length).toBeGreaterThan(6);
  });

  it("keeps glyphs upright in the plot coordinate system", () => {
    const result = generateTextPaths({
      center: { x: 0, y: 0 },
      text: "F",
      fontId: "inter",
      fontSize: 30,
      fontWeight: 400,
    });
    const points = result.paths.flatMap((path) => path.points);
    const ys = points.map((point) => point.y);
    const midY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
    const topPoints = points.filter((point) => point.y > midY);
    const bottomPoints = points.filter((point) => point.y <= midY);
    const topMaxX = Math.max(...topPoints.map((point) => point.x));
    const bottomMaxX = Math.max(...bottomPoints.map((point) => point.x));

    expect(topMaxX).toBeGreaterThan(bottomMaxX);
  });
});
