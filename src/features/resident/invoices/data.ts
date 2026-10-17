import "server-only";

import type { InvoiceView, ReceiptView } from "@/lib/api/contract-requests";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi, serverJson } from "@/lib/api/server";
import type { PageMeta, ResidentReceipt } from "@/lib/api/types";

import type { Loaded } from "../lease/data";

/** Page size of the invoice history and the receipts list (the API allows up to 100). */
export const PAGE_SIZE = 25;

/**
 * `GET /v1/resident/invoices?unpaid=true` — everything still to pay, across my units and landlords (D-061). One
 * page of 100 is far more than a resident ever has open.
 */
export async function loadOpenInvoices(): Promise<Loaded<InvoiceView[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/invoices", {
    params: { query: { unpaid: true, perPage: 100 } },
  });
  // CONTRACT-REQUEST #15/#19: the extra fields are read only when the API sends them.
  return data ? { data: data.data as InvoiceView[] } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/invoices?page=` — newest first, paid and open alike. */
export async function loadInvoicePage(page: number): Promise<Loaded<{ items: InvoiceView[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/invoices", {
    params: { query: { page, perPage: PAGE_SIZE } },
  });
  return data
    ? { data: { items: data.data as InvoiceView[], meta: data.meta } }
    : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/invoices/{invoiceId}` — as issued (its snapshot), with the live balance; 404 when not mine. */
export async function loadInvoice(invoiceId: string): Promise<Loaded<InvoiceView>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/invoices/{invoiceId}", {
    params: { path: { invoiceId } },
  });
  return data ? { data: data as InvoiceView } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/receipts?page=` — newest first (D-044). */
export async function loadReceiptPage(page: number): Promise<Loaded<{ items: ResidentReceipt[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/receipts", {
    params: { query: { page, perPage: PAGE_SIZE } },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/**
 * One receipt for `/receipts/{id}` (the link in the API's LINE receipt message). CONTRACT-REQUEST #19:
 * `GET /v1/resident/receipts/{receiptId}`; until the API publishes it, the receipt is looked up in my list
 * (newest first, a few pages — a receipt someone opens from LINE is a recent one).
 */
export async function loadReceipt(receiptId: string): Promise<Loaded<ReceiptView>> {
  // CONTRACT-REQUEST #19 (docs/contract-requests.md).
  const single = await serverJson<ReceiptView>(`/v1/resident/receipts/${encodeURIComponent(receiptId)}`);
  if (single.data) return { data: single.data };
  if (single.error.status !== 404 && single.error.status !== 405) return { error: single.error };
  const api = await serverApi();
  for (let page = 1; page <= 4; page += 1) {
    const { data, error, response } = await api.GET("/v1/resident/receipts", {
      params: { query: { page, perPage: 100 } },
    });
    if (!data) return { error: problemFromParsed(response, error) };
    const found = data.data.find((receipt) => receipt.id === receiptId);
    if (found) return { data: found };
    if (page * 100 >= data.meta.total) break;
  }
  return { error: single.error };
}
