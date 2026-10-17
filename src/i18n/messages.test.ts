import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

import { loadMessages, MESSAGE_FILES, mergeMessages } from "./messages";
import { ACTIVE_LOCALES, LOCALES, localeFromLanguageTag } from "./routing";

const dir = join(__dirname, "messages");
const read = (locale: string, file: string) => JSON.parse(readFileSync(join(dir, locale, file), "utf8"));

function entries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}
const keys = (value: unknown) => entries(value).map(([k]) => k);

const files = Object.entries(MESSAGE_FILES).flatMap(([namespace, features]) =>
  features.map((feature) => `${namespace}/${feature}.json`),
);

describe("messages", () => {
  it("has exactly the manifest's files in every locale (D-064)", () => {
    for (const locale of LOCALES) {
      const onDisk = readdirSync(join(dir, locale)).flatMap((namespace) =>
        readdirSync(join(dir, locale, namespace)).map((file) => `${namespace}/${file}`),
      );
      expect(onDisk.sort()).toEqual([...files].sort());
    }
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

  it.each(ACTIVE_LOCALES)("every %s message is valid ICU and uses the same arguments as English", (locale) => {
    for (const file of files) {
      const en = new Map(entries(read("en", file)));
      for (const [key, message] of entries(read(locale, file))) {
        expect(() => new IntlMessageFormat(message, locale), `${file} ${key}`).not.toThrow();
        const args = (text: string) => [...text.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();
        expect(args(message), `${file} ${key}`).toEqual(args(en.get(key) ?? ""));
      }
    }
  });

  it("follows the D-151 glossary: English resident copy never calls a resident a tenant", () => {
    for (const file of files.filter((f) => !f.startsWith("technician/"))) {
      for (const [key, message] of entries(read("en", file))) {
        expect(message, `${file} ${key}`).not.toMatch(/\btenants?\b/i);
      }
    }
  });
});

describe("loadMessages", () => {
  it("falls back to English for an empty locale", async () => {
    const km = await loadMessages("km");
    const en = await loadMessages("en");
    expect(km).toEqual(en);
  });
  it("keeps Thai as Thai and mounts features under their namespace", async () => {
    const th = (await loadMessages("th")) as { resident: { nav: { home: string } }; common: { retry: string } };
    expect(th.resident.nav.home).toBe("หน้าแรก");
    expect(th.common.retry).toBe("ลองอีกครั้ง");
  });
  it("loads the technician namespace only when asked", async () => {
    expect(await loadMessages("en")).not.toHaveProperty("technician");
    expect(await loadMessages("en", ["technician"])).toHaveProperty("technician.workOrders.title");
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
