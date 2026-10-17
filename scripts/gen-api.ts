// copied from getproperty-web@08ff63b until collective-shared exists (D-155) — adapted: resident/technician operations only, MSW operation table, idempotency list, source commit in the lock; committed-contract adopt (API_CONTRACT_REF) ported from getproperty-web
/**
 * Generates the typed API surface from `getproperty-api`'s OpenAPI contract (ADR-0005).
 *
 *   pnpm gen:api           regenerate from the vendored contract
 *   pnpm gen:api --check   fail if the committed output is stale or was hand-edited (CI `contract` job)
 *   pnpm gen:api --adopt   copy the contract named by API_CONTRACT_SOURCE (at the commit API_CONTRACT_REF,
 *                          default HEAD; never an uncommitted copy unless --allow-dirty) into
 *                          contract/openapi.json and rewrite contract.lock.json, then regenerate
 *
 * Written, all committed:
 *   src/lib/api/schema.d.ts                the only source of API types (CLAUDE.md)
 *   src/lib/api/operations.generated.ts    the operations this app may call + which need an Idempotency-Key
 *   mocks/generated/operations.ts          examples and documented problems per operation, for MSW
 *
 * Only the operations this app uses are emitted into the operation tables (master plan §5): `/v1/resident/*`,
 * `/v1/technician/*`, `/v1/auth/resident/*`, `/v1/auth/technician/*`, plus `/v1/auth/refresh` and
 * `/v1/auth/logout`, which the BFF calls on the resident's behalf. `schema.d.ts` keeps the whole document so
 * shared schemas resolve.
 *
 * Why a vendored copy rather than fetching here: CI has no sibling checkout of getproperty-api and no
 * credentials for a private release asset, so the drift gate has to be reproducible offline. `--adopt` is the
 * one command that reaches outside this repo; it rewrites the vendored copy and the lock together so bumping
 * the pinned contract is a reviewable act.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";
import { format, resolveConfig } from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = resolve(ROOT, "contract.lock.json");
const VENDORED = resolve(ROOT, "contract/openapi.json");
const OUT_SCHEMA = resolve(ROOT, "src/lib/api/schema.d.ts");
const OUT_OPERATIONS = resolve(ROOT, "src/lib/api/operations.generated.ts");
const OUT_MOCKS = resolve(ROOT, "mocks/generated/operations.ts");

/** Path prefixes this app calls (the BFF allow-list is narrower: refresh/logout are server-only). */
export const USED_PATH =
  /^\/v1\/(resident|technician|auth\/resident|auth\/technician)(\/|$)|^\/v1\/auth\/(refresh|logout)$/;

