"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { LazyDialog } from "@/ui/components/overlays";
import { Icon } from "@/ui/icons";
import { IconImage } from "@/ui/icons/glyphs/image";

/**
 * The photo of a meter register behind an invoice line (D-022 evidence; CONTRACT-REQUEST #15 `readingPhotoUrl`):
 * a thumbnail that is a real button (48 px, keyboard), opening the picture in a near-full-screen dialog — Escape,
 * the close button and the scrim close it and focus returns to the thumbnail (Radix). The link is the API's
 * short-lived signed URL; nothing is cached here.
 */
export function MeterPhoto({ url, title, caption }: { url: string; title: string; caption: string }) {
  const t = useTranslations("resident.invoices.lines");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control border-border text-primary flex min-h-12 items-center gap-3 border p-1 pe-3 text-sm font-medium"
        data-testid="meter-photo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link */}
        <img src={url} alt="" width={64} height={48} className="h-12 w-16 rounded object-cover" loading="lazy" />
        <Icon icon={IconImage} />
        {t("photoOpen")}
      </button>
      <LazyDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={caption}
        closeLabel={common("close")}
        size="xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link */}
        <img
          src={url}
          alt={t("photoAlt", { title })}
          className="mx-auto max-h-[70dvh] w-full object-contain"
          data-testid="meter-photo-full"
        />
      </LazyDialog>
    </>
  );
}
