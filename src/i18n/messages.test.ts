import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadMessages, mergeMessages } from "./messages";
import { ACTIVE_LOCALES, LOCALES, localeFromLanguageTag } from "./routing";

const dir = join(__dirname, "messages");
const read = (locale: string, file: string) => JSON.parse(readFileSync(join(dir, locale, file), "utf8"));

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  const entries = Object.entries(value);
  if (entries.length === 0) return [];
  return entries.flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  const files = readdirSync(join(dir, "th")).sort();

  it("has the shared, resident and technician namespaces in every locale (D-064)", () => {
    expect(files).toEqual(["resident.json", "shared.json", "technician.json"]);
    for (const locale of LOCALES) expect(readdirSync(join(dir, locale)).sort()).toEqual(files);
  });

  it.each(files)("%s has the same keys in th and en", (file) => {
    expect(keys(read("en", file)).sort()).toEqual(keys(read("th", file)).sort());
  });

  it.each(LOCALES.filter((l) => !(ACTIVE_LOCALES as readonly string[]).includes(l)))(
    "%s only uses keys English has (it falls back to English for the rest)",
    (locale) => {
      for (const file of files) {
        const en = new Set(keys(read("en", file)));
        for (const key of keys(read(locale, file))) expect(en).toContain(key);
      }
    },
  );
});

describe("loadMessages", () => {
  it("falls back to English for an empty locale", async () => {
    const km = await loadMessages("km");
    const en = await loadMessages("en");
    expect(km).toEqual(en);
  });
  it("keeps Thai as Thai", async () => {
    const th = (await loadMessages("th")) as { resident: { nav: { home: string } } };
    expect(th.resident.nav.home).toBe("หน้าแรก");
  });
  it("loads the technician namespace only when asked", async () => {
    expect(await loadMessages("en")).not.toHaveProperty("technician");
    expect(await loadMessages("en", ["technician"])).toHaveProperty("technician.title");
  });
});

describe("mergeMessages", () => {
  it("merges nested keys and lets the override win", () => {
    expect(mergeMessages({ a: { b: "en", c: "en" }, d: "en" }, { a: { b: "my" } })).toEqual({
      a: { b: "my", c: "en" },
      d: "en",
    });
  });
});

describe("localeFromLanguageTag", () => {
  it("maps LIFF language tags onto the six locales, Thai otherwise", () => {
    expect(localeFromLanguageTag("th")).toBe("th");
    expect(localeFromLanguageTag("en-US")).toBe("en");
    expect(localeFromLanguageTag("zh-TW")).toBe("zh");
    expect(localeFromLanguageTag("my_MM")).toBe("my");
    expect(localeFromLanguageTag("ja")).toBe("th");
    expect(localeFromLanguageTag(undefined)).toBe("th");
  });
});
