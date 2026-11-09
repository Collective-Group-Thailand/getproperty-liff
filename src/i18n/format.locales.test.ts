import { describe, expect, it } from "vitest";

import { formatPeriodKey } from "./format";
import { LOCALES } from "./routing";

/**
 * getproperty-liff's own check of its `format.ts` adaptation (docs/shared-copies.md): web's period words cover th / en,
 * this app adds its four other resident locales (D-064) so every key is named in words in all six.
 */
describe("formatPeriodKey in the resident app's six locales", () => {
  it("names quarters, halves and years in my, km, lo and zh with the Gregorian year", () => {
    expect(formatPeriodKey("2027-Q2", "my")).toBe("2027 သုံးလပတ် 2");
    expect(formatPeriodKey("2027-H1", "my")).toBe("2027 ပထမ နှစ်ဝက်");
    expect(formatPeriodKey("2027", "my")).toBe("2027 ခုနှစ်");
    expect(formatPeriodKey("2027-Q2", "km")).toBe("ត្រីមាសទី 2/2027");
    expect(formatPeriodKey("2027-H2", "km")).toBe("ឆមាសទី 2 2027");
    expect(formatPeriodKey("2027", "km")).toBe("ឆ្នាំ 2027");
    expect(formatPeriodKey("2027-Q4", "lo")).toBe("ໄຕມາດ 4/2027");
    expect(formatPeriodKey("2027-H1", "lo")).toBe("ເຄິ່ງປີທຳອິດ 2027");
    expect(formatPeriodKey("2027", "lo")).toBe("ປີ 2027");
    expect(formatPeriodKey("2027-Q1", "zh")).toBe("2027年第1季度");
    expect(formatPeriodKey("2027-H2", "zh")).toBe("2027年下半年");
    expect(formatPeriodKey("2027", "zh")).toBe("2027年");
  });

  it("never returns the raw key for a valid quarter, half or year in any locale", () => {
    for (const locale of LOCALES) {
      for (const key of ["2027-Q3", "2027-H1", "2027"]) expect(formatPeriodKey(key, locale)).not.toBe(key);
    }
  });
});
