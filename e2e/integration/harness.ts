/**
 * The real getproperty-api for the `integration` Playwright project (L1): a local PostgreSQL 18 started with the
 * API's own `pnpm db:local`, the asset-core and API migrations applied with the same SQL runner the API's
 * integration suite uses (Prisma's schema engine cannot be downloaded everywhere), the reference + dev seeds, one
 * resident party carrying the fake LINE user id with an occupancy of a dev unit, and the API itself
 * (`DATA_STORES_MODE=real` on PostgreSQL; Redis and MQTT in memory; `INTEGRATIONS_MODE=fake`, so LINE is the fake
 * verifier that accepts the fake LIFF's `fake-line.` id tokens).
 *
 * Needs a sibling checkout `../getproperty-api` with `pnpm install` done and `pnpm build:fast` run (the harness
 * runs it when `dist/` is missing). State lives in a temp dir and is removed afterwards.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chownSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const API_DIR = resolve(process.env.GETPROPERTY_API_DIR ?? join(__dirname, "../../../getproperty-api"));
export const API_PORT = Number(process.env.INTEGRATION_API_PORT ?? 4610);
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

function pnpm(args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync("pnpm", args, { cwd: API_DIR, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed in ${API_DIR}`);
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

/** Same algorithm and bookkeeping as getproperty-api's `test/support/prisma-migrations.ts`. */
async function applyPrismaMigrations(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(`CREATE TABLE IF NOT EXISTS public."_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
  const dir = join(API_DIR, "prisma/migrations");
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
  if (!existsSync(join(API_DIR, "dist/src/main.js"))) pnpm(["build:fast"]);

  // 1. PostgreSQL via the API's `pnpm db:local` (runs as OS user postgres when we are root).
  const parent = mkdtempSync(join(tmpdir(), "gp-liff-int-"));
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (isRoot) {
    const id = (flag: string) => Number(spawnSync("id", [flag, "postgres"], { encoding: "utf8" }).stdout.trim());
    chownSync(parent, id("-u"), id("-g"));
  }
  const pgPort = await freePort();
  const pg = spawn("pnpm", ["db:local", "start"], {
    cwd: API_DIR,
    detached: true,
    env: { ...process.env, LOCAL_PG_DIR: join(parent, "data"), LOCAL_PG_PORT: String(pgPort) },
  });
  await waitForLine(pg, /PostgreSQL ready/, 120_000, "pnpm db:local");
  const databaseUrl = `postgresql://gp:gp@127.0.0.1:${pgPort}/getproperty`;

  // 2. Migrations (asset-core, then the API's) and the reference + dev seeds, as the API's integration suite does.
  const requireFromApi = createRequire(join(API_DIR, "package.json"));
  const { Client } = requireFromApi("pg") as { Client: new (options: { connectionString: string }) => PgClient };
  const { assetCoreMigrate } = requireFromApi("@collective/asset-core") as {
    assetCoreMigrate: (o: { client: unknown }) => Promise<unknown>;
  };
  const { runSeed } = requireFromApi(join(API_DIR, "dist/prisma/seed/run.js")) as {
    runSeed: (db: unknown, mode: "dev") => Promise<unknown>;
  };
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await assetCoreMigrate({ client: db });
    await applyPrismaMigrations(db);
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
  } finally {
    await db.end();
  }

  // 4. The API.
  const api = spawn(process.execPath, ["dist/src/main.js"], {
    cwd: API_DIR,
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(API_PORT),
      LOG_PRETTY: "false",
      LOG_LEVEL: "warn",
      DATA_STORES_MODE: "real",
      REDIS_MODE: "fake",
      MQTT_MODE: "fake",
      INTEGRATIONS_MODE: "fake",
      DATABASE_URL: databaseUrl,
      DATABASE_APP_ROLE: "gp_app",
      DATABASE_PLATFORM_ROLE: "gp_platform",
      PUBLIC_API_BASE_URL: `http://127.0.0.1:${API_PORT}`,
      PUBLIC_RESIDENT_APP_URL: "http://localhost:3600",
    },
  });
  let apiLog = "";
  api.stdout?.on("data", (c: Buffer) => (apiLog += c.toString()));
  api.stderr?.on("data", (c: Buffer) => (apiLog += c.toString()));
  try {
    await waitForHttp(`http://127.0.0.1:${API_PORT}/v1/auth/ping`, 90_000);
  } catch (error) {
    await stopGroup(api);
    await stopGroup(pg);
    throw new Error(`${(error as Error).message}\n--- api log ---\n${apiLog.slice(-4000)}`);
  }

  return {
    async stop() {
      await stopGroup(api);
      await stopGroup(pg);
      rmSync(parent, { recursive: true, force: true });
    },
  };
}
