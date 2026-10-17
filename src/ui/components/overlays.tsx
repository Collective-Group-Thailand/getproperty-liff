// copied from getproperty-web@f57d4dc until collective-shared exists (D-155) — adapted: no Popover (bottom sheets instead of popovers in LIFF)
"use client";

import { lazyOverlay, lazyTriggered } from "../lib/lazy";
import type { AlertDialogProps } from "./AlertDialog";
import type { DialogProps } from "./Dialog";
import type { DropdownMenuProps } from "./DropdownMenu";
import type { SheetProps } from "./Sheet";

/**
 * The overlays as app code uses them (D-179): same props as `Sheet`, `Dialog`, `AlertDialog`
 * and `DropdownMenu`, but each is downloaded the first time it opens (see `../lib/lazy`).
 * Zones import these; the eager components are for Storybook, tests and other `src/ui` components.
 */
export const LazySheet = lazyOverlay<SheetProps>(() => import("./Sheet").then((module) => module.Sheet));
export const LazyDialog = lazyOverlay<DialogProps>(() => import("./Dialog").then((module) => module.Dialog));
export const LazyAlertDialog = lazyOverlay<AlertDialogProps>(() =>
  import("./AlertDialog").then((module) => module.AlertDialog),
);
export const LazyDropdownMenu = lazyTriggered<DropdownMenuProps>(
  () => import("./DropdownMenu").then((module) => module.DropdownMenu),
  "menu",
);
