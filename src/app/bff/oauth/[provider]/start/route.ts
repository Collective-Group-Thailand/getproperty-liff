import { NextResponse, type NextRequest } from "next/server";

import { isLocale } from "@/i18n/routing";
import { isOAuthIntent } from "@/lib/auth/oauth/attempt";
import { failureUrl, publicOrigin, startAttempt } from "@/lib/auth/oauth/flow";
import { isOAuthProvider } from "@/lib/auth/oauth/providers";

export const dynamic = "force-dynamic";

/** `GET /bff/oauth/{google|apple}/start?intent=prospect|resident&next=` — to the provider (or the fake page). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = publicOrigin(request);
  const query = request.nextUrl.searchParams;
  const intent = query.get("intent");
  if (!isOAuthIntent(intent) || !isOAuthProvider(provider)) {
    return NextResponse.redirect(failureUrl(origin, "prospect", "oauth.unavailable"), { status: 303 });
  }
  const locale = request.cookies.get("gp_locale")?.value;
  const target = await startAttempt(origin, {
    provider,
    intent,
    locale: isLocale(locale) ? locale : "th",
    next: query.get("next") ?? undefined,
  });
  return NextResponse.redirect(target, { status: 303, headers: { "cache-control": "no-store" } });
}
