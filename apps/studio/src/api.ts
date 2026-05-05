type ApiErrorPayload = Readonly<{
  message?: string;
}>;

function parseJsonPayload<Response>(text: string): Response {
  return text.length > 0 ? (JSON.parse(text) as Response) : ({} as Response);
}

async function readFailureMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (text.length === 0) {
    return `Request failed with ${response.status}`;
  }

  try {
    const payload = parseJsonPayload<ApiErrorPayload>(text);
    return payload.message ?? text;
  } catch {
    return text;
  }
}

function readDownloadFileName(response: Response): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
  return (plainMatch?.[1] ?? plainMatch?.[2] ?? "download").trim();
}

export async function apiGet<Response>(url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, signal ? { signal } : undefined);
  const text = await response.text();
  const payload = parseJsonPayload<Response & ApiErrorPayload>(text);
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export async function apiSend<Request, Response>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: Request,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await response.text();
  const payload = parseJsonPayload<Response & ApiErrorPayload>(text);
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export async function apiDownload<Request>(
  url: string,
  body: Request,
  signal?: AbortSignal
): Promise<Readonly<{ fileName: string }>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readFailureMessage(response));
  }

  const blob = await response.blob();
  const fileName = readDownloadFileName(response);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  return { fileName };
}

export async function apiFetchTextArtifact<Request>(
  url: string,
  body: Request,
  signal?: AbortSignal
): Promise<Readonly<{ fileName: string; content: string }>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readFailureMessage(response));
  }

  return {
    fileName: readDownloadFileName(response),
    content: await response.text(),
  };
}
