import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { INVITE_STATUS } from "@/domain/status/gate";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadGate, loadInvite } from "@/features/resident/visitors/data";
import { RevokeInvite } from "@/features/resident/visitors/InviteRecord";
import { canEditGate, gateUnit, plateText } from "@/features/resident/visitors/model";
import { windowText } from "@/features/resident/visitors/words";
import { Facts, Screen, ScreenHeader } from "@/features/shared/Screen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";

function plateLine(plate: { category: string; number: string; province: string }): string {
  return `${plateText(plate)} · ${plate.province}`;
}

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.invite");
  return { title: t("recordTitle") };
}

/**
 * `/visitors/invites/{inviteId}` — one pass (JL4), read by id (CR #52). The QR is never shown again (the API keeps
 * only its hash).
 */
export default async function InvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const unit = actor.unit;
  const [t, status, locale, loaded, gate] = await Promise.all([
    getTranslations("resident.visitors"),
    getTranslations(),
    pageLocale(),
    loadInvite(unit.unitId, inviteId),
    loadGate(unit.unitId),
  ]);
  if (loaded.data === null) notFound();
  const invite = loaded.data;
  const badge = invite ? INVITE_STATUS[invite.state] : null;
  const name = invite ? (invite.visitorName ?? t(`invite.kinds.${invite.visitorKind}`)) : "";
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {loaded.error || !invite || !badge ? (
        <ProblemPage error={loaded.error!} />
      ) : (
        <Screen testId="invite-record" data-state={invite.state}>
          <ScreenHeader
            flush
            title={name}
            status={<StatusBadge status={badge} label={status(badge.labelKey)} />}
            lede={windowText(invite.validFrom, invite.validTo, locale)}
          />
          {invite.state === "pending_approval" ? (
            <Callout tone="info" size="sm">
              {t("invite.pendingNote")}
            </Callout>
          ) : null}
          {invite.state === "rejected" && invite.rejectReason ? (
            <Callout tone="warning" size="sm" title={t("invite.rejected")}>
              {invite.rejectReason}
            </Callout>
          ) : null}
          <Facts
            items={[
              { key: "kind", label: t("invite.kind"), value: t(`invite.kinds.${invite.visitorKind}`) },
              {
                key: "uses",
                label: t("invite.usage"),
                value:
                  invite.usage === "single"
                    ? t("invite.usedSingle", { uses: invite.uses })
                    : t("invite.usedMulti", { uses: invite.uses, max: invite.maxUses }),
              },
              ...(invite.plate
                ? [
                    {
                      key: "plate",
                      label: t("invite.plate"),
                      value: <span className="font-mono">{plateLine(invite.plate)}</span>,
                    },
                  ]
                : []),
              ...(invite.note ? [{ key: "note", label: t("invite.field.note"), value: invite.note }] : []),
            ]}
          />
          <p className="text-muted text-sm">{t("invite.qrGone")}</p>
          {(invite.state === "active" || invite.state === "pending_approval") &&
          canEditGate(unit, gate.data?.canEdit) ? (
            <RevokeInvite unitId={unit.unitId} inviteId={invite.id} name={name} />
          ) : null}
        </Screen>
      )}
    </ResidentShell>
  );
}
