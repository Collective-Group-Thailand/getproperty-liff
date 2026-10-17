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
}

export const BANK_APPS: readonly BankApp[] = [
  { id: "kbank", url: "kplus://" }, // UNVERIFIED against live provider
  { id: "scb", url: "scbeasy://" }, // UNVERIFIED against live provider
  { id: "ktb", url: "ktbnext://" }, // UNVERIFIED against live provider
  { id: "bbl", url: "bualuang://" }, // UNVERIFIED against live provider
  { id: "bay", url: "kma://" }, // UNVERIFIED against live provider
  { id: "ttb", url: "ttbtouch://" }, // UNVERIFIED against live provider
  { id: "gsb", url: "mymo://" }, // UNVERIFIED against live provider
];
