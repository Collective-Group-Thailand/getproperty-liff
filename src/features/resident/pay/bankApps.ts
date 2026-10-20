/**
 * "Open my banking app" (L2 2.2 §1): the Thai banks' mobile apps by their URL scheme, opened the LIFF way
 * (`openExternal` → `liff.openWindow({ external: true })`, never `window.open`). The resident then scans the QR
 * they saved, or picks it from the gallery inside the bank app.
 *
 * UNVERIFIED against live provider: the schemes are the ones the banks' apps register on iOS and Android as
 * publicly documented at the time of writing; a phone without that app shows nothing (the copy says so). Listed in
 * docs/PROGRESS.md — confirm on real devices before release (release checklist).
 */
export interface BankApp {
  /** Key under `resident.pay.banks` (the bank's own name in Thai/English). */
  id: "kbank" | "scb" | "ktb" | "bbl" | "bay" | "ttb" | "gsb";
  url: string;
  /** The Bank of Thailand's 3-digit bank code (`ResidentAccountDto.bankCode`). */
  code: string;
}

export const BANK_APPS: readonly BankApp[] = [
  { id: "kbank", code: "004", url: "kplus://" }, // UNVERIFIED against live provider
  { id: "scb", code: "014", url: "scbeasy://" }, // UNVERIFIED against live provider
  { id: "ktb", code: "006", url: "ktbnext://" }, // UNVERIFIED against live provider
  { id: "bbl", code: "002", url: "bualuang://" }, // UNVERIFIED against live provider
  { id: "bay", code: "025", url: "kma://" }, // UNVERIFIED against live provider
  { id: "ttb", code: "011", url: "ttbtouch://" }, // UNVERIFIED against live provider
  { id: "gsb", code: "030", url: "mymo://" }, // UNVERIFIED against live provider
];

/** The landlord's own bank first (`bankCode`, D-209) — the transfer is cheapest and fastest there — then the rest. */
export function bankAppsFor(bankCode: string | null | undefined): readonly BankApp[] {
  const own = BANK_APPS.find((bank) => bank.code === bankCode);
  return own ? [own, ...BANK_APPS.filter((bank) => bank !== own)] : BANK_APPS;
}
