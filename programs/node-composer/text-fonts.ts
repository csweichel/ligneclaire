import { googleFontBase64ById } from "./text-font-data.generated";

export const googleTextFonts = [
  {
    id: "inter",
    label: "Inter",
    sourceUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf",
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    sourceUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    sourceUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
  },
  {
    id: "cormorant-garamond",
    label: "Cormorant Garamond",
    sourceUrl:
      "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
  },
] as const;

export type GoogleTextFontId = (typeof googleTextFonts)[number]["id"];

export function isGoogleTextFontId(fontId: string): fontId is GoogleTextFontId {
  return googleTextFonts.some((font) => font.id === fontId);
}

export function googleTextFontBase64(fontId: GoogleTextFontId): string {
  return googleFontBase64ById[fontId];
}
