"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { qrSvg } from "@/features/shared/qrSvg";
import { isLocale } from "@/i18n/routing";
import { Icon } from "@/ui/icons";
import { IconQr } from "@/ui/icons/glyphs/qr";

import { readPass } from "./model";
import { windowText } from "./words";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The QR from `/pass#…`, with the place, the house and the window the resident shared (the guard checks the rest). */
export function PassView() {
  const t = useTranslations("resident.visitors.pass");
  // The fragment exists only in the browser: the server renders the waiting frame.
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => null,
  );
  if (hash === null) return <div className="min-h-80" aria-busy="true" />;
  const pass = readPass(hash);
  if (!pass) {
    // A visitor has no app to go to: a plain card says what to ask for (no EmptyState with a dead-end action).
    return (
      <section className="rounded-card border-border bg-surface shadow-card flex w-full flex-col items-center gap-2 border p-6 text-center">
        <Icon icon={IconQr} className="text-muted text-3xl" aria-hidden />
        <h1 className="text-lg font-semibold">{t("invalid.title")}</h1>
        <p className="text-muted">{t("invalid.body")}</p>
      </section>
    );
  }
  const qr = qrSvg(pass.token);
  const lang = document.documentElement.lang;
  const locale = isLocale(lang) ? lang : "th";
  const valid = pass.from && pass.to && !Number.isNaN(Date.parse(pass.from)) && !Number.isNaN(Date.parse(pass.to));
  return (
    <section className="flex w-full flex-col items-center gap-4 text-center" data-testid="pass">
      <h1 className="text-2xl font-semibold text-balance">{t("heading", { place: pass.place ?? "" })}</h1>
      <p className="text-muted">{t("lede")}</p>
      <div className="rounded-card border-border bg-surface shadow-card w-full border p-5">
        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          className="mx-auto aspect-square w-full max-w-72"
          shapeRendering="crispEdges"
          role="img"
          aria-label={t("qrLabel")}
          data-testid="pass-qr"
        >
          <rect width={qr.size} height={qr.size} fill="#fff" />
          <path d={qr.path} fill="#121826" />
        </svg>
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        {pass.unit ? (
          <div>
            <dt className="sr-only">{t("unit")}</dt>
            <dd className="font-semibold">{pass.unit}</dd>
          </div>
        ) : null}
        {valid ? (
          <div>
            <dt className="sr-only">{t("window")}</dt>
            <dd className="text-muted">{windowText(pass.from, pass.to, locale)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-muted text-sm">{t("brightness")}</p>
    </section>
  );
}
