/**
 * The real getproperty-api for the `integration` Playwright project (L1): a local PostgreSQL 18 started with the
 * API's own `pnpm db:local`, the asset-core and API migrations applied with the same SQL runner the API's
 * integration suite uses (Prisma's schema engine cannot be downloaded everywhere), the reference + dev seeds, one
 * resident party carrying the fake LINE user id with an occupancy of a dev unit, and the API itself
 * (`DATA_STORES_MODE=real` on PostgreSQL; Redis and MQTT in memory; `INTEGRATIONS_MODE=fake`, so LINE is the fake
 * verifier that accepts the fake LIFF's `fake-line.` id tokens, payments are the fake provider whose callbacks the
 * tests sign, and PDFs are fakes) and its worker process (L2: QR at issue, callbacks → payment → receipt). Object
 * storage is real S3 against a minimal in-memory store of the harness (L4: browser photo uploads the API verifies).
 *
 * Needs a sibling checkout `../getproperty-api` with `pnpm install` done and `pnpm build:fast` run (the harness
 * runs it when `dist/` is missing). State lives in a temp dir and is removed afterwards.
 *
 * `GETPROPERTY_API_REF=<commit>` runs a **committed** API instead of the working tree: the commit is exported with
 * `git archive` into the temp dir (the checkout's `node_modules` linked in) and built there, so the run is pinned to
 * the contract this app adopted (`contract.lock.json` → `sourceCommit`) and never writes into the checkout.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chownSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const API_DIR = resolve(process.env.GETPROPERTY_API_DIR ?? join(__dirname, "../../../getproperty-api"));
/** Exported to the test workers by the global setup. */
export const INT_DATABASE_ENV = "GP_INT_DATABASE_URL";
/** The development HMAC key of the API (`LOOKUP_HASH` of OTP codes) — the harness never sets FIELD_HASH_KEY. */
export const DEV_FIELD_HASH_KEY = "getproperty-dev-field-hash-key";
export const API_PORT = Number(process.env.INTEGRATION_API_PORT ?? 4610);
/**
 * A minimal S3-compatible object store for the API (`OBJECT_STORAGE_MODE=real`, path style): the fake storage's
 * presigned URLs are unreachable by design, but the L4 flows PUT photos from the browser and the API then HEADs them
 * (`document.not_uploaded` otherwise). Signatures are not checked; objects live in memory for the run.
 */
export const S3_PORT = Number(process.env.INTEGRATION_S3_PORT ?? 4611);
export const S3_ORIGIN = `http://127.0.0.1:${S3_PORT}`;
/** The LINE user id the fake LIFF signs in with; the harness gives this party an occupancy. */
export const RESIDENT_LINE_SUB = "U0000000000000000000000integration";
const DEV_TENANT = "0199f2a0-0000-7000-8000-000000000001";

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

export interface Harness {
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function pnpm(args: string[], cwd: string, env: Record<string, string> = {}): void {
  const result = spawnSync("pnpm", args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed in ${cwd}`);
}

/** `git archive <ref>` of the API checkout into `target`, with the checkout's dependencies linked in, built. */
function snapshotApi(ref: string, target: string): string {
  const dir = join(target, "api");
  mkdirSync(dir, { recursive: true });
  const archive = spawnSync("git", ["-C", API_DIR, "archive", "--format=tar", ref], { maxBuffer: 1024 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error(`git archive ${ref} failed: ${archive.stderr.toString()}`);
  const untar = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
  if (untar.status !== 0) throw new Error(`tar failed: ${untar.stderr.toString()}`);
  symlinkSync(join(API_DIR, "node_modules"), join(dir, "node_modules"), "dir");
  // The Prisma client is generated (gitignored) — from this commit's schema, like the API's postinstall does.
  pnpm(["prisma:generate"], dir);
  pnpm(["build:fast"], dir);
  return dir;
}

function waitForLine(child: ChildProcess, pattern: RegExp, timeoutMs: number, what: string): Promise<void> {
  return new Promise((resolveWait, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error(`${what} did not start in ${timeoutMs} ms:\n${log}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      log += chunk.toString();
      if (pattern.test(log)) {
        clearTimeout(timer);
        resolveWait();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${what} exited with ${code}:\n${log}`));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error(`${url} did not answer in ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function stopGroup(child: ChildProcess | undefined): Promise<void> {
  const pid = child?.pid;
  if (!child || !pid || child.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    child.once("exit", () => done());
    try {
      process.kill(-pid, "SIGINT");
    } catch {
      child.kill("SIGINT");
    }
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // already gone
      }
      done();
    }, 10_000);
  });
}

