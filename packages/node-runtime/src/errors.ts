export class RuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: Readonly<{
      status?: number;
      details?: unknown;
      cause?: unknown;
    }> = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "RuntimeError";
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

export function toRuntimeError(error: unknown): RuntimeError {
  if (error instanceof RuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    return new RuntimeError("INTERNAL_ERROR", error.message, {
      status: 500,
      cause: error,
    });
  }

  return new RuntimeError("INTERNAL_ERROR", "Unknown runtime failure.", {
    status: 500,
    details: error,
  });
}

