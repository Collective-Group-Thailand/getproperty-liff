import { describe, expect, it } from "vitest";

import { loadMessages } from "@/i18n/messages";
import { ICON_NAMES } from "@/ui/icons/registry";

import { DEPOSIT_STATUS } from "./deposit";
import { INVOICE_STATUS } from "./invoice";
import { LEASE_STATUS } from "./lease";
import { PARCEL_STATUS } from "./parcel";
import { PAYMENT_STATUS } from "./payment";
import { READING_SOURCE } from "./reading";
import { SERVICE_REQUEST_STATUS } from "./serviceRequest";
import { WORK_ORDER_STATUS } from "./workOrder";

const MAPS = {
  invoice: INVOICE_STATUS,
  payment: PAYMENT_STATUS,
  lease: LEASE_STATUS,
  deposit: DEPOSIT_STATUS,
  serviceRequest: SERVICE_REQUEST_STATUS,
  workOrder: WORK_ORDER_STATUS,
  parcel: PARCEL_STATUS,
  readingSource: READING_SOURCE,
};

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

describe("domain status maps", () => {
  it.each(Object.entries(MAPS))("%s: every value has a th and en label and a registered icon", async (_, map) => {
    const [th, en] = await Promise.all([loadMessages("th"), loadMessages("en")]);
    for (const meta of Object.values(map)) {
      expect(typeof lookup(th, meta.labelKey), meta.labelKey).toBe("string");
      expect(typeof lookup(en, meta.labelKey), meta.labelKey).toBe("string");
      expect(ICON_NAMES).toContain(meta.icon);
    }
  });

  it("never shows a late bill in red (D-100)", () => {
    expect(INVOICE_STATUS.overdue.tone).toBe("warning");
    expect(Object.values(INVOICE_STATUS).some((meta) => meta.tone === "danger")).toBe(false);
  });
});