/** `aws-chunked` bodies (SDK streaming uploads): `<hex size>[;chunk-signature=…]\r\n<bytes>\r\n` … `0\r\n`. */
function decodeAwsChunked(body: Buffer): Buffer {
  const parts: Buffer[] = [];
  let at = 0;
  for (;;) {
    const lineEnd = body.indexOf("\r\n", at);
    if (lineEnd < 0) break;
    const size = parseInt(body.subarray(at, lineEnd).toString().split(";")[0]!, 16);
    if (!size) break;
    parts.push(body.subarray(lineEnd + 2, lineEnd + 2 + size));
    at = lineEnd + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => done(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

export function startObjectStore(): Promise<Server> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const server = createHttpServer((req, res) => {
    void (async () => {
      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, PUT, HEAD, DELETE",
        "access-control-allow-headers": "*",
        "access-control-expose-headers": "etag",
      };
      const path = decodeURIComponent(new URL(req.url ?? "/", S3_ORIGIN).pathname);
      const isBucket = path.split("/").filter(Boolean).length <= 1;
      if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
      if (req.method === "PUT") {
        const raw = await readBody(req);
        const chunked =
          /aws-chunked/.test(String(req.headers["content-encoding"] ?? "")) ||
          String(req.headers["x-amz-content-sha256"] ?? "").startsWith("STREAMING-");
        const body = chunked ? decodeAwsChunked(raw) : raw;
        objects.set(path, { body, contentType: String(req.headers["content-type"] ?? "application/octet-stream") });
        return res.writeHead(200, { ...cors, etag: `"${createHash("md5").update(body).digest("hex")}"` }).end();
      }
      if (req.method === "DELETE") {
        objects.delete(path);
        return res.writeHead(204, cors).end();
      }
      if (isBucket) return res.writeHead(200, cors).end();
      const found = objects.get(path);
      if (!found)
        return res
          .writeHead(404, { ...cors, "content-type": "application/xml" })
          .end(req.method === "HEAD" ? undefined : "<Error><Code>NoSuchKey</Code></Error>");
      res.writeHead(200, {
        ...cors,
        "content-type": found.contentType,
        "content-length": String(found.body.length),
        etag: `"${createHash("md5").update(found.body).digest("hex")}"`,
      });
      return res.end(req.method === "HEAD" ? undefined : found.body);
    })().catch((error: unknown) => res.writeHead(500).end(String(error)));
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(S3_PORT, "127.0.0.1", () => done(server));
  });
}

/** Same algorithm and bookkeeping as getproperty-api's `test/support/prisma-migrations.ts`. */
async function applyPrismaMigrations(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  apiDir: string,
) {
  await db.query(`CREATE TABLE IF NOT EXISTS public."_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  const dir = join(apiDir, "prisma/migrations");
  for (const name of readdirSync(dir)
    .filter((d) => /^\d{14}_/.test(d))
    .sort()) {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        `INSERT INTO public."_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, now(), $3, now(), 1)`,
        [randomUUID(), createHash("sha256").update(sql).digest("hex"), name],
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw new Error(`migration ${name} failed: ${(error as Error).message}`);
    }
  }
}

