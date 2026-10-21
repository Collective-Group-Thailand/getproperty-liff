/** The part of `EventSource` the connection uses (a fake in unit tests). */
export interface StreamLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

/**
 * At most one realtime stream (review M5). `resume()` connects when visible and nothing is open or in flight;
 * `pause()` (view hidden) and `stop()` (sign-out, unmount — final) close the current stream, cancel the retry timer
 * and invalidate an authorisation still in flight: each attempt carries a generation number, and an answer for an
 * older generation opens nothing. Every stream's `onerror` closes **that** stream and, only when it is still the
 * current one, schedules a reconnect.
 */
export function createRealtimeConnection(o: {
  /** Authorises a stream; the URL to open, or null when that failed (retried with backoff). */
  authorize: () => Promise<string | null>;
  open: (url: string) => StreamLike;
  onEvent: (event: MessageEvent<string>) => void;
  /** False while the LIFF view is hidden: nothing is opened then. */
  visible: () => boolean;
  /** Backoff before attempt `n` (ms). */
  delay: (attempt: number) => number;
}) {
  let current: StreamLike | null = null;
  let generation = 0;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;

  const close = () => {
    generation += 1;
    pending = false;
    clearTimeout(timer);
    timer = undefined;
    current?.close();
    current = null;
  };
  const retry = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void connect();
    }, o.delay(attempt++));
  };
  async function connect(): Promise<void> {
    if (stopped || current || pending || !o.visible()) return;
    pending = true;
    const mine = ++generation;
    const url = await o.authorize();
    if (mine !== generation) return; // paused, stopped or superseded while authorising
    pending = false;
    if (!o.visible()) return;
    if (!url) return retry();
    const stream = (current = o.open(url));
    // Every event is a default message (the BFF folds the event names into the data); any message — `ready` first —
    // means the stream works, so the backoff starts over.
    stream.onmessage = (event) => {
      attempt = 0;
      o.onEvent(event);
    };
    stream.onerror = () => {
      stream.close();
      if (current !== stream) return;
      current = null;
      retry();
    };
  }

  return {
    resume() {
      if (stopped) return;
      clearTimeout(timer);
      timer = undefined;
      attempt = 0;
      void connect();
    },
    pause: close,
    stop() {
      stopped = true;
      close();
    },
  };
}
