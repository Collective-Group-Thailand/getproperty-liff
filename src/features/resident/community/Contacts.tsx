import { getTranslations } from "next-intl/server";

import { formatPhone } from "@/i18n/format";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconPhone } from "@/ui/icons/glyphs/phone";

import type { Contact } from "./data";
import { LineChatButton } from "./LineChatButton";
import { telUri } from "./lineLink";

const ORDER: Contact["kind"][] = ["emergency", "building", "vendor", "utility"];

/** Building contacts (L4 4.2 §2, D-073): emergencies first; call (`tel:`) or chat on LINE (`openExternal`). */
export async function ContactList({ contacts }: { contacts: Contact[] }) {
  const t = await getTranslations("resident.community.contacts");
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="contacts">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {contacts.length === 0 ? <EmptyState icon={IconPhone} title={t("empty")} /> : null}
      {ORDER.map((kind) => {
        const group = contacts.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
        if (group.length === 0) return null;
        return (
          <section key={kind} aria-labelledby={`contacts-${kind}`} className="flex flex-col gap-2">
            <h2 id={`contacts-${kind}`} className="font-semibold">
              {t(`kind.${kind}`)}
            </h2>
            <ul className="flex flex-col gap-2" role="list">
              {group.map((c) => (
                <li key={c.id}>
                  <Card padding="md" className="flex flex-col gap-2" data-testid="contact" data-kind={c.kind}>
                    <p className="font-medium">{c.name}</p>
                    {c.notes ? <p className="text-muted text-sm">{c.notes}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {c.phone ? (
                        <Button
                          asChild
                          size="lg"
                          variant={kind === "emergency" ? "primary" : "secondary"}
                          iconStart={IconPhone}
                        >
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
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
