import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  createStorefrontToken,
  verifyStorefrontToken,
} from "../src/index";

const claims = {
  version: 1 as const,
  shopId: "pathminty-demo-store.myshopify.com",
  issuedAt: 1_723_363_200,
  expiresAt: 1_723_366_800,
};

describe("storefront token", () => {
  it("compares publishable tokens without early exit", async () => {
    await expect(constantTimeEqual("token-a", "token-a")).resolves.toBe(true);
    await expect(constantTimeEqual("token-a", "token-b-longer")).resolves.toBe(false);
  });

  it("round-trips valid claims", async () => {
    const token = await createStorefrontToken(claims, "development-secret");
    await expect(
      verifyStorefrontToken(token, "development-secret", claims.issuedAt),
    ).resolves.toEqual(claims);
  });

  it("rejects a tampered token", async () => {
    const token = await createStorefrontToken(claims, "development-secret");
    await expect(
      verifyStorefrontToken(`${token}x`, "development-secret", claims.issuedAt),
    ).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createStorefrontToken(claims, "development-secret");
    await expect(
      verifyStorefrontToken(token, "development-secret", claims.expiresAt),
    ).resolves.toBeNull();
  });
});
