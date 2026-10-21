import { z } from "zod";

/**
 * The environment, validated with zod and split by where it may be read (CLAUDE.md, `.env.example`).
 *
 * - `serverEnv()` — server-only values (the API's internal URL, Sentry/OTel secrets, flags read at request time).
 *   Validated once at boot by `src/instrumentation.ts`, so a misconfigured deployment fails to start instead of
 *   failing on the first resident.
 * - `clientEnv` — `NEXT_PUBLIC_*` values, compiled into the bundle. Each is read as a literal
 *   `process.env.NEXT_PUBLIC_X` so Next inlines it; anything else would be `undefined` in the browser.
 */

const flag = z
  .enum(["0", "1", ""])
  .optional()
  .transform((value) => value === "1");

const optionalUrl = z
  .union([z.url(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const origin = optionalUrl.refine(
  (value) => value === undefined || new URL(value).origin === value.replace(/\/$/, ""),
  {
    message: "must be an origin (scheme://host[:port]) without a path",
  },
);

export const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** getproperty-api as seen from this server (never from the browser). */
    API_INTERNAL_URL: optionalUrl,
    /** Only `pnpm gen:api --adopt` reads it; listed so the whole environment is in one schema. */
    API_CONTRACT_SOURCE: z.string().optional(),
    /** 1 = answer API calls from the contract-based MSW handlers (`mocks/`), only in a mock build. */
    API_MOCKS: flag,
    /** Public origin of this app, for the BFF's same-origin check behind proxies that rewrite `Host`. */
    APP_ORIGIN: origin,
    /**
     * Proxies in front of this app that append the client address to `X-Forwarded-For`. On the Collective platform
     * (D-230, D-229) Caddy is the one proxy: it replaces the header of an internet client with that client's address,
     * so production sets 1 (collective-infra `products/getproperty/docker-compose.yml`). The BFF forwards the entry
     * this many from the right as the end user's address; 0 (default, local dev) forwards none. Never more than the
     * real number (review H2).
     */
    TRUSTED_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /**
     * Who may read `/api/metrics` (comma-separated IPs / CIDRs). Default: loopback + the private ranges — Grafana
     * Alloy on the platform's docker network. Requests through Caddy carry the internet client's address and get 404.
     * Parsed at boot by `src/instrumentation.ts` (an invalid entry stops the server; `node:net` stays out of this
     * module, which server components share with the client bundle's `clientEnv`).
     */
    METRICS_ALLOWED_CIDRS: z.string().optional(),
    /** R2 technician screens and BFF prefixes (`/v1/technician/*`, `/v1/auth/technician/*`). */
    FEATURE_TECHNICIAN: flag,
    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    /** OTLP/HTTP collector; when set, server fetches (incl. calls to the API) are traced (`@vercel/otel`). */
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
    OTEL_SERVICE_NAME: z.string().default("getproperty-liff"),
  })
  .superRefine((env, ctx) => {
    const mockBuild = process.env.NEXT_PUBLIC_LIFF_MOCK === "1";
    if (env.API_MOCKS && !mockBuild) {
      ctx.addIssue({
        code: "custom",
        path: ["API_MOCKS"],
        message: "API_MOCKS=1 needs a mock build (NEXT_PUBLIC_LIFF_MOCK=1 at build time)",
      });
    }
    if (!env.API_MOCKS && !env.API_INTERNAL_URL && env.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["API_INTERNAL_URL"], message: "required unless API_MOCKS=1" });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export const clientSchema = z.object({
  NEXT_PUBLIC_LIFF_ID: z.string().optional(),
  NEXT_PUBLIC_LIFF_MOCK: flag,
  /** The LINE Official Account (`@xxxx`) for "chat with the building" and "open in LINE" links. */
  NEXT_PUBLIC_LINE_OA_ID: z
    .string()
    .regex(/^@[\w.-]+$/, "a LINE OA id such as @getproperty")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Object storage that serves signed images and receives presigned uploads (CSP img-src / connect-src). */
  NEXT_PUBLIC_ASSET_BASE_URL: optionalUrl,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  /** `dev` / `uat` badge in the top bar; empty in production. */
  NEXT_PUBLIC_ENV_BADGE: z.string().max(12).optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

/** Literal reads so Next inlines them into the browser bundle. */
function rawClientEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID,
    NEXT_PUBLIC_LIFF_MOCK: process.env.NEXT_PUBLIC_LIFF_MOCK,
    NEXT_PUBLIC_LINE_OA_ID: process.env.NEXT_PUBLIC_LINE_OA_ID,
    NEXT_PUBLIC_ASSET_BASE_URL: process.env.NEXT_PUBLIC_ASSET_BASE_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ENV_BADGE: process.env.NEXT_PUBLIC_ENV_BADGE,
  };
}

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment:\n  - ${problems.join("\n  - ")}`);
    this.name = "InvalidEnvironmentError";
  }
}

/** Problems name the variable and the rule, never the value (it may be a secret). */
function problemsOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(raw);
  if (!result.success) throw new InvalidEnvironmentError(problemsOf(result.error));
  return result.data;
}

export function parseClientEnv(raw: Record<string, string | undefined>): ClientEnv {
  const result = clientSchema.safeParse(raw);
  if (!result.success) throw new InvalidEnvironmentError(problemsOf(result.error));
  return result.data;
}

let cachedServer: ServerEnv | null = null;

/** The validated server environment (cached; tests call `resetEnvForTesting`). */
export function serverEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}

let cachedClient: ClientEnv | null = null;

export function clientEnv(): ClientEnv {
  cachedClient ??= parseClientEnv(rawClientEnv());
  return cachedClient;
}

export function resetEnvForTesting(): void {
  cachedServer = null;
  cachedClient = null;
}
