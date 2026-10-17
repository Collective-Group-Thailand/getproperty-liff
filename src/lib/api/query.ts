import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "./problem";
import { announceQueryClient } from "./query-runtime";

export { qk } from "./query-keys";

/**
 * Defaults (design-system.md §7): data is fresh for 30 s; a LIFF view that comes back to the foreground
 * refetches; 4xx answers are not retried (they will not change by themselves), 5xx and network errors twice.
 * Mutations never retry — irreversible POSTs are made safe by their `Idempotency-Key`, not by retrying blindly.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

/**
 * The tab's one client (D-179: created on demand, by the first `QueryProvider` that mounts). Announced to
 * `query-runtime` so realtime invalidation can reach it without importing TanStack Query itself.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return createQueryClient();
  if (!browserClient) {
    browserClient = createQueryClient();
    announceQueryClient(browserClient);
  }
  return browserClient;
}
