import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SERVICE_REQUEST_STATUS } from "@/domain/status/serviceRequest";
import { LOCALES } from "@/i18n/routing";

import {
  categoryName,
  isOpenRequest,
  photosOf,
  splitRequests,
  timelineOf,
  visitState,
  type ServiceRequest,
  type ServiceRequestStatus,
} from "./model";

/** Every value of the contract's `ServiceRequestStatus` (the status map is typed by it). */
const STATUSES = Object.keys(SERVICE_REQUEST_STATUS) as ServiceRequestStatus[];

const request = (status: ServiceRequestStatus, extra: Partial<ServiceRequest> = {}) =>
  ({
    status,
    createdAt: "2026-11-01T09:00:00+07:00",
    doneAt: null,
    closedAt: null,
    events: [],
    photos: [],
    nextActions: [],
    visitAt: null,
    visitConfirmedAt: null,
    ...extra,
  }) as ServiceRequest;

describe("service request timeline (L4 4.1, D-159)", () => {
  it("covers all eight contract statuses", () => {
    expect(STATUSES.sort()).toEqual(
      ["assigned", "cancelled", "closed", "done", "in_progress", "new", "triaged", "waiting_parts"].sort(),
    );
  });

  it.each(STATUSES)("renders a request that is %s, ending in that status", (status) => {
    const done = ["done", "closed"].includes(status) ? { doneAt: "2026-11-02T10:00:00+07:00" } : {};
    const closed = ["closed", "cancelled"].includes(status) ? { closedAt: "2026-11-03T10:00:00+07:00" } : {};
    const steps = timelineOf(request(status, { ...done, ...closed }));
    expect(steps[0]).toEqual({ status: "new", at: "2026-11-01T09:00:00+07:00" });
    expect(steps.at(-1)!.status).toBe(status);
    // Only what the API dated carries a time; the current status of an open request has none.
    if (["triaged", "assigned", "in_progress", "waiting_parts"].includes(status)) expect(steps.at(-1)!.at).toBeNull();
  });

  it("uses the API's status history when the request has one (D-218)", () => {
    const events = [
      { status: "new" as const, at: "2026-11-01T09:00:00+07:00" },
      { status: "triaged" as const, at: "2026-11-01T09:30:00+07:00" },
      { status: "assigned" as const, at: "2026-11-01T10:00:00+07:00" },
    ];
    expect(timelineOf({ ...request("assigned"), events })).toEqual(events);
  });

  it("has a timeline label and a status label for every status in all six locales", () => {
    for (const locale of LOCALES) {
      const requests = JSON.parse(
        readFileSync(join(__dirname, `../../../i18n/messages/${locale}/resident/requests.json`), "utf8"),
      ) as { detail: { event: Record<string, string> } };
      for (const status of STATUSES) expect(requests.detail.event[status], `${locale} ${status}`).toBeTruthy();
    }
  });
});

describe("service request lists and names", () => {
  it("puts open requests first and keeps the API's order inside each group", () => {
    const list = [request("closed"), request("new"), request("cancelled"), request("waiting_parts"), request("done")];
    const { open, past } = splitRequests(list);
    expect(open.map((r) => r.status)).toEqual(["new", "waiting_parts"]);
    expect(past.map((r) => r.status)).toEqual(["closed", "cancelled", "done"]);
    expect(isOpenRequest(request("done"))).toBe(false);
  });

  it("names a category in the reader's language, the landlord's own name in Thai and English", () => {
    const category = { key: "plumbing", nameTh: "ประปา (อาคาร A)", nameEn: "Plumbing (A)" };
    const translate = (key: string) => `zh:${key}`;
    expect(categoryName(category, "th", translate)).toBe("ประปา (อาคาร A)");
    expect(categoryName(category, "en", translate)).toBe("Plumbing (A)");
    expect(categoryName(category, "zh", translate)).toBe("zh:plumbing");
    expect(categoryName({ ...category, key: "landlord_custom" }, "zh", translate)).toBe("Plumbing (A)");
  });

  it("splits the photos by role, keeping a photo still being scanned (url null)", () => {
    const view = request("done", {
      photos: [
        { id: "a", role: "report", url: "https://x/a" },
        { id: "s", role: "report", url: null },
        { id: "b", role: "before", url: "https://x/b" },
        { id: "c", role: "after", url: "https://x/c" },
      ],
    });
    const photos = photosOf(view);
    expect(photos.report.map((p) => p.id)).toEqual(["a", "s"]);
    expect(photos.before.map((p) => p.id)).toEqual(["b"]);
    expect(photos.after.map((p) => p.id)).toEqual(["c"]);
    expect(photosOf(request("new"))).toEqual({ report: [], before: [], after: [] });
  });

  it("reads the planned visit from what the API offers (D-218: a moved visit asks again)", () => {
    const at = "2026-11-02T10:00:00+07:00";
    expect(visitState(request("triaged"))).toBe("none");
    expect(visitState(request("assigned", { visitAt: at, nextActions: ["confirm-visit"] }))).toBe("confirm");
    expect(visitState(request("assigned", { visitAt: at, visitConfirmedAt: "2026-11-01T12:00:00+07:00" }))).toBe(
      "confirmed",
    );
    // Moved by the office: the confirmation is cleared and `confirm-visit` offered again.
    expect(
      visitState(request("assigned", { visitAt: "2026-11-03T10:00:00+07:00", nextActions: ["confirm-visit"] })),
    ).toBe("confirm");
    expect(visitState(request("in_progress", { visitAt: at }))).toBe("planned");
  });
});
