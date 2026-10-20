"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ImageViewer } from "@/ui/components/ImageViewer";
import { LazyDialog } from "@/ui/components/overlays";

export interface GalleryPhoto {
  id: string;
  url: string;
  /** What the picture shows — required, photos are evidence (design-system.md §6). */
  alt: string;
}

/**
 * Photos of a request or a work order (the API's 5-minute links): thumbnails that are real buttons (48 px+,
 * keyboard), each opening the picture in a near-full-screen dialog with zoom buttons (`ImageViewer`) — Escape, the
 * close button and the scrim close it and focus returns to the thumbnail. Nothing is cached here.
 */
export function PhotoGallery({
  photos,
  label,
  testId = "photo-gallery",
}: {
  photos: GalleryPhoto[];
  label: string;
  testId?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  return (
    <>
      <ul className="grid grid-cols-3 gap-2" role="list" aria-label={label} data-testid={testId}>
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              className="rounded-control border-border block w-full overflow-hidden border"
              onClick={() => setOpen(photo)}
              aria-label={photo.alt}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link */}
              <img
                src={photo.url}
                alt=""
                width={120}
                height={120}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <LazyDialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={open?.alt ?? label}
        closeLabel={t("close")}
        size="xl"
      >
        {open ? (
          <ImageViewer
            src={open.url}
            alt={open.alt}
            data-testid={`${testId}-full`}
            labels={{
              zoomIn: t("photo.zoomIn"),
              zoomOut: t("photo.zoomOut"),
              zoom: (percent) => t("photo.zoom", { percent }),
            }}
          />
        ) : null}
      </LazyDialog>
    </>
  );
}