export async function startHarness(): Promise<Harness> {
  if (!existsSync(join(API_DIR, "package.json"))) {
    throw new Error(`getproperty-api not found at ${API_DIR} (set GETPROPERTY_API_DIR)`);
  }
  // 1. PostgreSQL via the API's `pnpm db:local` (runs as OS user postgres when we are root).
  const parent = mkdtempSync(join(tmpdir(), "gp-liff-int-"));
  const ref = process.env.GETPROPERTY_API_REF;
  const apiDir = ref ? snapshotApi(ref, parent) : API_DIR;
  if (!existsSync(join(apiDir, "dist/src/main.js"))) pnpm(["build:fast"], apiDir);
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) {
    const id = (flag: string) => Number(spawnSync("id", [flag, "postgres"], { encoding: "utf8" }).stdout.trim());
    chownSync(parent, id("-u"), id("-g"));
  }
  const pgPort = await freePort();
  const pg = spawn("pnpm", ["db:local", "start"], {
    cwd: apiDir,
    detached: true,
    env: { ...process.env, LOCAL_PG_DIR: join(parent, "data"), LOCAL_PG_PORT: String(pgPort) },
  });
  await waitForLine(pg, /PostgreSQL ready/, 120_000, "pnpm db:local");
  const databaseUrl = `postgresql://gp:gp@127.0.0.1:${pgPort}/getproperty`;

  // 2. Migrations (asset-core, then the API's) and the reference + dev seeds, as the API's integration suite does.
  const requireFromApi = createRequire(join(apiDir, "package.json"));
  const { Client } = requireFromApi("pg") as { Client: new (options: { connectionString: string }) => PgClient };
  const { assetCoreMigrate } = requireFromApi("@collective/asset-core") as {
    assetCoreMigrate: (o: { client: unknown }) => Promise<unknown>;
  };
  const { runSeed } = requireFromApi(join(apiDir, "dist/prisma/seed/run.js")) as {
    runSeed: (db: unknown, mode: "dev") => Promise<unknown>;
  };
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await assetCoreMigrate({ client: db });
    await applyPrismaMigrations(db, apiDir);
    await runSeed(db, "dev");
    // 3. The resident: a party with the fake LINE user id and an occupancy of the first dev unit (D-061 line_match).
    const party = await db.query<{ id: string }>(
      `INSERT INTO core.party (tenant_id, type, display_name, line_user_id, language)
       VALUES ($1, 'person', 'ผู้เช่า ทดสอบ', $2, 'th') RETURNING id`,
      [DEV_TENANT, RESIDENT_LINE_SUB],
    );
    await db.query(
      `INSERT INTO core.occupancy (tenant_id, building_id, unit_id, party_id, role, valid_from)
       SELECT u.tenant_id, u.building_id, u.id, $2, 'tenant', '2026-01-01'
         FROM core.unit u WHERE u.tenant_id = $1 ORDER BY u.unit_no LIMIT 1`,
      [DEV_TENANT, party.rows[0]!.id],
    );
    // L4: the service-request module is on for the dev tenant (`module.service_requests` is off by default, B5.1).
    await db.query(
      `INSERT INTO platform.feature_flag_override (feature_flag_id, tenant_id, enabled, reason)
       SELECT f.id, $1, true, 'getproperty-liff integration (L4)' FROM platform.feature_flag f
        WHERE f.key = 'module.service_requests'
       ON CONFLICT (feature_flag_id, tenant_id) DO UPDATE SET enabled = true`,
      [DEV_TENANT],
    );
  } finally {
    await db.end();
  }

  // 4. The API and its worker (outbox relay → subscribers: the QR at issue, payment callbacks, receipts — L2). With
  //    in-memory Redis each process has its own queue; the outbox in PostgreSQL is what they share.
  const apiEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(API_PORT),
    LOG_PRETTY: "false",
    LOG_LEVEL: "warn",
    DATA_STORES_MODE: "real",
    REDIS_MODE: "fake",
    MQTT_MODE: "fake",
    INTEGRATIONS_MODE: "fake",
    OBJECT_STORAGE_MODE: "real",
    OBJECT_STORAGE_DRIVER: "s3",
    AWS_ENDPOINT_URL: S3_ORIGIN,
    AWS_REGION: "ap-southeast-1",
    AWS_ACCESS_KEY_ID: "integration",
    AWS_SECRET_ACCESS_KEY: "integration",
    AWS_REQUEST_CHECKSUM_CALCULATION: "WHEN_REQUIRED",
    AWS_RESPONSE_CHECKSUM_VALIDATION: "WHEN_REQUIRED",
    S3_BUCKET: "getproperty-int",
    S3_FORCE_PATH_STYLE: "true",
    DATABASE_URL: databaseUrl,
    DATABASE_APP_ROLE: "gp_app",
    DATABASE_PLATFORM_ROLE: "gp_platform",
    PUBLIC_API_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    PUBLIC_RESIDENT_APP_URL: "http://localhost:3600",
  };
  const objectStore = await startObjectStore();
  const api = spawn(process.execPath, ["dist/src/main.js"], { cwd: apiDir, detached: true, env: apiEnv });
  let apiLog = "";
  // `INTEGRATION_LOG_DIR=<dir>` keeps the API's and the worker's logs of the run (api.log, worker.log).
  const logDir = process.env.INTEGRATION_LOG_DIR;
  const keep = (name: string) => (chunk: Buffer) => {
    if (logDir) appendFileSync(join(logDir, name), chunk);
  };
  if (logDir) mkdirSync(logDir, { recursive: true });
  api.stdout?.on("data", (c: Buffer) => (apiLog += c.toString()));
  api.stderr?.on("data", (c: Buffer) => (apiLog += c.toString()));
  api.stdout?.on("data", keep("api.log"));
  api.stderr?.on("data", keep("api.log"));
  const worker = spawn(process.execPath, ["dist/src/worker.js"], { cwd: apiDir, detached: true, env: apiEnv });
  let workerLog = "";
  worker.stdout?.on("data", (c: Buffer) => (workerLog += c.toString()));
  worker.stderr?.on("data", (c: Buffer) => (workerLog += c.toString()));
  worker.stdout?.on("data", keep("worker.log"));
  worker.stderr?.on("data", keep("worker.log"));
  try {
    await waitForHttp(`http://127.0.0.1:${API_PORT}/v1/auth/ping`, 90_000);
    if (worker.exitCode !== null)
      throw new Error(`the API worker exited with ${worker.exitCode}:\n${workerLog.slice(-4000)}`);
  } catch (error) {
    await stopGroup(worker);
    await stopGroup(api);
    await stopGroup(pg);
    objectStore.close();
    throw new Error(`${(error as Error).message}\n--- api log ---\n${apiLog.slice(-4000)}`);
  }

  process.env[INT_DATABASE_ENV] = databaseUrl;
  return {
    async stop() {
      await stopGroup(worker);
      await stopGroup(api);
      await stopGroup(pg);
      objectStore.close();
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

/** A database client for a test (the harness's PostgreSQL), through the API checkout's `pg`. */
export async function intDatabase(): Promise<PgClient> {
  const url = process.env[INT_DATABASE_ENV];
  if (!url) throw new Error(`${INT_DATABASE_ENV} is not set — run through playwright.integration.config.ts`);
  const { Client } = createRequire(join(API_DIR, "package.json"))("pg") as {
    Client: new (options: { connectionString: string }) => PgClient;
  };
  const db = new Client({ connectionString: url });
  await db.connect();
  return db;
}

/**
 * Sets the code of the newest OTP challenge of `purpose` to `code`. With `INTEGRATIONS_MODE=fake` the SMS stays in
 * the API's memory; the challenge row holds only the HMAC of the code (D-148), so the test replaces it with the
 * HMAC of a code it knows (same key and binding as the API's `LookupHasher.secret`).
 */
export async function setLatestOtpCode(purpose: string, code: string): Promise<string> {
  const db = await intDatabase();
  try {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM platform.otp_challenge WHERE purpose = $1 ORDER BY created_at DESC LIMIT 1`,
      [purpose],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error(`no ${purpose} OTP challenge`);
    const hash = createHmac("sha256", DEV_FIELD_HASH_KEY).update(`${id}|${code}`, "utf8").digest();
    await db.query(`UPDATE platform.otp_challenge SET code_hash = $2 WHERE id = $1`, [id, hash]);
    return id;
  } finally {
    await db.end();
  }
}

/** Where the Owner's token of this run is kept: Playwright starts a new worker process after a failed test. */
function ownerTokenFile(): string {
  const run = createHash("sha256")
    .update(process.env[INT_DATABASE_ENV] ?? "")
    .digest("hex")
    .slice(0, 16);
  return join(tmpdir(), `gp-liff-int-owner-${run}.json`);
}

/**
 * The dev seed's Owner (`+660000000001`) signed in over HTTP: an operator access token for the office's side. One
 * sign-in per test run (the API refuses a second OTP to the same phone within its cooldown), reused for 10 minutes.
 */
export async function ownerAccessToken(request: {
  post: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ status(): number; text(): Promise<string>; json(): Promise<unknown> }>;
}): Promise<string> {
  try {
    const cached = JSON.parse(readFileSync(ownerTokenFile(), "utf8")) as { token: string; at: number };
    if (Date.now() - cached.at < 10 * 60_000) return cached.token;
  } catch {
    // none yet
  }
  const api = `http://127.0.0.1:${API_PORT}`;
  const code = "246810";
  const challenge = await request.post(`${api}/v1/auth/operator/otp/request`, { data: { phone: "+660000000001" } });
  if (challenge.status() !== 200) throw new Error(`owner OTP request: ${challenge.status()} ${await challenge.text()}`);
  const { challengeId } = (await challenge.json()) as { challengeId: string };
  await setLatestOtpCode("operator_login", code);
  const verified = await request.post(`${api}/v1/auth/operator/otp/verify`, { data: { challengeId, code } });
  if (verified.status() !== 200) throw new Error(`owner OTP verify: ${verified.status()} ${await verified.text()}`);
  const token = ((await verified.json()) as { accessToken: string }).accessToken;
  writeFileSync(ownerTokenFile(), JSON.stringify({ token, at: Date.now() }));
  return token;
}
