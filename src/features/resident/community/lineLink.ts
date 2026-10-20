/**
 * The LINE "add friend / chat" link of a LINE id (contacts, D-073): an official account (`@…`) or a personal id
 * (`~…`). Opened with `openExternal` (`liff.openWindow`), which LINE turns into the chat.
 */
export function lineChatUrl(lineId: string): string {
  const id = lineId.trim();
  return id.startsWith("@")
    ? `https://line.me/R/ti/p/@${encodeURIComponent(id.slice(1))}`
    : `https://line.me/R/ti/p/~${encodeURIComponent(id)}`;
}

/** A dialable `tel:` URI: digits and a leading `+` only. */
export function telUri(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
