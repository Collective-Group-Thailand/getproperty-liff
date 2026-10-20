"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import type { CameraCaptureProps } from "@/ui/components/CameraCapture";
import { Button } from "@/ui/components/Button";
import { IconButton } from "@/ui/components/IconButton";
import { Skeleton } from "@/ui/components/Skeleton";
import { IconCamera } from "@/ui/icons/glyphs/camera";
import { IconClose } from "@/ui/icons/glyphs/close";
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
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {camera && room > 0 ? (
        <Suspense fallback={<Skeleton className="aspect-[4/3] w-full rounded-lg" />}>
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
      ) : (
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
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  onChange(photos.filter((p) => p.id !== photo.id));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
