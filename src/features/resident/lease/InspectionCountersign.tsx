"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Skeleton } from "@/ui/components/Skeleton";
import { toast } from "@/ui/components/Toast";
import { lazyWarm } from "@/ui/lib/lazy";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { fitPng, SIGNATURE_MAX_BYTES } from "./signatureImage";

// The drawing pad loads with the first interaction (D-179 budget): the report itself is what the page opens on.
const SignaturePad = lazyWarm(() => import("@/ui/components/SignaturePad").then((m) => m.SignaturePad));

/**
 * I countersign the report the landlord completed (L5 5.2, D-253): after reading the lines and photos above, draw a
 * signature (or use a photo of it) and send it; the report becomes "signed by both" and the landlord hears it. If
 * something is wrong, the landlord's chat is the way to say so before signing.
 */
export function InspectionCountersign({ inspectionId }: { inspectionId: string }) {
  const t = useTranslations("resident.lease.inspections.countersign");
  const draw = useTranslations("resident.lease.sign.draw");
  const router = useRouter();
  const [signature, setSignature] = useState<Blob | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send() {
    if (!signature) return;
    setBusy(true);
    setError(null);
    try {
      const { blobToBase64 } = await import("@/ui/components/SignaturePad");
      unwrap(
        await browserApi.POST("/v1/resident/inspections/{inspectionId}/actions/countersign", {
          params: { path: { inspectionId } },
          body: { signaturePng: await blobToBase64(signature) },
        }),
      );
      toast.success(t("done"));
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="inspection-sign"
      className="flex flex-col gap-4"
      data-testid="inspection-countersign"
    >
      <div className="flex flex-col gap-1">
        <h2 id="inspection-sign" className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted text-sm">{t("lead")}</p>
      </div>
      <Suspense fallback={<Skeleton className="h-60 w-full" />}>
        <SignaturePad
          label={draw("label")}
          labels={{
            placeholder: draw("placeholder"),
            clear: draw("clear"),
            undo: draw("undo"),
            upload: draw("upload"),
          }}
          onChange={async (png) => {
            setTooLarge(false);
            if (!png) {
              setSignature(null);
              return;
            }
            const fitted = await fitPng(png, SIGNATURE_MAX_BYTES);
            setTooLarge(!fitted);
            setSignature(fitted);
          }}
        />
      </Suspense>
      {tooLarge ? <Callout tone="warning">{draw("tooLarge")}</Callout> : null}
      {error ? <ProblemCallout error={error} /> : null}
      <Button
        size="lg"
        block
        iconStart={IconSign}
        loading={busy}
        disabled={!signature}
        onClick={() => void send()}
        data-testid="inspection-countersign-send"
      >
        {t("send")}
      </Button>
    </Card>
  );
}
