import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatPhone } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { NotificationPreference, ResidentDocument } from "@/lib/api/types";
import type { ResidentMe } from "@/lib/api/types";
import { Card } from "@/ui/components/Card";
import { Facts, List, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { Icon } from "@/ui/icons";
import { IconBell } from "@/ui/icons/glyphs/bell";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconReceipt } from "@/ui/icons/glyphs/receipt";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { DocumentButton } from "./DocumentButton";
import { LanguagePreference } from "./LanguagePreference";
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
  recommendations = null,
}: {
  me: ResidentMe;
  locale: Locale;
  preferences: NotificationPreference[] | null;
  documents: ResidentDocument[] | null;
  /** D-267: whether I verified my identity (null when it could not be read). */
  identityVerified?: boolean | null;
  /** GL1 (D-300): whether I receive recommended places (null when it could not be read). */
  recommendations?: "on" | "off" | "outdated" | null;
}) {
  const t = await getTranslations("resident.profile");
  const rec = await getTranslations("recommendations.entry");
  return (
    <Screen testId="profile">
      <ScreenHeader title={t("title")} />

      <Section title={t("account.title")} titleId="account-title">
        <Card padding="none" className="px-4 pt-1 pb-3">
          <Facts
            items={[
              { key: "name", label: t("account.name"), value: me.user.displayName },
              {
                key: "phone",
                label: t("account.phone"),
                value: me.user.phone ? formatPhone(me.user.phone) : t("account.none"),
              },
              ...(me.user.email ? [{ key: "email", label: t("account.email"), value: me.user.email }] : []),
              {
                key: "line",
                label: t("account.line"),
                value: me.user.lineLinked ? t("account.lineLinked") : t("account.lineNotLinked"),
                valueTestId: "profile-line",
              },
            ]}
          />
          <p className="text-muted mt-1 text-sm">{t("account.changeHint")}</p>
        </Card>
      </Section>

      <Section aria-label={t("language.title")}>
        <Card padding="md">
          <LanguagePreference current={locale} />
        </Card>
      </Section>

      {preferences ? (
        <Section title={t("notifications.title")} titleId="notifications-title">
          <Card padding="none">
            {/* A summary here; the form is its own page (/profile has no budget headroom, D-179, GL3). */}
            <ul
              className="divide-border flex flex-col divide-y px-4"
              role="list"
              data-testid="profile-notifications-summary"
            >
              {preferences.map((item) => {
                const on = [item.line ? t("notifications.line") : null, item.sms ? t("notifications.sms") : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={item.topic} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <span>{t(`notifications.topic.${item.topic}`)}</span>
                    <span className="text-muted text-sm">{on || t("notifications.off")}</span>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/profile/notifications"
              className="border-border text-primary flex min-h-12 items-center justify-between gap-2 border-t px-4 font-medium"
              data-testid="profile-notifications-edit"
            >
              {t("notifications.edit")}
              <Icon icon={IconChevronRight} className="rtl:rotate-180" />
            </Link>
          </Card>
        </Section>
      ) : null}

      {documents ? (
        <Section title={t("documents.title")} titleId="documents-title" id="documents">
          {documents.length === 0 ? (
            <p className="text-muted text-sm">{t("documents.empty")}</p>
          ) : (
            <ul
              className="rounded-card border-border bg-surface shadow-card divide-border flex flex-col divide-y border"
              role="list"
              data-testid="profile-documents"
            >
              {documents.map((document) => (
                <li key={document.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{document.title}</span>
                    <span className="text-muted block text-sm">
                      {t(`documents.kind.${document.kind}`)} · {formatDate(document.createdAt, locale)}
                    </span>
                  </span>
                  <DocumentButton documentId={document.id} title={document.title} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <List
        rows={[
          {
            key: "rent-record",
            href: "/profile/rent-record",
            icon: IconReceipt,
            title: t("rentRecord.title"),
            meta: t("rentRecord.hint"),
            testId: "profile-rent-record",
          },
          {
            key: "verification",
            href: "/profile/verification",
            icon: IconCheckCircle,
            title: t("verification.title"),
            meta: identityVerified ? t("verification.done") : t("verification.hint"),
            testId: "profile-verification",
          },
          {
            key: "recommendations",
            href: "/recommendations",
            icon: IconBell,
            title: rec("title"),
            meta: recommendations === "on" ? rec("on") : recommendations === null ? rec("unknown") : rec("off"),
            testId: "profile-recommendations",
            data: { "data-state": recommendations ?? undefined },
          },
          {
            key: "privacy",
            href: "/profile/privacy",
            icon: IconShield,
            title: t("privacyCta"),
            testId: "profile-privacy",
          },
        ]}
      />
      <SignOutButton />
    </Screen>
  );
}
