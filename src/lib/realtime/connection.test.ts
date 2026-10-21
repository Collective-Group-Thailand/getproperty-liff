import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRealtimeConnection, type StreamLike } from "./connection";

class FakeStream implements StreamLike {
  onmessage: StreamLike["onmessage"] = null;
  onerror: StreamLike["onerror"] = null;
  closed = false;
  close() {
    this.closed = true;
  }
}

function harness() {
  let visible = true;
  const streams: FakeStream[] = [];
  const pending: ((url: string | null) => void)[] = [];
  const connection = createRealtimeConnection({
    authorize: () => new Promise((resolve) => pending.push(resolve)),
    open: () => {
      const stream = new FakeStream();
      streams.push(stream);
      return stream;
    },
    onEvent: vi.fn(),
    visible: () => visible,
    delay: () => 1000,
  });
  const flush = () => vi.advanceTimersByTimeAsync(0);
  return {
    connection,
    streams,
    pending,
    flush,
    setVisible: (v: boolean) => (visible = v),
    live: () => streams.filter((s) => !s.closed),
  };
}

describe("realtime connection (review M5: one stream at most)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hidden and shown while the authorisation is in flight: one stream, not two", async () => {
    const h = harness();
    h.connection.resume();
    h.setVisible(false);
    h.connection.pause();
    h.setVisible(true);
    h.connection.resume();
    expect(h.pending).toHaveLength(2);
    h.pending[0]!("/bff/v1/resident/realtime/stream");
    h.pending[1]!("/bff/v1/resident/realtime/stream");
    await h.flush();
    expect(h.streams).toHaveLength(1);
    expect(h.live()).toHaveLength(1);
  });

  it("does not open a stream while the view is hidden or after sign-out", async () => {
    const h = harness();
    h.connection.resume();
    h.setVisible(false);
    h.pending[0]!("/s");
    await h.flush();
    expect(h.streams).toHaveLength(0);
    h.setVisible(true);
    h.connection.resume();
    h.connection.stop();
    h.pending[1]!("/s");
    await h.flush();
    expect(h.streams).toHaveLength(0);
    h.connection.resume();
    expect(h.pending).toHaveLength(2);
  });

  it("sign-out closes the open stream and nothing reconnects", async () => {
    const h = harness();
    h.connection.resume();
    h.pending[0]!("/s");
    await h.flush();
    expect(h.live()).toHaveLength(1);
    h.connection.stop();
    expect(h.live()).toHaveLength(0);
    h.streams[0]!.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.pending).toHaveLength(1);
  });

  it("an error closes its own stream only and reconnects once", async () => {
    const h = harness();
    h.connection.resume();
    h.pending[0]!("/s");
    await h.flush();
    const old = h.streams[0]!;
    old.onerror?.(new Event("error"));
    expect(old.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.pending).toHaveLength(2);
    h.pending[1]!("/s");
    await h.flush();
    const current = h.streams[1]!;
    old.onerror?.(new Event("error")); // a late error of the old stream
    expect(current.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.pending).toHaveLength(2);
  });
});
