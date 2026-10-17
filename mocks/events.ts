/**
 * The mock API's realtime fan-out: each open `GET /v1/resident/realtime/stream` subscribes for its user, and a
 * mock state change emits `{ type, ids }` (contract §6: ids and type only; the app refetches). One registry per
 * server process, on `globalThis`, like the rest of the mock state (`mocks/state.ts`).
 */
type Listener = (type: string, ids: Record<string, string>) => void;

const holder = globalThis as typeof globalThis & { __gpMockStreams?: Map<string, Set<Listener>> };
holder.__gpMockStreams ??= new Map();
const streams = holder.__gpMockStreams;

export function subscribeEvents(userId: string, listener: Listener): () => void {
  const set = streams.get(userId) ?? new Set<Listener>();
  set.add(listener);
  streams.set(userId, set);
  return () => {
    set.delete(listener);
  };
}

export function emit(userId: string, type: string, ids: Record<string, string>): void {
  for (const listener of streams.get(userId) ?? []) listener(type, ids);
}
