"use client";

import { useTranslations } from "next-intl";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";

import { ChoiceCards, ChoiceGroup, ChoiceTiles } from "@/features/shared/Choice";
import { formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi } from "@/lib/api/browser";
import { problemFromParsed, toApiError } from "@/lib/api/problem";
import { isRefusal } from "@/lib/api/refusal";
import type { OpenableGate } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Spinner } from "@/ui/components/Spinner";
import { Icon } from "@/ui/icons";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconInfo } from "@/ui/icons/glyphs/info";

import { CHOICE_KEY, busy, canPress, parseRetryAfter, retryIn, step, type OpenEvent, type OpenState } from "./gateOpen";
import { plateText } from "./model";

/** How long one press intent keeps its Idempotency-Key (the API's command window is 30 s). */
const PRESS_INTENT_MS = 30_000;

type OpenBody = { vehicleId: string; location?: { lat: number; lng: number; accuracyM?: number } };

function reducer(state: OpenState, event: OpenEvent): OpenState {
  return step(state, event);
}

function readChoice(): string {
  try {
    return window.localStorage.getItem(CHOICE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
const noSubscription = () => () => undefined;
function parseChoice(raw: string): { gateId?: string; vehicleId?: string } {
  try {
    return JSON.parse(raw) as { gateId?: string; vehicleId?: string };
  } catch {
    return {};
  }
}
function store(choice: { gateId: string; vehicleId: string }) {
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // LINE's in-app browser may refuse storage: the first car is chosen next time.
  }
}

/** The phone's location for one check (D-328: the API never stores it). */
function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 30_000,
    });
  });
}

/**
 * Opening the barrier with a registered car (D-316, D-328) — `/visitors` and `/visitors/open`. One large filled button
 * (the screen's one filled action); the gate when the estate has several, the car when the household has several (the
 * last choice is remembered on the phone). The phone location is asked for only when the estate requires it, with
 * the reason first. The result is said in words next to the button: opening → sent (the API cannot see the barrier;
 * the screen never claims "open"), wait n seconds after another open, not allowed, too far, no location.
 *
 * One Idempotency-Key per press intent (gate + car) for 30 s (review L3): a press again after a lost answer or a 5xx
 * resends the same request, so the API never opens twice for it; a 202 or a refusal ends the intent.
 */
