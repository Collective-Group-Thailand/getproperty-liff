import { startHarness } from "./harness";

/** Starts PostgreSQL + getproperty-api for the `integration` project; returns the teardown (Playwright ≥ 1.30). */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const harness = await startHarness();
  return () => harness.stop();
}
