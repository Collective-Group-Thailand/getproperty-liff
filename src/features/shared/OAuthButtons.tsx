import { getTranslations } from "next-intl/server";

import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";

type Provider = "google" | "apple";

/**
 * "Continue with Google / Apple" outside LINE (D-255, D-283): plain links to this app's server, which runs the
 * provider redirect — no provider script in the page. Nothing renders when no provider is configured.
 */
export async function OAuthButtons({
  providers,
  intent,
  next,
}: {
  providers: readonly Provider[];
  intent: "prospect" | "resident";
  next: string;
}) {
  if (providers.length === 0) return null;
  const t = await getTranslations("common.oauth");
  return (
    <div className="flex flex-col gap-3" data-testid="oauth-buttons">
      {providers.map((provider) => (
        <Button key={provider} asChild size="lg" block variant="secondary">
          <a
            href={`/bff/oauth/${provider}/start?${new URLSearchParams({ intent, next }).toString()}`}
            data-testid={`oauth-${provider}`}
          >
            {t(`continueWith.${provider}`)}
          </a>
        </Button>
      ))}
    </div>
  );
}

const KEYS: Record<string, string> = {
  "oauth.cancelled": "cancelled",
  "oauth.expired": "expired",
  "oauth.state_mismatch": "expired",
  "oauth.unavailable": "unavailable",
  "oauth.exchange_failed": "failed",
  "auth.identity_token_invalid": "failed",
  "auth.identity_not_linked": "notLinked",
  "auth.identity_email_in_use": "emailInUse",
  "auth.identity_contact_required": "contactRequired",
  "auth.account_disabled": "disabled",
  "service.unavailable": "unavailable",
  "provider.unavailable": "unavailable",
};

/** The refusal an attempt came back with (`?oauthError=`), in our words. */
export async function OAuthError({ code }: { code?: string }) {
  if (!code) return null;
  const t = await getTranslations("common.oauth.errors");
  return (
    <div data-testid="oauth-error" data-code={code}>
      <Callout tone="warning">{t(KEYS[code] ?? "failed")}</Callout>
    </div>
  );
}
