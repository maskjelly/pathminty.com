import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./passwords";

describe("passwords", () => {
  it("round-trips a staff password", async () => {
    const stored = await hashPassword("pathminty-ops-local");
    expect(stored.split("$")).toHaveLength(3);
    expect(await verifyPassword("pathminty-ops-local", stored)).toBe(true);
    expect(await verifyPassword("nope", stored)).toBe(false);
  });
});
