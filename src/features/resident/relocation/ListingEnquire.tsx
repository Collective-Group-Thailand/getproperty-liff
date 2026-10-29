"use client";

import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { LazySheet } from "@/ui/components/overlays";
import { Skeleton } from "@/ui/components/Skeleton";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { lazyWarm } from "@/ui/lib/lazy";

type FormProps = {
  offerId: string;
  slug: string;
  title: string;
  record: Pick<Schemas["RentRecordDto"], "onTime" | "late" | "outstanding"> | null;
};

const EnquireForm = lazyWarm<FormProps>(() => import("./EnquireForm").then((m) => m.EnquireForm));

/** *Ask the owner* on a listing of my offer: the sheet and its form load the first time it opens (D-179). */
export function ListingEnquire(props: FormProps) {
  const t = useTranslations("resident.relocation.enquire");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="lg"
        block
        iconStart={IconChat}
        onClick={() => setOpen(true)}
        data-testid="relocation-listing-enquire"
      >
        {t("open")}
      </Button>
      <LazySheet open={open} onOpenChange={setOpen} title={t("title")} closeLabel={common("close")}>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <EnquireForm {...props} />
        </Suspense>
      </LazySheet>
    </>
  );
}
