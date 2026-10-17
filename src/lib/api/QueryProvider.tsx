"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { getQueryClient } from "./query";

/**
 * TanStack Query for the client components below it — one client per tab, so every `QueryProvider` shares one
 * cache. Not mounted by the root layout (D-179): a page or sheet that uses queries wraps itself, and TanStack
 * Query ships only with it.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
