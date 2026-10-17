import type { ProblemBody, ProblemFieldError } from "./types";

/**
 * An RFC 9457 problem from the API (or from the BFF itself, `bff.*`) as a typed error (contract §3). `code` is
 * stable and machine-readable; `detail` is already localised by `Accept-Language`; `compliance.*` problems carry
 * `legalRef`, which the UI shows with the message and never works around (CLAUDE.md).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly requestId: string | undefined;
  readonly legalRef: string | undefined;
  readonly errors: ProblemFieldError[];
  /** The whole problem body, for the code-specific extras (`attemptsRemaining`, `shown` …). */
  readonly problem: Partial<ProblemBody> & Record<string, unknown>;

  constructor(status: number, problem: Partial<ProblemBody> & Record<string, unknown>, requestId?: string) {
    const code = typeof problem.code === "string" ? problem.code : `http.${status}`;
    super(`${code}: ${typeof problem.detail === "string" ? problem.detail : (problem.title ?? status)}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.title = typeof problem.title === "string" ? problem.title : "";
    this.detail = typeof problem.detail === "string" ? problem.detail : "";
    this.requestId = typeof problem.requestId === "string" ? problem.requestId : requestId;
    this.legalRef = typeof problem.legalRef === "string" ? problem.legalRef : undefined;
    this.errors = Array.isArray(problem.errors) ? (problem.errors as ProblemFieldError[]) : [];
    this.problem = problem;
  }

  get isCompliance(): boolean {
    return this.code.startsWith("compliance.");
  }

  /** The message for one form field (`path` as the API reports it, e.g. `phone`). */
  fieldError(path: string): string | undefined {
    return this.errors.find((error) => error.path === path)?.message;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Turns a non-2xx response into an `ApiError`, whatever its body (a proxy's HTML 502 included). */
export async function problemFromResponse(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const type = response.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  if (type.includes("json")) {
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  return new ApiError(response.status, body, requestId);
}

/** Builds the error from an openapi-fetch `error` value (already parsed) and its response. */
export function problemFromParsed(response: Response, error: unknown): ApiError {
  const body = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return new ApiError(response.status, body, response.headers.get("x-request-id") ?? undefined);
}
