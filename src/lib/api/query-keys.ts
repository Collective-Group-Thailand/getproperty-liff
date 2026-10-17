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
