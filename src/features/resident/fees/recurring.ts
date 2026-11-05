/**
 * Units where the recurring channel answered `recurring.unavailable` on this device (contract request #44: the API
 * says so only when a mandate is created). Kept in `localStorage` behind try/catch (LINE's browser may refuse it):
 * the auto-pay link then stays hidden there instead of offering what cannot work.
 */
const KEY = "gp.recurringOff";

export function recurringOffUnits(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecurringOff(unitId: string): void {
  try {
    const units = new Set(recurringOffUnits());
    units.add(unitId);
    window.localStorage.setItem(KEY, JSON.stringify([...units].slice(-20)));
  } catch {
    // Storage refused: the explanation is shown again next time — harmless.
  }
}
