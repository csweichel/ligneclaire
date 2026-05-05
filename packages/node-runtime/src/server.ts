import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { createParamSet, deleteParamSet, listParamSets, loadParamSet, saveParamSet } from "./param-store";
import { exportGcodeDownload, exportSvgDownload } from "./exports";
import { RuntimeError, toRuntimeError } from "./errors";
import type {
  CreateParamSetRequest,
  DownloadArtifact,
  DownloadGcodeRequest,
  DownloadSvgRequest,
  RenderRequest,
  SaveParamSetRequest,
} from "./api-types";
import { getProgramDetails, listPrograms } from "./registry";
import { renderProgram } from "./render";
import { listPlotters } from "./plotters";
import { getToolDiagnostics } from "./tools";

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch (error) {
    throw new RuntimeError("INVALID_JSON_BODY", "Request body must be valid JSON.", {
      status: 400,
      cause: error,
    });
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendDownload(response: ServerResponse, artifact: DownloadArtifact): void {
  response.writeHead(200, {
    "content-type": artifact.contentType,
    "content-disposition": `attachment; filename="${artifact.fileName}"`,
    "content-length": `${Buffer.byteLength(artifact.content, "utf8")}`,
  });
  response.end(artifact.content, "utf8");
}

function matchProgramParams(pathname: string): { programId: string; slug?: string } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 4 && parts[0] === "api" && parts[1] === "programs" && parts[3] === "params") {
    return { programId: decodeURIComponent(parts[2]!) };
  }

  if (
    parts.length === 5 &&
    parts[0] === "api" &&
    parts[1] === "programs" &&
    parts[3] === "params" &&
    parts[4]
  ) {
    return {
      programId: decodeURIComponent(parts[2]!),
      slug: decodeURIComponent(parts[4]),
    };
  }

  return null;
}

function matchProgramDetails(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "programs") {
    return decodeURIComponent(parts[2]!);
  }
  return null;
}

export function createApiServer(port = 7345, host = "127.0.0.1") {
  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const method = request.method ?? "GET";
      const pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;

      if (method === "GET" && pathname === "/api/programs") {
        sendJson(response, 200, listPrograms());
        return;
      }

      if (method === "GET" && pathname === "/api/plotters") {
        sendJson(response, 200, await listPlotters());
        return;
      }

      const programId = matchProgramDetails(pathname);
      if (method === "GET" && programId) {
        sendJson(response, 200, getProgramDetails(programId));
        return;
      }

      const paramsMatch = matchProgramParams(pathname);
      if (paramsMatch && !paramsMatch.slug && method === "GET") {
        sendJson(response, 200, await listParamSets(paramsMatch.programId));
        return;
      }

      if (paramsMatch && paramsMatch.slug && method === "GET") {
        sendJson(response, 200, await loadParamSet(paramsMatch.programId, paramsMatch.slug));
        return;
      }

      if (paramsMatch && !paramsMatch.slug && method === "POST") {
        const body = await readJsonBody<CreateParamSetRequest>(request);
        sendJson(response, 201, await createParamSet(paramsMatch.programId, body));
        return;
      }

      if (paramsMatch && paramsMatch.slug && method === "PUT") {
        const body = await readJsonBody<SaveParamSetRequest>(request);
        sendJson(response, 200, await saveParamSet(paramsMatch.programId, paramsMatch.slug, body));
        return;
      }

      if (paramsMatch && paramsMatch.slug && method === "DELETE") {
        await deleteParamSet(paramsMatch.programId, paramsMatch.slug);
        sendJson(response, 204, { ok: true });
        return;
      }

      if (method === "POST" && pathname === "/api/render") {
        const body = await readJsonBody<RenderRequest>(request);
        sendJson(response, 200, await renderProgram(body));
        return;
      }

      if (method === "POST" && pathname === "/api/export/svg") {
        const body = await readJsonBody<DownloadSvgRequest>(request);
        sendDownload(response, await exportSvgDownload(body));
        return;
      }

      if (method === "POST" && pathname === "/api/export/gcode") {
        const body = await readJsonBody<DownloadGcodeRequest>(request);
        sendDownload(response, await exportGcodeDownload(body));
        return;
      }

      if (method === "GET" && pathname === "/api/system/tools") {
        sendJson(response, 200, await getToolDiagnostics());
        return;
      }

      sendJson(response, 404, {
        code: "NOT_FOUND",
        message: `No route matches ${method} ${pathname}`,
      });
    } catch (error) {
      const runtimeError = toRuntimeError(error);
      sendJson(response, runtimeError.status, {
        code: runtimeError.code,
        message: runtimeError.message,
        details: runtimeError.details,
      });
    }
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  return {
    host,
    port,
    server,
    listen: async () =>
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const api = createApiServer();
  api
    .listen()
    .then(() => {
      process.stdout.write(`LigneClaire runtime listening on http://${api.host}:${api.port}\n`);
    })
    .catch((error) => {
      const runtimeError = toRuntimeError(error);
      process.stderr.write(`${runtimeError.code}: ${runtimeError.message}\n`);
      process.exit(1);
    });
}
