import { RuntimeError } from "./errors";

type GoogleFontMetadata = Readonly<{
  family: string;
  category?: string | null;
  popularity?: number | null;
  fonts?: Readonly<Record<string, unknown>>;
}>;

type GoogleFontsMetadataResponse = Readonly<{
  familyMetadataList?: readonly GoogleFontMetadata[];
}>;

type GoogleFontSearchResult = Readonly<{
  family: string;
  category: string;
  availableWeights: readonly number[];
}>;

type GoogleFontResolveResult = Readonly<{
  family: string;
  resolvedWeight: number;
  fontDataBase64: string;
  fontCacheKey: string;
}>;

const GOOGLE_FONT_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const GOOGLE_FONT_CSS_BASE_URL = "https://fonts.googleapis.com/css2?family=";

let metadataPromise: Promise<readonly GoogleFontMetadata[]> | null = null;
const resolvedFontCache = new Map<string, Promise<GoogleFontResolveResult>>();

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function availableWeights(metadata: GoogleFontMetadata): readonly number[] {
  const fonts = metadata.fonts ?? {};

  return Object.keys(fonts)
    .filter((key) => /^\d+$/.test(key))
    .map((key) => Number(key))
    .sort((left, right) => left - right);
}

function chooseResolvedWeight(weights: readonly number[], requestedWeight: number): number {
  const requested = Number.isFinite(requestedWeight) ? Math.round(requestedWeight) : 400;
  if (weights.length === 0) {
    return Math.min(900, Math.max(100, requested));
  }

  let nearest = weights[0]!;
  let nearestDistance = Math.abs(nearest - requested);

  for (const weight of weights.slice(1)) {
    const distance = Math.abs(weight - requested);
    if (distance < nearestDistance || (distance === nearestDistance && weight < nearest)) {
      nearest = weight;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function googleCssFamilyParam(family: string): string {
  return family
    .trim()
    .split(/\s+/)
    .map((part) => encodeURIComponent(part))
    .join("+");
}

function parseCssFontUrl(css: string): string | null {
  const match = css.match(/url\((['"]?)(https:\/\/[^)'"]+\.ttf)\1\)/i);
  return match?.[2] ?? null;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new RuntimeError(
      "GOOGLE_FONTS_REQUEST_FAILED",
      `Google Fonts request failed with ${response.status}.`,
      { status: 502 }
    );
  }

  return await response.text();
}

async function loadGoogleFontsMetadata(): Promise<readonly GoogleFontMetadata[]> {
  if (!metadataPromise) {
    metadataPromise = (async () => {
      const response = await fetch(GOOGLE_FONT_METADATA_URL);
      if (!response.ok) {
        throw new RuntimeError(
          "GOOGLE_FONTS_METADATA_FAILED",
          `Google Fonts metadata request failed with ${response.status}.`,
          { status: 502 }
        );
      }

      const payload = (await response.json()) as GoogleFontsMetadataResponse;
      return payload.familyMetadataList ?? [];
    })();
  }

  return await metadataPromise;
}

function familyMatchesQuery(family: string, query: string): boolean {
  const normalizedFamily = family.toLowerCase();
  const terms = query.split(/\s+/).filter((term) => term.length > 0);

  return terms.every((term) => normalizedFamily.includes(term));
}

function familySearchScore(family: string, query: string): number {
  if (query.length === 0) {
    return 0;
  }

  const normalizedFamily = family.toLowerCase();
  if (normalizedFamily === query) {
    return 0;
  }

  if (normalizedFamily.startsWith(query)) {
    return 1;
  }

  return normalizedFamily.indexOf(query) >= 0 ? 2 : 3;
}

export async function searchGoogleFonts(
  query: string,
  limit = 24
): Promise<readonly GoogleFontSearchResult[]> {
  const normalizedQuery = normalizeSearchQuery(query);
  const metadata = await loadGoogleFontsMetadata();

  return [...metadata]
    .filter((item) =>
      normalizedQuery.length === 0 ? true : familyMatchesQuery(item.family, normalizedQuery)
    )
    .sort((left, right) => {
      const scoreDelta =
        familySearchScore(left.family, normalizedQuery) - familySearchScore(right.family, normalizedQuery);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftPopularity = left.popularity ?? Number.MAX_SAFE_INTEGER;
      const rightPopularity = right.popularity ?? Number.MAX_SAFE_INTEGER;
      if (leftPopularity !== rightPopularity) {
        return leftPopularity - rightPopularity;
      }

      return left.family.localeCompare(right.family);
    })
    .slice(0, Math.max(1, Math.min(50, Math.floor(limit))))
    .map((item) => ({
      family: item.family,
      category: item.category ?? "Unknown",
      availableWeights: availableWeights(item),
    }));
}

export async function resolveGoogleFont(
  family: string,
  requestedWeight: number
): Promise<GoogleFontResolveResult> {
  const normalizedFamily = normalizeSearchQuery(family);
  if (normalizedFamily.length === 0) {
    throw new RuntimeError("GOOGLE_FONT_INVALID_FAMILY", "A Google font family is required.", {
      status: 400,
    });
  }

  const metadata = await loadGoogleFontsMetadata();
  const match = metadata.find((item) => item.family.toLowerCase() === normalizedFamily);
  if (!match) {
    throw new RuntimeError(
      "GOOGLE_FONT_NOT_FOUND",
      `Google font "${family}" was not found.`,
      { status: 404 }
    );
  }

  const resolvedWeight = chooseResolvedWeight(availableWeights(match), requestedWeight);
  const cacheKey = `${match.family}::${resolvedWeight}`;
  const cached = resolvedFontCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const pending = (async () => {
    const css = await fetchText(
      `${GOOGLE_FONT_CSS_BASE_URL}${googleCssFamilyParam(match.family)}:wght@${resolvedWeight}`
    );
    const fontUrl = parseCssFontUrl(css);
    if (!fontUrl) {
      throw new RuntimeError(
        "GOOGLE_FONT_RESOLVE_FAILED",
        `Unable to resolve a TrueType font file for "${match.family}".`,
        { status: 502 }
      );
    }

    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new RuntimeError(
        "GOOGLE_FONT_DOWNLOAD_FAILED",
        `Downloading "${match.family}" failed with ${response.status}.`,
        { status: 502 }
      );
    }

    const fontDataBase64 = Buffer.from(await response.arrayBuffer()).toString("base64");

    return {
      family: match.family,
      resolvedWeight,
      fontDataBase64,
      fontCacheKey: `google:${match.family}:${resolvedWeight}`,
    } satisfies GoogleFontResolveResult;
  })();

  resolvedFontCache.set(cacheKey, pending);

  try {
    return await pending;
  } catch (error) {
    resolvedFontCache.delete(cacheKey);
    throw error;
  }
}
