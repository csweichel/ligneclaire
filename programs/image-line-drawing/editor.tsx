import type { ProgramEditorProps } from "@ligneclaire/sdk";
import { ProgramEditorPanel } from "@ligneclaire/ui";
import { useEffect, useMemo, useState, type JSX } from "react";
import {
  buildImageLineDrawingCache,
  defaultImageLineDrawingProgramState,
  encodeGrayscaleBytes,
  imageHash,
  imageLineDrawingCacheKey,
  type ImageLineDrawingProgramState,
  type ImageLineDrawingSchema,
} from "./index";

type Props = ProgramEditorProps<ImageLineDrawingSchema, ImageLineDrawingProgramState>;

type ImportedImage = Readonly<{
  columns: number;
  rows: number;
  values: readonly number[];
}>;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image."));
    };
    image.src = url;
  });
}

function imageDimensions(
  width: number,
  height: number,
  maxDimension: number
): Readonly<{ columns: number; rows: number }> {
  const scale = maxDimension / Math.max(width, height, 1);
  return {
    columns: Math.max(2, Math.round(width * scale)),
    rows: Math.max(2, Math.round(height * scale)),
  };
}

async function importImageFile(file: File, maxDimension: number): Promise<ImportedImage> {
  const image = await loadImageElement(file);
  const { columns, rows } = imageDimensions(image.naturalWidth, image.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas image processing is unavailable.");
  }

  context.fillStyle = "white";
  context.fillRect(0, 0, columns, rows);
  context.drawImage(image, 0, 0, columns, rows);

  const rgba = context.getImageData(0, 0, columns, rows).data;
  const values: number[] = [];
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3]! / 255;
    const red = rgba[index]! * alpha + 255 * (1 - alpha);
    const green = rgba[index + 1]! * alpha + 255 * (1 - alpha);
    const blue = rgba[index + 2]! * alpha + 255 * (1 - alpha);
    values.push(Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722));
  }

  return {
    columns,
    rows,
    values,
  };
}

export default function ImageLineDrawingEditor({
  params,
  programState,
  updateProgramState,
}: Props): JSX.Element {
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const expectedCacheKey = useMemo(
    () =>
      programState.image
        ? imageLineDrawingCacheKey(programState.image, params)
        : "",
    [programState.image, params]
  );

  useEffect(() => {
    if (!programState.image || programState.cache?.key === expectedCacheKey) {
      return;
    }

    const cache = buildImageLineDrawingCache(programState.image, params);
    updateProgramState((current) =>
      current.image?.hash === programState.image?.hash
        ? {
            ...current,
            cache,
          }
        : current
    );
  }, [expectedCacheKey, params, programState.cache?.key, programState.image, updateProgramState]);

  return (
    <ProgramEditorPanel>
      <div className="lc-editor-overlay__header">
        <p className="lc-editor-overlay__eyebrow">Program Editor</p>
        <h3 className="lc-editor-overlay__title">Image Trace</h3>
      </div>

      <p className="lc-editor-overlay__copy">
        Upload an image to convert it into grayscale contours stitched as a single plotted line.
      </p>

      <label className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Image file
          <span className="lc-editor-overlay__value">
            {isImporting ? "Importing..." : `${params.maxImageDimension}px max`}
          </span>
        </span>
        <input
          accept="image/*"
          className="lc-parameter-field__number"
          disabled={isImporting}
          type="file"
          onChange={async (event) => {
            const [file] = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (!file) {
              return;
            }

            setImportError(null);
            setIsImporting(true);
            try {
              const imported = await importImageFile(file, params.maxImageDimension);
              const valuesBase64 = encodeGrayscaleBytes(imported.values);
              const image = {
                columns: imported.columns,
                rows: imported.rows,
                valuesBase64,
                hash: imageHash(imported.columns, imported.rows, valuesBase64),
              };
              updateProgramState(() => ({
                sourceName: file.name,
                image,
                cache: buildImageLineDrawingCache(image, params),
              }));
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "Failed to import image.");
            } finally {
              setIsImporting(false);
            }
          }}
        />
      </label>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Source
          <span className="lc-editor-overlay__value">{programState.sourceName}</span>
        </span>
      </div>

      <div className="lc-editor-overlay__field">
        <span className="lc-editor-overlay__label">
          Cache
          <span className="lc-editor-overlay__value">
            {programState.cache?.key === expectedCacheKey
              ? `${programState.cache.path.points.length} points`
              : "Refreshing"}
          </span>
        </span>
      </div>

      {importError ? (
        <p
          style={{
            color: "var(--studio-danger, #b91c1c)",
            fontSize: 13,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {importError}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            updateProgramState(() => defaultImageLineDrawingProgramState());
          }}
        >
          Restore default
        </button>

        <button
          className="studio-button studio-button--compact"
          type="button"
          onClick={() => {
            updateProgramState((current) => ({
              ...current,
              cache: current.image ? buildImageLineDrawingCache(current.image, params) : null,
            }));
          }}
        >
          Rebuild cache
        </button>
      </div>
    </ProgramEditorPanel>
  );
}
