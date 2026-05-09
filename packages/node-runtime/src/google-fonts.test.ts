import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

const metadataFixture = {
  familyMetadataList: [
    {
      family: "Inter",
      category: "Sans Serif",
      popularity: 1,
      fonts: {
        "100": {},
        "200": {},
        "300": {},
        "400": {},
        "500": {},
        "600": {},
        "700": {},
      },
    },
    {
      family: "Inria Serif",
      category: "Serif",
      popularity: 80,
      fonts: {
        "300": {},
        "400": {},
        "700": {},
      },
    },
  ],
};

function installGoogleFontsFetchMock() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);

    if (url === "https://fonts.google.com/metadata/fonts") {
      return new Response(JSON.stringify(metadataFixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.startsWith("https://fonts.googleapis.com/css2?family=Inter")) {
      return new Response(
        "@font-face { src: url(https://fonts.gstatic.com/mock/inter-500.ttf) format('truetype'); }",
        {
          status: 200,
          headers: { "content-type": "text/css" },
        }
      );
    }

    if (url === "https://fonts.gstatic.com/mock/inter-500.ttf") {
      return new Response(Buffer.from("mock-font-binary"), {
        status: 200,
        headers: { "content-type": "font/ttf" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("google fonts runtime helpers", () => {
  it("searches the Google Fonts catalog by family name", async () => {
    installGoogleFontsFetchMock();
    const { searchGoogleFonts } = await import("./google-fonts");

    const results = await searchGoogleFonts("in", 10);

    expect(results).toEqual([
      {
        family: "Inter",
        category: "Sans Serif",
        availableWeights: [100, 200, 300, 400, 500, 600, 700],
      },
      {
        family: "Inria Serif",
        category: "Serif",
        availableWeights: [300, 400, 700],
      },
    ]);
  });

  it("resolves the nearest available Google font weight and caches the download", async () => {
    const fetchMock = installGoogleFontsFetchMock();
    const { resolveGoogleFont } = await import("./google-fonts");

    const first = await resolveGoogleFont("Inter", 460);
    const second = await resolveGoogleFont("Inter", 460);

    expect(first).toEqual({
      family: "Inter",
      resolvedWeight: 500,
      fontDataBase64: Buffer.from("mock-font-binary").toString("base64"),
      fontCacheKey: "google:Inter:500",
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
