"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ImageViewer } from "@/ui/components/ImageViewer";
import { LazyDialog } from "@/ui/components/overlays";

export interface GalleryPhoto {
  id: string;
  /** The API's 5-minute link; `null` while the file is not scanned clean (D-218). */
  url: string | null;
  /** What the picture shows — required, photos are evidence (design-system.md §6). */
  alt: string;
}

/**
 * Photos of a request or a work order (the API's 5-minute links): thumbnails that are real buttons (48 px+,
 * keyboard), each opening the picture in a near-full-screen dialog with zoom buttons (`ImageViewer`) — Escape, the
 * close button and the scrim close it and focus returns to the thumbnail. A photo the API has not scanned clean yet
 * (`url: null`) is a labelled placeholder, never a button. Nothing is cached here: when a link has expired (the page
 * stayed open past its 5 minutes) the first failed picture re-renders the page once for fresh links.
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
  const router = useRouter();
  const refreshed = useRef(false);
  const [open, setOpen] = useState<(GalleryPhoto & { url: string }) | null>(null);
  const renew = () => {
    if (refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  };
  return (
    <>
      <ul className="grid grid-cols-3 gap-2" role="list" aria-label={label} data-testid={testId}>
        {photos.map(({ id, url, alt }) => (
          <li key={id}>
            {url ? (
              <button
                type="button"
                className="rounded-control border-border block w-full overflow-hidden border"
                onClick={() => setOpen({ id, url, alt })}
                aria-label={alt}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link */}
                <img
                  src={url}
                  alt=""
                  width={120}
                  height={120}
                  loading="lazy"
                  onError={renew}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ) : (
              <div
                role="img"
                aria-label={`${alt} — ${t("photo.scanning")}`}
                className="rounded-control border-border bg-surface-subtle text-muted flex aspect-square w-full items-center justify-center border p-2 text-center text-xs"
                data-testid={`${testId}-scanning`}
              >
                {t("photo.scanning")}
              </div>
            )}
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
