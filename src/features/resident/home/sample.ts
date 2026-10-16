/**
 * L0 placeholder content for the resident home. Shaped like what `/v1/resident/home` will return
 * (amounts as decimal strings, dates as ISO) so the screen can be swapped onto the real contract in
 * L2 without changing how it renders. Nothing here is computed — the UI never computes money.
 */
export const SAMPLE_HOME = {
  residentName: "สมชาย",
  unit: { code: "A-302", building: "A", leaseEnd: "2027-09-30" },
  openInvoice: { number: "INV-2569-10-0302", period: "2026-10-01", amount: "4850.50", dueDate: "2026-10-25" },
} as const;