export function OpenBarrier({ gates, locale }: { gates: OpenableGate[]; locale: Locale }) {
  const t = useTranslations("resident.visitors.open");
  const [state, dispatch] = useReducer(reducer, { kind: "idle" } as OpenState);
  const [now, setNow] = useState(() => Date.now());
  const attempt = useIdempotentAttempt<OpenBody>({ maxAgeMs: PRESS_INTENT_MS });
  // The last choice on this phone (read after hydration: the server renders the first gate and car).
  const saved = parseChoice(useSyncExternalStore(noSubscription, readChoice, () => "{}"));
  const [chosenGate, setGateId] = useState<string | null>(null);
  const [chosenVehicle, setVehicleId] = useState<string | null>(null);
  const gateId = chosenGate ?? saved.gateId;
  const gate = gates.find((g) => g.gateId === gateId) ?? gates[0];
  const vehicleId = chosenVehicle ?? saved.vehicleId ?? "";

  const ticking = state.kind === "opening" || state.kind === "rate_limited";
  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      dispatch({ type: "tick", now: at });
    }, 250);
    return () => window.clearInterval(timer);
  }, [ticking]);

  if (!gate) return null;
  const vehicle = gate.vehicles.find((v) => v.id === vehicleId) ?? gate.vehicles[0];
  if (!vehicle) return null;

  async function open() {
    if (!gate || !vehicle) return;
    dispatch({ type: "press", requireGeofence: gate.requireGeofence });
    store({ gateId: gate.gateId, vehicleId: vehicle.id });
    let location: { lat: number; lng: number; accuracyM?: number } | undefined;
    if (gate.requireGeofence) {
      try {
        const position = await locate();
        location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
        };
        dispatch({ type: "located" });
      } catch (error) {
        const denied = typeof error === "object" && error !== null && (error as GeolocationPositionError).code === 1;
        dispatch({ type: "locationError", denied });
        return;
      }
    }
    const intent = { gateId: gate.gateId, vehicleId: vehicle.id };
    const fresh: OpenBody = location ? { vehicleId: vehicle.id, location } : { vehicleId: vehicle.id };
    const { key, body } = await attempt.prepare(intent, () => fresh);
    try {
      const { data, error, response } = await browserApi.POST("/v1/resident/gates/{gateId}/actions/open", {
        params: { path: { gateId: gate.gateId }, header: { "Idempotency-Key": key } },
        body,
      });
      const at = Date.now();
      setNow(at);
      if (data) {
        attempt.succeeded();
        dispatch({ type: "accepted", now: at });
        return;
      }
      const problem = problemFromParsed(response, error);
      if (isRefusal(problem)) attempt.succeeded();
      else attempt.failed(problem);
      dispatch({
        type: "problem",
        status: response.status,
        code: problem.code,
        retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after"), at),
        requestId: problem.requestId,
        now: at,
      });
    } catch (caught) {
      const problem = toApiError(caught);
      attempt.failed(problem);
      dispatch({
        type: "problem",
        status: problem.status,
        code: problem.code,
        now: Date.now(),
        requestId: problem.requestId,
      });
    }
  }

  const pressable = canPress(state, now);
  const several = gates.length > 1;
  return (
    <section
      aria-labelledby="open-barrier-title"
      className="rounded-card border-border bg-surface shadow-card flex flex-col gap-4 border p-4"
      data-testid="open-barrier"
      data-state={state.kind}
    >
      <div className="flex flex-col gap-1">
        <h2 id="open-barrier-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        {gate.requireGeofence ? (
          <p className="text-muted flex items-start gap-2 text-sm" data-testid="open-geofence">
            <Icon icon={IconInfo} className="mt-0.5 shrink-0" aria-hidden />
            {t("geofence")}
          </p>
        ) : null}
      </div>

      {several ? (
        <ChoiceGroup legend={t("gate")} testId="open-gates">
          {(describedBy) => (
            <ChoiceTiles
              name="open-gate"
              variant="chip"
              value={gate.gateId}
              describedBy={describedBy}
              options={gates.map((g) => ({ value: g.gateId, label: g.name }))}
              onChange={(value) => {
                setGateId(value);
                const next = gates.find((g) => g.gateId === value);
                if (next && !next.vehicles.some((v) => v.id === vehicleId)) setVehicleId(next.vehicles[0]?.id ?? null);
              }}
            />
          )}
        </ChoiceGroup>
      ) : null}

      {gate.vehicles.length > 1 ? (
        <ChoiceGroup legend={t("car")} testId="open-cars">
          {(describedBy) => (
            <ChoiceCards
              name="open-car"
              value={vehicle.id}
              onChange={setVehicleId}
              describedBy={describedBy}
              options={gate.vehicles.map((v) => ({
                value: v.id,
                label: `${plateText(v.plate)} · ${v.plate.province}`,
                hint: v.label ?? undefined,
                testId: `open-car-${v.id}`,
              }))}
            />
          )}
        </ChoiceGroup>
      ) : (
        <p className="text-muted flex items-center gap-2 text-sm" data-testid="open-car">
          <Icon icon={IconCar} className="shrink-0" aria-hidden />
          <span>
            <span className="text-fg font-mono font-medium">{plateText(vehicle.plate)}</span>
            {vehicle.label ? ` · ${vehicle.label}` : ""}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          size="xl"
          block
          iconStart={IconCar}
          loading={busy(state)}
          disabled={!pressable}
          onClick={() => void open()}
          data-testid="open-barrier-button"
        >
          {several ? t("buttonAt", { gate: gate.name }) : t("button")}
        </Button>

        <OpenStatus state={state} now={now} locale={locale} />
      </div>
    </section>
  );
}

function OpenStatus({ state, now, locale }: { state: OpenState; now: number; locale: Locale }) {
  const t = useTranslations("resident.visitors.open.state");
  // Refusals and failures are callouts (they announce themselves); progress and "sent" are a polite status line.
  if (
    state.kind === "failed" ||
    state.kind === "not_allowed" ||
    state.kind === "outside" ||
    state.kind === "location_denied" ||
    state.kind === "location_unavailable" ||
    state.kind === "no_estate_location" ||
    state.kind === "no_barrier"
  ) {
    return (
      <div data-testid="open-status" data-kind={state.kind}>
        <Callout tone="warning" size="sm">
          {t(state.kind)}
        </Callout>
      </div>
    );
  }
  let body: React.ReactNode = null;
  switch (state.kind) {
    case "idle":
      body = null;
      break;
    case "locating":
    case "sending":
    case "opening":
      body = (
        <span className="flex items-center gap-2">
          <Spinner size="sm" label={t(state.kind)} />
          <span aria-hidden="true">{t(state.kind)}</span>
        </span>
      );
      break;
    case "sent":
      body = (
        <span className="flex flex-col gap-0.5">
          <span className="text-fg flex items-center gap-2 font-medium">
            <Icon icon={IconCheckCircle} className="text-success shrink-0" aria-hidden />
            {t("sent", { time: formatTime(state.at, locale) })}
          </span>
          <span>{t("sentBody")}</span>
        </span>
      );
      break;
    case "rate_limited":
      body = t("rate_limited", { seconds: Math.max(1, retryIn(state, now)) });
      break;
  }
  return (
    <p className="text-muted text-sm" role="status" aria-live="polite" data-testid="open-status">
      {body}
    </p>
  );
}
