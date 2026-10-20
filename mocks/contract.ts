/**
 * Access to the generated operation table (`mocks/generated/operations.ts`, `pnpm gen:api`): the contract's own
 * examples and documented problems. Handlers answer with these bodies so a mock can never drift from the
 * contract's shapes without `pnpm gen:api --check` failing first.
 */
import { HttpResponse } from "msw";

import { GENERATED_OPERATIONS, type GeneratedOperation } from "./generated/operations";

const byId = new Map(GENERATED_OPERATIONS.map((op) => [op.operationId, op]));

export function operation(operationId: string): GeneratedOperation {
  const op = byId.get(operationId);
  if (!op) throw new Error(`${operationId} is not in the contract — list it in docs/contract-requests.md first`);
  return op;
}

/** The contract's success example, deep-copied so handlers can adjust it. */
export function example<T>(operationId: string): T {
  return structuredClone(operation(operationId).success.example) as T;
}

/** A documented problem of an operation, with the contract's example body. */
export function problem(operationId: string, code: string, overrides: Record<string, unknown> = {}): Response {
  const entry = operation(operationId).problems.find((p) => p.code === code);
  if (!entry) throw new Error(`${operationId} does not document problem ${code}`);
  return problemResponse(entry.status, { ...(entry.example as Record<string, unknown>), ...overrides });
}

export function problemResponse(status: number, body: Record<string, unknown>): Response {
  const requestId = crypto.randomUUID();
  return HttpResponse.json(
    { ...body, requestId },
    { status, headers: { "content-type": "application/problem+json", "x-request-id": requestId } },
  );
}

/** `/v1/resident/notifications/{notificationId}/actions/read` → a RegExp for a concrete path. */
export function pathPattern(template: string): RegExp {
  const pattern = template
    .split("/")
    .map((segment) => (/^\{[^}]+\}$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${pattern}$`);
}

/** MSW path for a contract template on any origin: `{id}` → `:id`. */
export function mswPath(template: string): string {
  return `*${template.replace(/\{([^}]+)\}/g, ":$1")}`;
}

export function findOperation(method: string, pathname: string): GeneratedOperation | undefined {
  return GENERATED_OPERATIONS.find((op) => op.method === method && pathPattern(op.path).test(pathname));
}

export { GENERATED_OPERATIONS };
