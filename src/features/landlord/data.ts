import "server-only";

import { TIME_ZONE } from "@/i18n/format";
import { problemFromParsed, type ApiError } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";

import { currentTime } from "../shared/time";

type Loaded<T> = { data: T; error?: undefined } | { data?: undefined; error: ApiError };

/** `YYYY-MM-DD` in Bangkok, `days` before today (a query bound, not a business date). */
function bangkokDay(daysAgo: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    new Date(currentTime() - daysAgo * 86_400_000),
  );
}

export interface LandlordToday {
  leads: Schemas["OwnerLeadSummaryDto"][];
  viewings: Schemas["OwnerViewingDto"][];
  payments: Schemas["PaymentDto"][];
  overdue: Schemas["InvoiceSummaryDto"][];
  ending: Schemas["LeaseDto"][];
}

/**
 * Today's items of a landlord (L5 5.3, D-251), each read as the API answers it — the app never decides what is
 * overdue or ending: open enquiries waiting for a reply, viewings still `requested`, confirmed payments of the last
 * 7 days, `overdue` invoices, leases `notice_given` / `ending`.
 */
export async function loadToday(): Promise<Loaded<LandlordToday>> {
  const api = await serverApi("landlord");
  const [leads, viewings, payments, overdue, notice, ending] = await Promise.all([
    api.GET("/v1/owner/leads", { params: { query: { open: true } } }),
    api.GET("/v1/owner/listing-viewings", { params: { query: { from: bangkokDay(0) } } }),
    api.GET("/v1/owner/payments", {
      params: { query: { from: bangkokDay(6), status: "confirmed", perPage: 20 } },
    }),
    api.GET("/v1/owner/invoices", { params: { query: { status: "overdue", perPage: 20 } } }),
    api.GET("/v1/owner/leases", { params: { query: { status: "notice_given", perPage: 20 } } }),
    api.GET("/v1/owner/leases", { params: { query: { status: "ending", perPage: 20 } } }),
  ]);
  for (const result of [leads, viewings, payments, overdue, notice, ending]) {
    if (!result.data) return { error: problemFromParsed(result.response, result.error) };
  }
  return {
    data: {
      leads: leads.data!.filter((lead) => lead.awaitingReply),
      viewings: viewings.data!.filter((viewing) => viewing.state === "requested"),
      payments: payments.data!.data,
      overdue: overdue.data!.data,
      ending: [...notice.data!.data, ...ending.data!.data],
    },
  };
}

export async function loadLead(leadId: string): Promise<Loaded<Schemas["OwnerLeadDto"]>> {
  const api = await serverApi("landlord");
  const { data, error, response } = await api.GET("/v1/owner/leads/{leadId}", { params: { path: { leadId } } });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
