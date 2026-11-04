"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import type { CameraCaptureProps } from "@/ui/components/CameraCapture";
import { Button } from "@/ui/components/Button";
import { IconButton } from "@/ui/components/IconButton";
import { Skeleton } from "@/ui/components/Skeleton";
import { Icon } from "@/ui/icons";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconCamera } from "@/ui/icons/glyphs/camera";
import { IconClose } from "@/ui/icons/glyphs/close";
import { IconImage } from "@/ui/icons/glyphs/image";
import { lazyWarm } from "@/ui/lib/lazy";

import { useCameraLabels } from "./useCameraLabels";

/** The camera loads with the first tap on "add photos" (D-179: it is most of a form's script otherwise). */
const CameraCapture = lazyWarm<CameraCaptureProps>(() =>
  import("@/ui/components/CameraCapture").then((module) => module.CameraCapture),
);

export interface PickedPhoto {
  id: string;
  file: File;
  url: string;
}

/**
 * Photos for a form (a repair request, a work order's before / after shots): "add photos" opens the multi-shot
 * `CameraCapture` (rear camera, or the phone's picker when the camera is refused), previews with a remove button
 * each, at most `max`. The files are already compressed on the phone; the caller uploads them.
 */
export function PhotoPicker({
  photos,
  onChange,
  max,
  labels,
  disabled = false,
  testId = "photo-picker",
  variant = "button",
  columns = 3,
}: {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  max: number;
  labels: {
    add: string;
    shoot: string;
    shootHint: string;
    photoAlt: (index: number) => string;
    remove: (index: number) => string;
    list: string;
  };
  disabled?: boolean;
  testId?: string;
  /**
   * `slots` (the resident's forms, redesign G2 r2): square previews with a remove button each and a dashed "+ add"
   * slot in the same grid, so the resident sees exactly what will be sent. `button`: one "add photos" button above
   * the previews (the technician's before / after).
   */
  variant?: "button" | "slots";
  /** Slots per row: 2 in a half-width column (a work order's before / after). */
  columns?: 2 | 3;
}) {
  const cameraLabels = useCameraLabels();
  const [camera, setCamera] = useState(false);

  // Previews are released when the form goes away (a removed photo is released at once, below).
  const current = useRef(photos);
  useEffect(() => {
    current.current = photos;
  }, [photos]);
  useEffect(() => () => current.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const room = max - photos.length;
  const remove = (photo: PickedPhoto) => {
    URL.revokeObjectURL(photo.url);
    onChange(photos.filter((p) => p.id !== photo.id));
  };
  const camera_ =
    camera && room > 0 ? (
      <Suspense fallback={<Skeleton className="rounded-card aspect-[4/3] w-full" />}>
        {/* `data-camera-open`: a narrow column (a work order's before / after) widens while the camera is open. */}
        <div data-camera-open="" className="contents" />
        <CameraCapture
          label={labels.shoot}
          hint={labels.shootHint}
          labels={cameraLabels}
          multiple
          maxShots={room}
          guide="none"
          fileBaseName="photo"
          disabled={disabled}
          onCapture={(files) => {
            const added = files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
            onChange([...photos, ...added].slice(0, max));
            setCamera(false);
          }}
        />
      </Suspense>
    ) : null;

  if (variant === "slots") {
    // Faint empty squares fill the first row so the grid reads as "room for a few photos", not as one lone button.
    const filler = Math.max(0, columns - 1 - photos.length - (room > 0 ? 0 : 1));
    return (
      <div className="flex flex-col gap-3" data-testid={testId}>
        {/* One grid: the previews (a list, `display: contents` keeps it in the grid), then the add slot and fillers. */}
        <div className={columns === 2 ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
          <ul className="contents" role="list" aria-label={labels.list} data-testid={`${testId}-list`}>
            {photos.map((photo, index) => (
              <li key={photo.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) */}
                <img
                  src={photo.url}
                  alt={labels.photoAlt(index + 1)}
                  width={112}
                  height={112}
                  className="rounded-control border-border aspect-square w-full border object-cover"
                />
                <IconButton
                  icon={IconClose}
                  label={labels.remove(index + 1)}
                  size="sm"
                  variant="secondary"
                  className="absolute end-1.5 top-1.5"
                  disabled={disabled}
                  onClick={() => remove(photo)}
                />
              </li>
            ))}
          </ul>
          {room > 0 && !camera ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCamera(true)}
              className="rounded-control border-border-strong text-muted hover:bg-bg-subtle focus-visible:ring-focus-ring flex aspect-square w-full flex-col items-center justify-center gap-1 border border-dashed text-sm font-medium focus-visible:ring-2 disabled:opacity-50"
              data-testid={`${testId}-add`}
            >
              <Icon icon={IconAdd} className="text-xl" />
              {labels.add}
            </button>
          ) : null}
          {Array.from({ length: camera ? 0 : filler }, (_, i) => (
            <div
              key={`empty-${i}`}
              aria-hidden="true"
              className="rounded-control border-border text-subtle grid aspect-square place-items-center border border-dashed"
            >
              <Icon icon={IconImage} className="text-xl" />
            </div>
          ))}
        </div>
        {camera_}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {camera_ ?? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          block
          iconStart={IconCamera}
          disabled={disabled || room <= 0}
          onClick={() => setCamera(true)}
          data-testid={`${testId}-add`}
        >
          {labels.add}
        </Button>
      )}
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2" role="list" aria-label={labels.list} data-testid={`${testId}-list`}>
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) */}
              <img
                src={photo.url}
                alt={labels.photoAlt(index + 1)}
                width={96}
                height={96}
                className="rounded-control border-border aspect-square w-full border object-cover"
              />
              <IconButton
                icon={IconClose}
                label={labels.remove(index + 1)}
                size="sm"
                variant="secondary"
                className="absolute top-1 right-1"
                disabled={disabled}
                onClick={() => remove(photo)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
