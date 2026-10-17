"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { CameraCaptureLabels } from "@/ui/components/CameraCapture";

/** `CameraCapture`'s copy (the `src/ui` capture components take labels, never strings of their own). */
export function useCameraLabels(): CameraCaptureLabels {
  const t = useTranslations("common.camera");
  return useMemo(
    () => ({
      viewfinder: t("viewfinder"),
      torchOn: t("torchOn"),
      torchOff: t("torchOff"),
      done: (count: number) => t("done", { count }),
      remove: (index: number) => t("remove", { index }),
      taken: (count: number) => t("taken", { count }),
      chooseFile: t("chooseFile"),
      starting: t("starting"),
      unavailable: t("unavailable"),
    }),
    [t],
  );
}
