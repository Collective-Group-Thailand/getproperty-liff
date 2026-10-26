import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatPhone } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { NotificationPreference, ResidentDocument } from "@/lib/api/types";
import type { ResidentMe } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconReceipt } from "@/ui/icons/glyphs/receipt";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { DocumentButton } from "./DocumentButton";
import { LanguagePreference } from "./LanguagePreference";
import { NotificationPreferences } from "./NotificationPreferences";
import { SignOutButton } from "./SignOutButton";

/**
 * The resident's profile (L3 3.3): name and phone as the office recorded them, the linked LINE account, language,
 * notification preferences, documents on file (view only), the way to privacy (consents, PDPA requests) and
 * sign-out. A section whose data could not be loaded says so instead of failing the page.
 */
export async function ProfileView({
  me,
  locale,
  preferences,
  documents,
  identityVerified = null,
}: {
  me: ResidentMe;
  locale: Locale;
  preferences: NotificationPreference[] | null;
  documents: ResidentDocument[] | null;
  /** D-267: whether I verified my identity (null when it could not be read). */
  identityVerified?: boolean | null;
}) {
  const t = await getTranslations("resident.profile");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="profile">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>

      <Card as="section" padding="md" aria-labelledby="account-title">
        <h2 id="account-title" className="font-semibold">
          {t("account.title")}
        </h2>
        <dl className="mt-2 flex flex-col gap-2">
          <div>
            <dt className="text-muted text-sm">{t("account.name")}</dt>
            <dd className="font-medium">{me.user.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted text-sm">{t("account.phone")}</dt>
            <dd className="font-medium tabular-nums">
              {me.user.phone ? formatPhone(me.user.phone) : t("account.none")}
            </dd>
          </div>
          {me.user.email ? (
            <div>
              <dt className="text-muted text-sm">{t("account.email")}</dt>
              <dd className="font-medium">{me.user.email}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted text-sm">{t("account.line")}</dt>
            <dd className="font-medium" data-testid="profile-line">
              {me.user.lineLinked ? t("account.lineLinked") : t("account.lineNotLinked")}
            </dd>
          </div>
        </dl>
        <p className="text-muted mt-3 text-xs">{t("account.changeHint")}</p>
      </Card>

      <Card as="section" padding="md" aria-labelledby="language-title">
        <h2 id="language-title" className="mb-2 font-semibold">
          {t("language.title")}
        </h2>
        <LanguagePreference current={locale} />
      </Card>

      <Card as="section" padding="md" aria-labelledby="notifications-title">
        <h2 id="notifications-title" className="mb-2 font-semibold">
          {t("notifications.title")}
        </h2>
        {preferences ? (
          <NotificationPreferences initial={preferences} />
        ) : (
          <Callout tone="neutral">{t("notifications.unavailable")}</Callout>
        )}
      </Card>

      <Card as="section" padding="md" aria-labelledby="documents" id="documents">
        <h2 id="documents-title" className="mb-2 font-semibold">
          {t("documents.title")}
        </h2>
        {documents === null ? (
          <Callout tone="neutral">{t("documents.unavailable")}</Callout>
        ) : documents.length === 0 ? (
          <p className="text-muted text-sm">{t("documents.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3" role="list" data-testid="profile-documents">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">{document.title}</span>
                  <span className="text-muted block text-xs">
                    {t(`documents.kind.${document.kind}`)} · {formatDate(document.createdAt, locale)}
                  </span>
                </span>
                <DocumentButton documentId={document.id} title={document.title} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link
        href="/profile/rent-record"
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-4"
        data-testid="profile-rent-record"
      >
        <Icon icon={IconReceipt} className="text-muted shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{t("rentRecord.title")}</span>
          <span className="text-muted text-sm">{t("rentRecord.hint")}</span>
        </span>
        <Icon icon={IconForward} className="text-muted shrink-0" />
      </Link>

      <Link
        href="/profile/verification"
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-4"
        data-testid="profile-verification"
      >
        <Icon icon={IconCheckCircle} className={identityVerified ? "text-primary shrink-0" : "text-muted shrink-0"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{t("verification.title")}</span>
          <span className="text-muted text-sm">
            {identityVerified ? t("verification.done") : t("verification.hint")}
          </span>
        </span>
        <Icon icon={IconForward} className="text-muted shrink-0" />
      </Link>

      <Button asChild variant="secondary" size="lg" block iconStart={IconShield} iconEnd={IconForward}>
        <Link href="/profile/privacy" data-testid="profile-privacy">
          {t("privacyCta")}
        </Link>
      </Button>
      <SignOutButton />
    </div>
  );
}