interface ContractLock {
  $comment?: string;
  /** `info.version` of the vendored document. */
  version: string;
  sha256: string;
  /** Where `--adopt` took it from (a path or URL) — documentation, never fetched automatically. */
  source: string;
  /** getproperty-api commit the contract was generated at, when adopted from a git checkout. */
  sourceCommit?: string;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

/**
 * Reads the contract to adopt (ported from getproperty-web's gen-api). From a git checkout of
 * getproperty-api only a **committed** contract is adopted — `API_CONTRACT_REF` (default `HEAD`) names the
 * commit — so the lock always points at a version that exists in the backend's history; a working copy with
 * uncommitted contract changes is refused unless `--allow-dirty`. A source outside git is read as is.
 */
function readSource(path: string): { text: string; commit?: string } {
  const top = git(dirname(path), ["rev-parse", "--show-toplevel"])?.trim();
  if (!top) return { text: readFileSync(path, "utf8") };
  const relativePath = relative(top, path);
  const ref = process.env.API_CONTRACT_REF ?? "HEAD";
  const dirty = git(top, ["status", "--porcelain", "--", relativePath])?.trim();
  if (dirty && !process.env.API_CONTRACT_REF && !process.argv.includes("--allow-dirty")) {
    console.error(
      `${relativePath} has uncommitted changes in ${top}. Adopt a commit (API_CONTRACT_REF=<sha>) or pass --allow-dirty.`,
    );
    process.exit(1);
  }
  if (dirty && process.argv.includes("--allow-dirty") && !process.env.API_CONTRACT_REF) {
    return { text: readFileSync(path, "utf8"), commit: `${git(top, ["rev-parse", "HEAD"])?.trim()}+dirty` };
  }
  const text = git(top, ["show", `${ref}:${relativePath}`]);
  if (text === undefined) {
    console.error(`${ref}:${relativePath} does not exist in ${top}.`);
    process.exit(1);
  }
  return { text, commit: git(top, ["rev-parse", ref])?.trim() };
}

function adopt(): void {
  const source = process.env.API_CONTRACT_SOURCE ?? "../getproperty-api/contract/openapi.json";
  const path = resolve(ROOT, source);
  if (!existsSync(path)) {
    console.error(
      `API_CONTRACT_SOURCE (${source}) does not exist. Point it at getproperty-api's contract/openapi.json.`,
    );
    process.exit(1);
  }
  const { text, commit } = readSource(path);
  const document = JSON.parse(text) as { info?: { version?: string } };
  mkdirSync(dirname(VENDORED), { recursive: true });
  writeFileSync(VENDORED, text);
  const lock: ContractLock = {
    $comment:
      "The getproperty-api contract this frontend is generated from. Change with `pnpm gen:api --adopt`, never by hand.",
    version: document.info?.version ?? "0.0.0",
    sha256: sha256(text),
    source,
    sourceCommit: commit,
  };
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.info(`adopted contract ${lock.version} from ${source}${lock.sourceCommit ? ` @ ${lock.sourceCommit}` : ""}`);
}

// ── operation tables ─────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
interface Document {
  paths: Record<string, Record<string, Json>>;
  components: { examples?: Record<string, { value: unknown }>; parameters?: Record<string, Json> };
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function deref<T>(doc: Document, value: unknown): T {
  if (value && typeof value === "object" && "$ref" in value) {
    const ref = String((value as { $ref: string }).$ref);
    const parts = ref.replace(/^#\//, "").split("/");
    let node: unknown = doc;
    for (const part of parts) node = (node as Json)[part];
    return node as T;
  }
  return value as T;
}

interface ProblemRow {
  status: number;
  code: string;
  example: unknown;
}

interface OperationRow {
  operationId: string;
  method: Uppercase<(typeof METHODS)[number]>;
  path: string;
  surface: string;
  idempotent: boolean;
  success: { status: number; contentType: string | null; example: unknown };
  problems: ProblemRow[];
}

function operationRows(doc: Document): OperationRow[] {
  const rows: OperationRow[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    if (!USED_PATH.test(path)) continue;
    for (const method of METHODS) {
      const op = item[method] as Json | undefined;
      if (!op) continue;
      const params = ((op.parameters as unknown[]) ?? []).map((p) => deref<Json>(doc, p));
      const responses = op.responses as Record<string, Json>;
      const successStatus = Object.keys(responses)
        .map(Number)
        .filter((s) => s >= 200 && s < 300)
        .sort()[0];
      if (successStatus === undefined) throw new Error(`${String(op.operationId)} has no success response`);
      const success = responses[String(successStatus)]!;
      const content = (success.content as Record<string, Json> | undefined) ?? {};
      const contentType = Object.keys(content)[0] ?? null;
      const media = contentType ? content[contentType]! : undefined;
      const example =
        media?.example ??
        (media?.examples
          ? deref<{ value: unknown }>(doc, Object.values(media.examples as Record<string, unknown>)[0]).value
          : null);
      const problems: ProblemRow[] = [];
      for (const [status, response] of Object.entries(responses)) {
        if (Number(status) < 400) continue;
        const problemMedia = (response.content as Record<string, Json> | undefined)?.["application/problem+json"];
        for (const [code, ex] of Object.entries((problemMedia?.examples as Record<string, unknown>) ?? {})) {
          problems.push({ status: Number(status), code, example: deref<{ value: unknown }>(doc, ex).value });
        }
      }
      rows.push({
        operationId: String(op.operationId),
        method: method.toUpperCase() as OperationRow["method"],
        path,
        surface: String(op["x-surface"] ?? ""),
        idempotent: params.some((p) => String(p.name).toLowerCase() === "idempotency-key" && p.in === "header"),
        success: { status: successStatus, contentType, example },
        problems: problems.sort((a, b) => a.status - b.status || a.code.localeCompare(b.code)),
      });
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

async function pretty(path: string, source: string): Promise<string> {
  const options = (await resolveConfig(path)) ?? {};
  return format(source, { ...options, filepath: path });
}

async function renderOperations(rows: OperationRow[], lock: ContractLock): Promise<string> {
  const list = rows.map(({ operationId, method, path, idempotent }) => ({ operationId, method, path, idempotent }));
  return pretty(
    OUT_OPERATIONS,
    `/* GENERATED by pnpm gen:api from contract/openapi.json (getproperty-api ${lock.version}) — do not edit. */
/** Operations of the contract this app may call (resident, technician and their auth), with their path templates. */
export const OPERATIONS = ${JSON.stringify(list)} as const;

export type OperationId = (typeof OPERATIONS)[number]["operationId"];

/** \`METHOD /path/{template}\` of every operation whose contract requires an \`Idempotency-Key\` (contract §3). */
export const IDEMPOTENT_OPERATIONS: readonly string[] = ${JSON.stringify(
      list.filter((o) => o.idempotent).map((o) => `${o.method} ${o.path}`),
    )};
`,
  );
}

async function renderMocks(rows: OperationRow[], lock: ContractLock): Promise<string> {
  return pretty(
    OUT_MOCKS,
    `/* GENERATED by pnpm gen:api from contract/openapi.json (getproperty-api ${lock.version}) — do not edit. */
/**
 * Every operation this app uses with the contract's own success example and every documented problem (code,
 * status, example body) — the raw material of the MSW handlers in \`mocks/handlers.ts\`. Nothing here is
 * invented: endpoints the contract lacks are mocked by hand in \`mocks/contract-requests.ts\`.
 */
export interface GeneratedProblem {
  status: number;
  code: string;
  example: unknown;
}

export interface GeneratedOperation {
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  surface: string;
  idempotent: boolean;
  success: { status: number; contentType: string | null; example: unknown };
  problems: GeneratedProblem[];
}

export const CONTRACT_VERSION = ${JSON.stringify(lock.version)};

export const GENERATED_OPERATIONS: GeneratedOperation[] = ${JSON.stringify(rows)};
`,
  );
}

async function generate(check: boolean): Promise<void> {
  const text = readFileSync(VENDORED, "utf8");
  const lock = JSON.parse(readFileSync(LOCK, "utf8")) as ContractLock;
  if (sha256(text) !== lock.sha256) {
    console.error("contract/openapi.json does not match contract.lock.json — run `pnpm gen:api --adopt`.");
    process.exit(1);
  }

  const header = `/* GENERATED by pnpm gen:api from contract/openapi.json (getproperty-api ${lock.version}) — do not edit. */\n`;
  const ast = await openapiTS(new URL(`file://${VENDORED}`), { alphabetize: true });
  const rows = operationRows(JSON.parse(text) as Document);
  const outputs: [string, string][] = [
    [OUT_SCHEMA, header + astToString(ast)],
    [OUT_OPERATIONS, await renderOperations(rows, lock)],
    [OUT_MOCKS, await renderMocks(rows, lock)],
  ];

  if (check) {
    const stale = outputs.filter(([path, body]) => (existsSync(path) ? readFileSync(path, "utf8") : "") !== body);
    if (stale.length > 0) {
      for (const [path] of stale) console.error(`${path.replace(`${ROOT}/`, "")} is out of date`);
      console.error("Run `pnpm gen:api` and commit the result.");
      process.exit(1);
    }
    console.info(`generated API files are up to date (${rows.length} operations)`);
    return;
  }

  for (const [path, body] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    console.info(`wrote ${path.replace(`${ROOT}/`, "")}`);
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  if (process.argv.includes("--adopt")) adopt();

  if (!existsSync(VENDORED) || !existsSync(LOCK)) {
    console.error(
      "No contract vendored (contract/openapi.json + contract.lock.json). Run `pnpm gen:api --adopt` with API_CONTRACT_SOURCE pointing at getproperty-api's contract.",
    );
    process.exit(1);
  }
  await generate(check);
}

void main();
