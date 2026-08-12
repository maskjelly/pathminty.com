import { describe, expect, it } from "vitest";

import {
  isRrwebFullSnapshotEvent,
  RRWEB_FULL_SNAPSHOT_TYPE,
  shouldFlushImmediatelyAfterEvent,
} from "../src/index";

describe("FullSnapshot immediate flush decision", () => {
  it("recognizes rrweb FullSnapshot type 2", () => {
    expect(RRWEB_FULL_SNAPSHOT_TYPE).toBe(2);
    expect(
      isRrwebFullSnapshotEvent({
        type: 2,
        data: { node: {} },
        timestamp: 1,
      }),
    ).toBe(true);
    expect(shouldFlushImmediatelyAfterEvent({ type: 2, data: {}, timestamp: 1 })).toBe(
      true,
    );
  });

  it("does not flush on incremental or meta events", () => {
    expect(shouldFlushImmediatelyAfterEvent({ type: 3, data: {}, timestamp: 1 })).toBe(
      false,
    );
    expect(shouldFlushImmediatelyAfterEvent({ type: 4, data: {}, timestamp: 1 })).toBe(
      false,
    );
    expect(shouldFlushImmediatelyAfterEvent(null)).toBe(false);
    expect(shouldFlushImmediatelyAfterEvent("full")).toBe(false);
  });
});
