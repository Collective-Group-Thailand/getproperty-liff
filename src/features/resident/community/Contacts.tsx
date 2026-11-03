import { getTranslations } from "next-intl/server";

import { formatPhone } from "@/i18n/format";
import { Button } from "@/ui/components/Button";
import { Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconPhone } from "@/ui/icons/glyphs/phone";

import type { Contact } from "./data";
import { LineChatButton } from "./LineChatButton";
import { telUri } from "./lineLink";
import { EmptyAction } from "@/features/shared/EmptyAction";

const ORDER: Contact["kind"][] = ["emergency", "building", "vendor", "utility"];

/** Building contacts (L4 4.2 §2, D-073): emergencies first; call (`tel:`) or chat on LINE (`openExternal`). */
export async function ContactList({ contacts }: { contacts: Contact[] }) {
  const t = await getTranslations("resident.community.contacts");
  return (
    <Screen testId="contacts">
      <ScreenHeader title={t("title")} lede={t("lead")} />
      {contacts.length === 0 ? (
        <EmptyState variant="card" icon={IconPhone} title={t("empty")} action={<EmptyAction />} />
      ) : null}
      {ORDER.map((kind) => {
        const group = contacts.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
        if (group.length === 0) return null;
        return (
          <Section key={kind} title={t(`kind.${kind}`)} titleId={`contacts-${kind}`}>
            <ul
              className="rounded-card border-border bg-surface shadow-card divide-border flex flex-col divide-y border"
              role="list"
            >
              {group.map((c) => (
                <li key={c.id}>
                  <div
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
                    data-testid="contact"
                    data-kind={c.kind}
                  >
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-medium">{c.name}</p>
                      {c.notes ? <p className="text-muted text-sm">{c.notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.phone ? (
                        <Button asChild variant="secondary" iconStart={IconPhone}>
                          <a href={telUri(c.phone)} data-testid="contact-call">
                            {t("callShort", { phone: formatPhone(c.phone) })}
                          </a>
                        </Button>
                      ) : null}
                      {c.lineId ? (
                        <LineChatButton lineId={c.lineId} label={t("line", { name: c.name })}>
                          {t("lineShort")}
                        </LineChatButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </Screen>
  );
}
