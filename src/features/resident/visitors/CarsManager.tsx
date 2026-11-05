"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { RememberedVehicle, ResidentVehicle } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { IconButton } from "@/ui/components/IconButton";
import { Input } from "@/ui/components/Input";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { Icon } from "@/ui/icons";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconDelete } from "@/ui/icons/glyphs/delete";

import { checkPlate, plateText, type PlateError } from "./model";
import { PlateFields, type PlateValue } from "./PlateFields";

type Target = { kind: "car"; id: string; plate: string } | { kind: "remembered"; id: string; plate: string };

const EMPTY: PlateValue = { category: "", number: "", province: "" };

/**
 * The household's cars (D-328: register, used to open the barrier and recognised by the gate camera) and the visitor
 * cars it remembers (D-327: 30 days, entry is notify-only). The household (co-owner, tenant, co-tenant) adds and
 * removes; a family member reads (the API's `canEdit`). Removing asks first — a removed car no longer opens the gate.
 */
export function CarsManager({
  unitId,
  cars,
  remembered,
  canEdit,
  locale,
}: {
  unitId: string;
  cars: ResidentVehicle[];
  remembered: RememberedVehicle[];
  canEdit: boolean;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors.cars");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [plate, setPlate] = useState<PlateValue>(EMPTY);
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof PlateValue, PlateError>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const key = useRef(newIdempotencyKey());

  function check(): ReturnType<typeof checkPlate> {
    const result = checkPlate(plate, true);
    setErrors("error" in result ? { [result.field]: result.error } : {});
    return result;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const result = check();
    if ("error" in result) {
      document.getElementById(`car-${result.field}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/vehicles", {
          params: { path: { unitId } },
          headers: { "idempotency-key": key.current },
          body: { plate: result.plate!, ...(label.trim() ? { label: label.trim() } : {}) },
        }),
      );
      key.current = newIdempotencyKey();
      setPlate(EMPTY);
      setLabel("");
      setAdding(false);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const params = { path: { unitId, vehicleId: target.id } };
      const result =
        target.kind === "car"
          ? await browserApi.DELETE("/v1/resident/units/{unitId}/vehicles/{vehicleId}", { params })
          : await browserApi.DELETE("/v1/resident/units/{unitId}/remembered-vehicles/{vehicleId}", { params });
      if (!result.response.ok) unwrap(result);
      setTarget(null);
      router.refresh();
    } catch (caught) {
      setTarget(null);
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  const rowClass = "flex min-h-14 items-center gap-3 px-4 py-3";
  return (
    <div className="flex flex-col gap-6">
      {error ? <ProblemCallout error={error} /> : null}

      <section aria-labelledby="cars-household" className="flex flex-col gap-2" data-testid="cars-household">
        <h2 id="cars-household" className="text-muted text-sm font-semibold">
          {t("household")}
        </h2>
        <p className="text-muted text-sm">{t("householdBody")}</p>
        {cars.length ? (
          <ul className="rounded-card border-border bg-surface shadow-card divide-border divide-y border">
            {cars.map((car) => (
              <li key={car.id} className={rowClass} data-testid="car-row">
                <Icon icon={IconCar} className="text-muted shrink-0 text-xl" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono font-medium">{plateText(car.plate)}</span>
                  <span className="text-muted text-sm">
                    {[car.plate.province, car.label].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {canEdit ? (
                  <IconButton
                    icon={IconDelete}
                    variant="ghost"
                    label={t("remove", { plate: plateText(car.plate) })}
                    onClick={() => setTarget({ kind: "car", id: car.id, plate: plateText(car.plate) })}
                    data-testid="car-remove"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card border-border bg-surface text-muted border px-4 py-4 text-sm">{t("noCars")}</p>
        )}
        {!canEdit ? <p className="text-muted text-sm">{t("familyNote")}</p> : null}
        {canEdit && !adding ? (
          <Button
            variant="secondary"
            iconStart={IconAdd}
            className="self-start"
            onClick={() => setAdding(true)}
            data-testid="car-add-open"
          >
            {t("add")}
          </Button>
        ) : null}
        {canEdit && adding ? (
          <form
            noValidate
            onSubmit={add}
            className="rounded-card border-border bg-surface shadow-card flex flex-col gap-4 border p-4"
            data-testid="car-form"
          >
            <PlateFields idPrefix="car" value={plate} onChange={setPlate} errors={errors} required />
            <Field label={t("label")} hint={t("labelHint")}>
              <Input
                maxLength={80}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                data-testid="car-label"
              />
            </Field>
            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg" block loading={busy} data-testid="car-save">
                {t("save")}
              </Button>
              <Button variant="ghost" block onClick={() => setAdding(false)}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="cars-remembered" className="flex flex-col gap-2" data-testid="cars-remembered">
        <h2 id="cars-remembered" className="text-muted text-sm font-semibold">
          {t("remembered")}
        </h2>
        <p className="text-muted text-sm">{t("rememberedBody")}</p>
        {remembered.length ? (
          <ul className="rounded-card border-border bg-surface shadow-card divide-border divide-y border">
            {remembered.map((car) => (
              <li key={car.id} className={rowClass} data-testid="remembered-row">
                <Icon icon={IconCar} className="text-muted shrink-0 text-xl" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono font-medium">{plateText(car.plate)}</span>
                  <span className="text-muted text-sm">
                    {[car.label, t("until", { date: formatDate(car.expiresAt, locale, { style: "dayMonth" }) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {canEdit ? (
                  <IconButton
                    icon={IconDelete}
                    variant="ghost"
                    label={t("forget", { plate: plateText(car.plate) })}
                    onClick={() => setTarget({ kind: "remembered", id: car.id, plate: plateText(car.plate) })}
                    data-testid="remembered-forget"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card border-border bg-surface text-muted border px-4 py-4 text-sm">
            {t("noRemembered")}
          </p>
        )}
      </section>

      <LazyAlertDialog
        open={target !== null}
        onOpenChange={(open) => (open ? null : setTarget(null))}
        title={target ? t(`confirm.${target.kind}.title`, { plate: target.plate }) : ""}
        description={target ? t(`confirm.${target.kind}.body`) : ""}
        confirmLabel={target ? t(`confirm.${target.kind}.confirm`) : ""}
        cancelLabel={t("cancel")}
        tone="destructive"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
