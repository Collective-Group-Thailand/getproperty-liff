import { NextResponse, type NextRequest } from "next/server";

import { failureUrl, finishAttempt, oauthEnv, publicOrigin } from "@/lib/auth/oauth/flow";
import { encodeFakeCode, isOAuthProvider } from "@/lib/auth/oauth/providers";

export const dynamic = "force-dynamic";

const go = (url: string) => NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store" } });

/** `GET /bff/oauth/{provider}/callback?code=&state=` — Google comes back here (D-255, D-283). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = publicOrigin(request);
  if (!isOAuthProvider(provider)) return go(failureUrl(origin, "prospect", "oauth.unavailable"));
  const query = request.nextUrl.searchParams;
  return go(
    await finishAttempt(origin, provider, {
      code: query.get("code"),
      state: query.get("state"),
      error: query.get("error"),
    }),
  );
}

/** `POST …/callback` — Apple's `form_post`, and the local test page with the fake provider. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = publicOrigin(request);
  if (!isOAuthProvider(provider)) return go(failureUrl(origin, "prospect", "oauth.unavailable"));
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  const uid = field("uid");
  const code =
    field("code") ??
    (oauthEnv().OAUTH_MODE === "fake" && uid
      ? encodeFakeCode({ uid, name: field("name") || undefined, email: field("email") || undefined })
      : null);
  return go(
    await finishAttempt(origin, provider, { code, state: field("state"), error: field("error"), user: field("user") }),
  );
}
