import { describe, expect, it } from "vitest";

import { BodyTooLargeError, readCappedBody } from "../src/body";

describe("readCappedBody", () => {
  it("reads a request within the limit", async () => {
    const request = new Request("https://collector.test", {
      method: "POST",
      body: "hello",
    });

    await expect(readCappedBody(request, 10)).resolves.toEqual(
      new TextEncoder().encode("hello"),
    );
  });

  it("rejects a declared oversized request before reading", async () => {
    const request = new Request("https://collector.test", {
      method: "POST",
      headers: { "content-length": "20" },
      body: "hello",
    });

    await expect(readCappedBody(request, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
