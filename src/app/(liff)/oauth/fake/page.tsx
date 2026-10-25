import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { oauthEnv } from "@/lib/auth/oauth/flow";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";

export async function generateMetadata() {
  const t = await getTranslations("common.oauth.fake");
  return { title: t("pageTitle") };
}

/**
 * The stand-in for Google / Apple with the fake provider (D-283): a test identity, posted to the same callback the
 * provider would use with the attempt's `state`. Not found unless the fake mode is on.
 */
export default async function FakeProviderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (oauthEnv().OAUTH_MODE !== "fake") notFound();
  const params = await searchParams;
  const provider = params.provider === "google" || params.provider === "apple" ? params.provider : null;
  const state = typeof params.state === "string" ? params.state : null;
  if (!provider || !state) notFound();
  const t = await getTranslations("common.oauth");
  const action = `/bff/oauth/${provider}/callback`;
  return (
    <ResidentShell active={null} chrome="entry">
      <div className="flex flex-col gap-5 py-6" data-testid="oauth-fake">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">
            {t("fake.title", { provider: t(`providers.${provider}`) })}
          </h1>
          <p className="text-muted">{t("fake.lead")}</p>
        </div>
        <Callout tone="warning">{t("fake.notice")}</Callout>
        <Card as="section" padding="md">
          <form method="post" action={action} className="flex flex-col gap-4">
            <input type="hidden" name="state" value={state} />
            <Field label={t("fake.uid")} hint={t("fake.uidHint")}>
              <Input name="uid" defaultValue={`test-${provider}-1`} data-testid="oauth-fake-uid" />
            </Field>
            <Field label={t("fake.name")}>
              <Input name="name" defaultValue={t("fake.defaultName")} />
            </Field>
            <Field label={t("fake.email")} hint={t("fake.emailHint")}>
              <Input
                name="email"
                type="email"
                defaultValue={`test-${provider}-1@example.com`}
                data-testid="oauth-fake-email"
              />
            </Field>
            <Button type="submit" size="lg" block data-testid="oauth-fake-continue">
              {t("fake.continue")}
            </Button>
          </form>
        </Card>
        <form method="post" action={action}>
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="error" value="access_denied" />
          <Button type="submit" variant="ghost" size="lg" block data-testid="oauth-fake-cancel">
            {t("fake.cancel")}
          </Button>
        </form>
      </div>
    </ResidentShell>
  );
}
