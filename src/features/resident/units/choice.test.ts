import { describe, expect, it } from "vitest";

import { recallUnit, rememberUnit, UNIT_STORAGE_KEY, unitToRestore } from "./choice";

function memoryStore(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
} as unknown as Storage;

describe("unit choice (JRL)", () => {
  it("remembers the unit in the cookie and in storage", () => {
    const doc = { cookie: "" };
    const store = memoryStore();
    rememberUnit("u-2", doc, store);
    expect(doc.cookie).toMatch(/^gp_unit=u-2; path=\/; max-age=31536000; samesite=lax/);
    expect(store.getItem(UNIT_STORAGE_KEY)).toBe("u-2");
    expect(recallUnit(store)).toBe("u-2");
  });

  it("still sets the cookie when storage throws, and recalls nothing", () => {
    const doc = { cookie: "" };
    expect(() => rememberUnit("u-3", doc, throwing)).not.toThrow();
    expect(doc.cookie).toContain("gp_unit=u-3");
    expect(recallUnit(throwing)).toBeNull();
    expect(recallUnit(null)).toBeNull();
  });

  it("restores a stored unit only when it is still mine and not the one shown", () => {
    expect(unitToRestore("u-2", ["u-1", "u-2"], "u-1")).toBe("u-2");
    expect(unitToRestore("u-1", ["u-1", "u-2"], "u-1")).toBeNull();
    expect(unitToRestore("gone", ["u-1", "u-2"], "u-1")).toBeNull();
    expect(unitToRestore(null, ["u-1"], "u-1")).toBeNull();
  });
});
