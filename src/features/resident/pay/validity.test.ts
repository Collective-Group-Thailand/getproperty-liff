import { describe, expect, it } from "vitest";

import { formatCountdown, qrValidity } from "./validity";

describe("QR validity (expiresAt from the API)", () => {
  const now = Date.parse("2026-11-01T10:00:00+07:00");

  it("is open without an expiry, a date when far away, a countdown in the last hour, expired after", () => {
    expect(qrValidity(null, now)).toEqual({ kind: "open" });
    expect(qrValidity("2026-12-15T10:00:00+07:00", now)).toEqual({
      kind: "until",
      expiresAt: "2026-12-15T10:00:00+07:00",
    });
    expect(qrValidity("2026-11-01T10:14:05+07:00", now)).toEqual({ kind: "countdown", seconds: 845 });
    expect(qrValidity("2026-11-01T10:00:00+07:00", now)).toEqual({ kind: "expired" });
    expect(qrValidity("2026-11-01T09:00:00+07:00", now)).toEqual({ kind: "expired" });
    expect(qrValidity("not a date", now)).toEqual({ kind: "open" });
  });

  it("formats minutes and seconds", () => {
    expect(formatCountdown(845)).toBe("14:05");
    expect(formatCountdown(9)).toBe("00:09");
    expect(formatCountdown(-3)).toBe("00:00");
  });
});
