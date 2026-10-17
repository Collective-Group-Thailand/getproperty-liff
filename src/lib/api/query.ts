import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "./problem";

/**
 * Query keys, one factory for the whole app, so invalidation (realtime events, mutations) can name what it
 * touches: `queryClient.invalidateQueries({ queryKey: qk.resident.all })`.
 */
export const qk = {
  resident: {
    all: ["resident"] as const,
    me: () => ["resident", "me"] as const,
    consents: (language: string) => ["resident", "consents", language] as const,
    notifications: () => ["resident", "notifications"] as const,
    invoices: () => ["resident", "invoices"] as const,
    payments: () => ["resident", "payments"] as const,
    receipts: () => ["resident", "receipts"] as const,
  },
  technician: {
    all: ["technician"] as const,
    me: () => ["technician", "me"] as const,
    workOrders: () => ["technician", "work-orders"] as const,
  },
} as const;

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
