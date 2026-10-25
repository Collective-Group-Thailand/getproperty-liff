/**
 * `liff.state` deep links (design-system.md §4: LINE messages deep-link to the exact screen). LINE
 * opens the LIFF endpoint (`/liff`) with `?liff.state=<path>` for `https://liff.line.me/<id>/<path>`;
 * this turns that into an in-app path — or `/` when it is anything but a plain, known, same-origin path.
 * Never an open redirect.
 */
export const LIFF_STATE_PARAM = "liff.state";

/** First path segments a deep link may target (L2–L4 add their routes here). */
export const DEEP_LINK_ROOTS = [
  "",
  "bills",
  "invoices",
  "pay",
  "receipts",
  "usage",
  "requests",
  "lease",
  "notice",
  // L3/L2: the API's LINE messages link `/deposits/{id}` (deposit statement) and `/receipts/{id}`.
  "deposit",
  "deposits",
  "announcements",
  "parcels",
  // L4: community and access screens.
  "facilities",
  "rules",
  "contacts",
  "access",
  "profile",
  "technician",
  // L5: a listing someone asks about (`/rent/<slug>`) and my enquiries (`/rent/enquiries/<id>`), D-252.
  "rent",
  // L5 5.3: a landlord's quick actions (`/landlord`, `/landlord/leads/<id>`), D-251.
  "landlord",
  // L1: invitation acceptance from the operator's invite QR/SMS (`liff.state=/link?code=…`, D-061).
  "link",
  "consent",
] as const;

export function resolveLiffState(search: string | URLSearchParams | null | undefined): string {
  const params = typeof search === "string" || search == null ? new URLSearchParams(search ?? "") : search;
  return safeInternalPath(params.get(LIFF_STATE_PARAM));
}

/**
 * A `next` / `liff.state` value as an in-app path — or `/` for anything but a plain, known, same-origin path.
 * Used for every redirect target that came from a URL (sign-in `next`, consent `next`, deep links).
 */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return "/";

  let value = raw.trim();
  // LINE sometimes double-encodes the state.
  if (/%2f/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return "/";
    }
  }
  if (!value.startsWith("/")) value = `/${value}`;

  // Protocol-relative, backslash tricks, schemes and control characters are refused outright.
  const hasControl = [...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);
  if (value.startsWith("//") || value.includes("\\") || hasControl || /^\/[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "/";
  }

  let url: URL;
  try {
    url = new URL(value, "https://liff.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "https://liff.invalid") return "/";

  const root = url.pathname.split("/")[1] ?? "";
  // `URL` has already resolved `..`, so `/bills/../bff` is judged as `/bff`.
  if (!(DEEP_LINK_ROOTS as readonly string[]).includes(root)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}
