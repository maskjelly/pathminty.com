import { afterEach, describe, expect, it, vi } from "vitest";

import { log } from "../src/index";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it("emits structured JSON without an error stack", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    log("error", "collector_failed", { requestId: "request-1" }, new Error("no"));

    const output = String(consoleSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({
      event: "collector_failed",
      requestId: "request-1",
      errorMessage: "no",
    });
    expect(output).not.toContain("stack");
  });
});
