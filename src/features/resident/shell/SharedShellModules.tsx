"use client";

import Link from "next/link";

import { Button } from "@/ui/components/Button";
import { IconButton } from "@/ui/components/IconButton";

import { SettingsMenu } from "./SettingsMenu";
import { UnitSwitcher } from "./UnitSwitcher";

const SHARED = [Link, Button, IconButton, SettingsMenu, UnitSwitcher];

/**
 * Renders nothing. Every page of this app is framed by the resident shell, and most draw a `Button` or a
 * `Link`; the root layout mounts this so those client modules belong to the root layout's bundle, which every
 * route shares (D-179). Without it each route group carries its own copy, and a client-side navigation — the
 * LIFF entry handing over to home — downloads the same modules twice.
 */
export function SharedShellModules() {
  void SHARED;
  return null;
}
