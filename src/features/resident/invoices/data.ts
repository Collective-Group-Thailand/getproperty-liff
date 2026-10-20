import "server-only";

import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { InvoiceView, PageMeta, ReceiptView, ResidentReceipt } from "@/lib/api/types";

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
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/invoices?page=` — newest first, paid and open alike. */
export async function loadInvoicePage(page: number): Promise<Loaded<{ items: InvoiceView[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/invoices", {
    params: { query: { page, perPage: PAGE_SIZE } },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/invoices/{invoiceId}` — as issued (its snapshot), with the live balance; 404 when not mine. */
export async function loadInvoice(invoiceId: string): Promise<Loaded<InvoiceView>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/invoices/{invoiceId}", {
    params: { path: { invoiceId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/receipts?page=` — newest first (D-044). */
export async function loadReceiptPage(page: number): Promise<Loaded<{ items: ResidentReceipt[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/receipts", {
    params: { query: { page, perPage: PAGE_SIZE } },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/receipts/{receiptId}` — one receipt with the invoices it paid; 404 when not mine. */
export async function loadReceipt(receiptId: string): Promise<Loaded<ReceiptView>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/receipts/{receiptId}", {
    params: { path: { receiptId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
