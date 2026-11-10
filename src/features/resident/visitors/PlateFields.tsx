"use client";

import { useTranslations } from "next-intl";

import { FieldNamed } from "@/features/shared/FieldNamed";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";

import type { PlateError } from "./model";
import { PROVINCES } from "./provinces";

export interface PlateValue {
  category: string;
  number: string;
  province: string;
}

/**
 * A Thai plate as three fields — category ("3กท"), number ("8812"), province from the gate's list — so the guard's
 * tablet and the resident type the same thing (the API matches category + number + province). Errors sit under the
 * field they belong to; ids let the form's error summary focus them.
 */
export function PlateFields({
  idPrefix,
  value,
  onChange,
  onBlur,
  errors = {},
  required,
}: {
  idPrefix: string;
  value: PlateValue;
  onChange: (value: PlateValue) => void;
  onBlur?: () => void;
  errors?: Partial<Record<keyof PlateValue, PlateError>>;
  required?: boolean;
}) {
  const t = useTranslations("resident.visitors.plate");
  const message = (error: PlateError | undefined) => (error ? t(`error.${error}`) : undefined);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("category")} hint={t("categoryHint")} error={message(errors.category)} required={required}>
          <FieldNamed>
            {(named) => (
              <Input
                {...named}
                id={`${idPrefix}-category`}
                className="font-mono"
                autoComplete="off"
                maxLength={6}
                value={value.category}
                onChange={(event) => onChange({ ...value, category: event.target.value })}
                onBlur={onBlur}
                data-testid={`${idPrefix}-category`}
              />
            )}
          </FieldNamed>
        </Field>
        <Field label={t("number")} hint={t("numberHint")} error={message(errors.number)} required={required}>
          <FieldNamed>
            {(named) => (
              <Input
                {...named}
                id={`${idPrefix}-number`}
                className="font-mono"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={value.number}
                onChange={(event) => onChange({ ...value, number: event.target.value })}
                onBlur={onBlur}
                data-testid={`${idPrefix}-number`}
              />
            )}
          </FieldNamed>
        </Field>
      </div>
      <Field label={t("province")} error={message(errors.province)} required={required}>
        <FieldNamed>
          {(named) => (
            <NativeSelect
              {...named}
              id={`${idPrefix}-province`}
              placeholder={t("provincePlaceholder")}
              options={PROVINCES.map((p) => ({ value: p, label: p }))}
              value={value.province}
              onChange={(event) => onChange({ ...value, province: event.target.value })}
              onBlur={onBlur}
              data-testid={`${idPrefix}-province`}
            />
          )}
        </FieldNamed>
      </Field>
    </div>
  );
}
