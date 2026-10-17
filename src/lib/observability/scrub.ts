/**
 * What error reports may contain (L1 1.3 §5, PDPA): no cookies, no authorization header, no query strings
 * (`liff.state`, invitation codes, LINE Login's `code`/`state`), no request bodies (id tokens, phone numbers, OTP
 * codes), no user beyond nothing. Applied to Sentry events and breadcrumbs in the browser and on the server.
 */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
    query_string?: unknown;
  };
  user?: unknown;
  breadcrumbs?: { data?: Record<string, unknown> }[];
  [key: string]: unknown;
}

export function stripQuery(url: string): string {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

const SECRET_HEADERS = new Set(["cookie", "authorization", "x-getproperty-csrf", "idempotency-key"]);

export function scrubEvent<T extends object>(input: T): T {
  const event = input as ScrubbableEvent;
  if (event.request) {
    const { request } = event;
    if (request.url) request.url = stripQuery(request.url);
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
      );
    }
  }
  delete event.user;
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.data) {
      for (const key of ["url", "to", "from"]) {
        const value = crumb.data[key];
        if (typeof value === "string") crumb.data[key] = stripQuery(value);
      }
      delete crumb.data.body;
    }
  }
  return input;
}
