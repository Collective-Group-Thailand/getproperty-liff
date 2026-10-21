import "server-only";

import { collectDefaultMetrics, Registry } from "@prometheus-io/client";

/**
 * Prometheus metrics of this server process (D-230, the Collective platform's image contract): Grafana Alloy scrapes
 * `/api/metrics` of every container labelled `collective.metrics` on the docker network. Node.js runtime metrics
 * (event-loop lag, heap, GC, handles, CPU, resident memory) with the label `service` — the same families
 * getproperty-api exposes, so one dashboard reads all of them. Nothing per request, per user or per URL.
 *
 * One registry per process, kept on `globalThis`: Next bundles route handlers separately, and default metrics may be
 * registered only once.
 */
const KEY = Symbol.for("getproperty-liff.metrics");

interface Holder {
  [KEY]?: Registry;
}

export function processMetrics(service: string): Registry {
  const holder = globalThis as Holder;
  let registry = holder[KEY];
  if (!registry) {
    registry = new Registry();
    registry.setDefaultLabels({ service });
    collectDefaultMetrics({ register: registry });
    holder[KEY] = registry;
  }
  return registry;
}

export function resetMetricsForTesting(): void {
  const holder = globalThis as Holder;
  holder[KEY]?.clear();
  delete holder[KEY];
}
