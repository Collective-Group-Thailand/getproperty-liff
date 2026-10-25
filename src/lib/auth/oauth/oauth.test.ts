import { describe, expect, it } from "vitest";

import { decodeAttempt, encodeAttempt } from "./attempt";
import { authorizeUrl, enabledProviders, encodeFakeCode, exchangeCode, newAttempt } from "./providers";

describe("Google / Apple outside LINE (D-255, D-283)", () => {
  it("keeps prospect and resident attempts and refuses other intents or LINE", () => {
    const attempt = {
      ...newAttempt(),
      provider: "apple" as const,
      intent: "resident" as const,
      locale: "en",
      next: "/",
    };
    expect(decodeAttempt(encodeAttempt(attempt))).toEqual(attempt);
    const signup = Buffer.from(JSON.stringify({ ...attempt, intent: "signup" })).toString("base64url");
    expect(decodeAttempt(signup)).toBeNull();
    const line = Buffer.from(JSON.stringify({ ...attempt, provider: "line" })).toString("base64url");
    expect(decodeAttempt(line)).toBeNull();
  });

  it("offers a provider live only when it is configured, and the fake page otherwise", async () => {
    expect(
      enabledProviders({ OAUTH_MODE: "live", GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s" }),
    ).toEqual([]);
    expect(
      enabledProviders({
        OAUTH_MODE: "live",
        GOOGLE_OAUTH_CLIENT_ID: "id",
        GOOGLE_OAUTH_CLIENT_SECRET: "s",
        FIREBASE_WEB_API_KEY: "k",
      }),
    ).toEqual(["google"]);
    const attempt = newAttempt();
    const url = new URL(
      authorizeUrl({ OAUTH_MODE: "fake" }, "google", attempt, "https://x/cb", "https://x/oauth/fake"),
    );
    expect(url.pathname).toBe("/oauth/fake");
    const identity = await exchangeCode({ OAUTH_MODE: "fake" }, "apple", {
      code: encodeFakeCode({ uid: "linked-1", email: "a@example.com" }),
      redirectUri: "https://x/cb",
      verifier: attempt.verifier,
      nonce: attempt.nonce,
    });
    expect(identity).toEqual({ provider: "firebase_apple", idToken: "fake-firebase.apple.linked-1.a%40example.com" });
  });
});
