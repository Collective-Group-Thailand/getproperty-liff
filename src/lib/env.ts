import { z } from "zod";

/**
 * The environment, validated with zod (CLAUDE.md, `.env.example`), read **on the server at run time**:
 * `serverEnv()` parses the whole `process.env` object once (validated at boot by `src/instrumentation.ts`, so a
 * misconfigured deployment fails to start instead of failing on the first resident).
 *
 * **One image for every environment** (D-230, getproperty-web's ADR-0009): collective-infra's `promote.yml` ships the
 * image that passed UAT to production without a rebuild, so nothing environment-specific may be compiled in. The
 * public values keep their `NEXT_PUBLIC_*` names (they are public by definition: the LIFF id, the VAPID public key,
 * the browser's Sentry DSN, the environment badge, the asset origin) but are never read as literal
 * `process.env.NEXT_PUBLIC_…` member expressions, which `next build` would inline. The browser gets them from the
 * server-rendered root `<html data-liff-id data-sentry-dsn data-env>` (`src/app/(liff)/layout.tsx`, read by
 * `src/lib/publicConfig.ts`) or as props of server-rendered pages. `runtime-env.test.ts` guards it.
 *
 * The one exception is `NEXT_PUBLIC_LIFF_MOCK`: not an environment value but the **build flavour** — "1" only for
 * the mock builds of e2e, Storybook and Lighthouse; the platform image is always built without it, so the fake
 * LIFF and the mock API are not in it at all (`next.config.ts` pins it to "0"/"1", `pnpm release:hygiene` checks).
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

/**
 * The public half — read on the server at run time and handed to the browser, so it never holds a secret.
 * Defined before the server schema, which includes it.
 */
const publicShape = {
  /** LIFF app id of this environment's LINE Login channel (LINE Developers console → LIFF), `1234567890-AbCdEfGh`. */
  NEXT_PUBLIC_LIFF_ID: z
    .string()
    .trim()
    .regex(/^\d+-[A-Za-z0-9]+$/, "a LIFF id such as 1234567890-AbCdEfGh")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /**
   * The LINE Official Account (`@xxxx`) — L1's schema. No screen links it today (a building's LINE chat comes from the
   * API's contacts, `lineChatUrl`); kept validated so a deployment that sets it keeps starting.
   */
  NEXT_PUBLIC_LINE_OA_ID: z
    .string()
    .regex(/^@[\w.-]+$/, "a LINE OA id such as @getproperty")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Object storage that serves signed images and receives presigned uploads (CSP img-src / connect-src). */
  NEXT_PUBLIC_ASSET_BASE_URL: optionalUrl,
  /** Web push application server key (the API's `WEB_PUSH_VAPID_PUBLIC_KEY`). */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  /** Browser error reporting (public by design: a DSN only accepts events). */
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  /** `dev` / `uat` badge in the top bar and the browser's Sentry environment; "production" or empty = none. */
  NEXT_PUBLIC_ENV_BADGE: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((value) => (value && value.toLowerCase() !== "production" ? value : undefined)),
};

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
     * module, which the proxy and the route handlers share).
     */
    METRICS_ALLOWED_CIDRS: z.string().optional(),
    /**
     * The owner console of getproperty-web (`https://<OWNER_HOST>`): the landlord's quick actions link there for the
     * heavier work (L5 5.3). Unset = those links are not shown.
     */
    OWNER_CONSOLE_URL: origin,
    /** R2 technician screens and BFF prefixes (`/v1/technician/*`, `/v1/auth/technician/*`). */
    FEATURE_TECHNICIAN: flag,
    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
    /** OTLP/HTTP collector; when set, server fetches (incl. calls to the API) are traced (`@vercel/otel`). */
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
    OTEL_SERVICE_NAME: z.string().default("getproperty-liff"),
    /**
     * Google and Apple outside LINE for prospects and residents (D-255, D-283). Unset = `live` in production (a button
     * shows only when its client below is configured) and `fake` elsewhere (a local test page stands in for the
     * provider and hands back the fake tokens getproperty-api's fake verifiers accept). LINE is LIFF / "open in LINE".
     */
    OAUTH_MODE: z.enum(["live", "fake"]).optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    APPLE_SERVICES_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    /** The Sign in with Apple `.p8` key (PEM, `\n` allowed). */
    APPLE_PRIVATE_KEY: z.string().optional(),
    /** Web API key of getproperty's Firebase project (Google / Apple id token → Firebase ID token). */
    FIREBASE_WEB_API_KEY: z.string().optional(),
    ...publicShape,
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
    // A platform container without its LIFF id would pass its health check and fail for every resident inside LINE.
    if (!mockBuild && !env.NEXT_PUBLIC_LIFF_ID && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_LIFF_ID"],
        message: "required in production (not a mock build)",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

/** `OAUTH_MODE` with its default: live in production, fake elsewhere. */
export function oauthMode(env: ServerEnv): "live" | "fake" {
  return env.OAUTH_MODE ?? (env.NODE_ENV === "production" ? "live" : "fake");
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

let cachedServer: ServerEnv | null = null;

/** The validated server environment (cached; tests call `resetEnvForTesting`). */
export function serverEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}

export function resetEnvForTesting(): void {
  cachedServer = null;
}
