"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";
import { toast } from "@/ui/components/Toast";
import { IconAdd } from "@/ui/icons/glyphs/add";

import { isMoneyInput, isQuantityInput } from "./model";

const KINDS: Schemas["WorkOrderCostKind"][] = ["part", "labour", "travel", "other"];

/**
 * A cost line (parts, labour, travel): kind, what, quantity and price per item as the technician types them — sent
 * as decimal strings (`POST …/cost-lines`, D-046); the API computes the amount and the total, never this app.
 */
export function CostLineForm({ workOrderId }: { workOrderId: string }) {
  const t = useTranslations("technician.workOrders.costs");
  const router = useRouter();
  const [kind, setKind] = useState<Schemas["WorkOrderCostKind"]>("part");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [invalid, setInvalid] = useState<{ description?: boolean; quantity?: boolean; price?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const attempt = useIdempotentAttempt<Schemas["CostLineCreateDto"]>();

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      data-testid="cost-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const check = {
          description: description.trim().length === 0,
          quantity: !isQuantityInput(quantity),
          price: !isMoneyInput(unitPrice),
        };
        setInvalid(check);
        if (check.description || check.quantity || check.price) return;
        setBusy(true);
        setError(null);
        try {
          const line = {
            kind,
            description: description.trim(),
            quantity: quantity.trim(),
            unitPrice: unitPrice.trim(),
          };
          // One key per line typed: a retry after a lost answer never adds the money line twice (D-229).
          const { key, body } = await attempt.prepare({ workOrderId, ...line }, () => line);
          unwrap(
            await browserApi.POST("/v1/technician/work-orders/{workOrderId}/cost-lines", {
              params: { path: { workOrderId }, header: { "Idempotency-Key": key } },
              body,
            }),
          );
          attempt.succeeded();
          setDescription("");
          setQuantity("1");
          setUnitPrice("");
          void toast.success(t("added"));
          router.refresh();
        } catch (caught) {
          const problem = toApiError(caught);
          attempt.failed(problem);
          setError(problem);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={t("kindLabel")}>
        <NativeSelect
          value={kind}
          onChange={(e) => setKind(e.target.value as Schemas["WorkOrderCostKind"])}
          options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          data-testid="cost-kind"
        />
      </Field>
      <Field label={t("description")} error={invalid.description ? t("descriptionMissing") : undefined}>
        <Input
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="cost-description"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("quantity")} error={invalid.quantity ? t("invalid") : undefined}>
          <Input
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            data-testid="cost-quantity"
          />
        </Field>
        <Field label={t("unitPrice")} error={invalid.price ? t("invalid") : undefined}>
          <Input
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            data-testid="cost-price"
          />
        </Field>
      </div>
      {error ? <ProblemCallout error={error} /> : null}
      <Button
        type="submit"
        variant="secondary"
        size="lg"
        block
        iconStart={IconAdd}
        loading={busy}
        data-testid="cost-submit"
      >
        {t("add")}
      </Button>
    </form>
  );
}
