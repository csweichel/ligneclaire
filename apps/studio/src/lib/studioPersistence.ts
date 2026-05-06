import type { CurrentDocumentState, ExportRotationSetting, ExportSettings } from "../types";

const storageKey = "ligneclaire.studio.session.v1";

type StoredDocumentDraft = Readonly<{
  current: CurrentDocumentState;
  savedSnapshot: string;
}>;

export type StudioSessionState = Readonly<{
  selectedProgramId: string;
  selectedParamSetByProgram: Readonly<Record<string, string>>;
  exportSettings: ExportSettings | null;
  drafts: Readonly<Record<string, StoredDocumentDraft>>;
}>;

const emptySessionState: StudioSessionState = {
  selectedProgramId: "",
  selectedParamSetByProgram: {},
  exportSettings: null,
  drafts: {},
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseRotationDeg(value: unknown): ExportRotationSetting | null {
  switch (value) {
    case "auto":
    case 0:
    case 90:
    case 180:
    case 270:
      return value;
    default:
      return null;
  }
}

function parseExportSettings(value: unknown): ExportSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const rotationDeg = parseRotationDeg(candidate.rotationDeg);
  const oversizeHandling = candidate.oversizeHandling;

  if (
    typeof candidate.deviceId !== "string" ||
    rotationDeg === null ||
    (oversizeHandling !== "ignore" &&
      oversizeHandling !== "scale" &&
      oversizeHandling !== "clip")
  ) {
    return null;
  }

  return {
    deviceId: candidate.deviceId,
    rotationDeg,
    oversizeHandling,
  };
}

function parseDrafts(value: unknown): Readonly<Record<string, StoredDocumentDraft>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.savedSnapshot !== "string" ||
        !candidate.current ||
        typeof candidate.current !== "object"
      ) {
        return [];
      }

      return [
        [
          key,
          {
            current: candidate.current as CurrentDocumentState,
            savedSnapshot: candidate.savedSnapshot,
          } satisfies StoredDocumentDraft,
        ],
      ];
    })
  );
}

export function draftStorageKey(programId: string, slug: string): string {
  return `${programId}::${slug}`;
}

export function loadStudioSessionState(): StudioSessionState {
  if (!canUseLocalStorage()) {
    return emptySessionState;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return emptySessionState;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      selectedProgramId:
        typeof parsed.selectedProgramId === "string" ? parsed.selectedProgramId : "",
      selectedParamSetByProgram:
        parsed.selectedParamSetByProgram &&
        typeof parsed.selectedParamSetByProgram === "object"
          ? Object.fromEntries(
              Object.entries(
                parsed.selectedParamSetByProgram as Record<string, unknown>
              ).filter((entry): entry is [string, string] => typeof entry[1] === "string")
            )
          : {},
      exportSettings: parseExportSettings(parsed.exportSettings),
      drafts: parseDrafts(parsed.drafts),
    };
  } catch {
    return emptySessionState;
  }
}

export function saveStudioSessionState(
  state: StudioSessionState
): StudioSessionState {
  if (!canUseLocalStorage()) {
    return state;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep the in-memory session state.
  }
  return state;
}
