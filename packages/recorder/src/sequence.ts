/**
 * Cross-navigation session identity and sequence allocation.
 *
 * Sequence numbers are unique and monotonically increasing for the whole browser
 * session (sessionStorage). They are allocated BEFORE an upload starts so a
 * pagehide flush and the next document cannot race and overwrite the same R2 key.
 */

export const STORAGE_KEYS = Object.freeze({
  sessionId: "pathminty:sessionId",
  visitorId: "pathminty:visitorId",
  sequence: "pathminty:sequence",
});

export type SequenceStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SessionIdentity = Readonly<{
  sessionId: string;
  visitorId: string;
}>;

function createUuid(randomUUID: () => string): string {
  return randomUUID();
}

export function getOrCreateSessionIdentity(
  store: SequenceStore,
  randomUUID: () => string,
): SessionIdentity {
  let sessionId = store.getItem(STORAGE_KEYS.sessionId);
  if (!sessionId) {
    sessionId = createUuid(randomUUID);
    store.setItem(STORAGE_KEYS.sessionId, sessionId);
  }

  let visitorId = store.getItem(STORAGE_KEYS.visitorId);
  if (!visitorId) {
    // Stable for the tab lifetime; not a cross-device identifier.
    visitorId = `v_${sessionId.replace(/-/gu, "").slice(0, 24)}`;
    store.setItem(STORAGE_KEYS.visitorId, visitorId);
  }

  return { sessionId, visitorId };
}

/**
 * Returns the next sequence and persists the increment immediately.
 * Call once per batch, before the network request begins.
 */
export function allocateSequence(store: SequenceStore): number {
  const raw = store.getItem(STORAGE_KEYS.sequence);
  const current = raw === null || raw === "" ? 0 : Number(raw);
  const sequence = Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
  store.setItem(STORAGE_KEYS.sequence, String(sequence + 1));
  return sequence;
}

export function peekSequence(store: SequenceStore): number {
  const raw = store.getItem(STORAGE_KEYS.sequence);
  const current = raw === null || raw === "" ? 0 : Number(raw);
  return Number.isFinite(current) && current >= 0 ? Math.floor(current) : 0;
}
