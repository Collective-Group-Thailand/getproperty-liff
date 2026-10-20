import { describe, expect, it } from "vitest";

import { lineChatUrl, telUri } from "./lineLink";

describe("contact links", () => {
  it("links an official account and a personal LINE id", () => {
    expect(lineChatUrl("@getproperty-a")).toBe("https://line.me/R/ti/p/@getproperty-a");
    expect(lineChatUrl(" plumber.a ")).toBe("https://line.me/R/ti/p/~plumber.a");
    expect(lineChatUrl("a b")).toBe("https://line.me/R/ti/p/~a%20b");
  });
  it("dials digits and a leading plus only", () => {
    expect(telUri("02-123 4567")).toBe("tel:021234567");
    expect(telUri("+66 81 234 5678")).toBe("tel:+66812345678");
  });
});
