/** rrweb EventType.FullSnapshot */
export const RRWEB_FULL_SNAPSHOT_TYPE = 2 as const;

/**
 * True when an rrweb event is a FullSnapshot (type === 2).
 * Used to flush the initial DOM capture immediately without waiting for the
 * 5s interval — critical for short visits and non-keepalive large uploads.
 */
export function isRrwebFullSnapshotEvent(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false;
  if (!("type" in event)) return false;
  return event.type === RRWEB_FULL_SNAPSHOT_TYPE;
}

/** Whether push of this event should trigger an immediate non-final flush. */
export function shouldFlushImmediatelyAfterEvent(event: unknown): boolean {
  return isRrwebFullSnapshotEvent(event);
}
