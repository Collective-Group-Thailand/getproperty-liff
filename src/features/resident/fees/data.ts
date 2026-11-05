import "server-only";

import { notFound } from "next/navigation";

import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type {
  BudgetActual,
  DebtClearance,
  InvoiceView,
  PageMeta,
  PaymentMandate,
  PaymentPlan,
  Statement,
} from "@/lib/api/types";
import { getActor } from "@/lib/auth/actor";
import type { MyUnit } from "@/lib/auth/units";

import type { Loaded } from "../lease/data";

/**
 * JL1 — the co-owner's money with the juristic office, read on the server (D-304 … D-308, D-325, D-326). Every figure
 * is the API's; nothing here adds anything up.
 */

/** Pages of `/v1/resident/invoices` read for `/fees` (100 each; a co-owner has a few per year and unit). */
const FEE_PAGES = 2;

/** My invoices across units, newest first — `/fees` keeps the juristic office's (common fee / fund lines). */
export async function loadFeeInvoices(): Promise<Loaded<InvoiceView[]>> {
  const api = await serverApi();
  const out: InvoiceView[] = [];
  for (let page = 1; page <= FEE_PAGES; page += 1) {
    const { data, error, response } = await api.GET("/v1/resident/invoices", {
      params: { query: { page, perPage: 100 } },
    });
    if (!data) return { error: problemFromParsed(response, error) };
    out.push(...data.data);
    if (page * data.meta.perPage >= data.meta.total) break;
  }
  return { data: out };
}

/** The building's approved budget against what was billed (D-304, D-326); `null` when there is none (404). */
export async function loadBudget(unitId: string): Promise<Loaded<BudgetActual | null>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/budget-vs-actual", {
    params: { path: { unitId } },
  });
  if (data) return { data };
  if (response.status === 404) return { data: null };
  return { error: problemFromParsed(response, error) };
}

export async function loadMandates(unitId: string): Promise<Loaded<PaymentMandate[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/payment-mandates", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

export async function loadPlans(unitId: string): Promise<Loaded<PaymentPlan[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/payment-plans", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

export async function loadClearances(unitId: string): Promise<Loaded<DebtClearance[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/debt-clearances", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

export const STATEMENT_PAGE_SIZE = 12;

/** `GET /v1/resident/statements` — newest month first, across my units (D-307). */
export async function loadStatementPage(page: number): Promise<Loaded<{ items: Statement[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/statements", {
    params: { query: { page, perPage: STATEMENT_PAGE_SIZE } },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/**
 * One statement by id: the contract has no `GET /v1/resident/statements/{id}` (contract request #48), so it is looked
 * up in my newest 300 (25 years of monthly statements); `null` when it is not among them.
 */
export async function loadStatement(statementId: string): Promise<Loaded<Statement | null>> {
  const api = await serverApi();
  for (let page = 1; page <= 3; page += 1) {
    const { data, error, response } = await api.GET("/v1/resident/statements", {
      params: { query: { page, perPage: 100 } },
    });
    if (!data) return { error: problemFromParsed(response, error) };
    const found = data.data.find((statement) => statement.id === statementId);
    if (found) return { data: found };
    if (page * data.meta.perPage >= data.meta.total) break;
  }
  return { data: null };
}

/**
 * A unit route (`/units/{unitId}/…`): one of my units that is billed to me (`invoices` capability, D-322) — anything
 * else is not found (never "forbidden": the unit is simply not part of my app).
 */
export async function billedUnitOr404(unitId: string): Promise<MyUnit> {
  const actor = await getActor();
  const unit =
    actor.status === "signed-in"
      ? actor.units.find((u) => u.unitId === unitId && u.capabilities.includes("invoices"))
      : undefined;
  if (!unit) notFound();
  return unit;
}
