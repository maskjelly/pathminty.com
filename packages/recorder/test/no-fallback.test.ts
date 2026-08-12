import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("recorder has no public collector fallback", () => {
  it("runtime does not send a site token or hard-code the public collector", () => {
    const runtime = read("../src/storefront-runtime.ts");
    // Must not hard-code the public Workers host as a fallback collector.
    expect(runtime).not.toMatch(/pathminty-collector-dev/);
    expect(runtime).not.toMatch(/workers\.dev\/v1\/replay-batches/);
    // Site token must not be read from recorder config or set by the browser.
    expect(runtime).not.toMatch(/publicToken/);
    expect(runtime).not.toMatch(/x-pathminty-site-token/);
  });

  it("config validation rejects third-party-looking collector URLs", () => {
    const runtime = read("../src/storefront-runtime.ts");
    // Guard strings exist only as rejection checks, not as upload targets.
    expect(runtime).toContain("invalid-collector-url");
    expect(runtime).toContain('includes("pathminty-collector")');
    expect(runtime).toContain('includes("/v1/replay-batches")');
  });
});

describe("gateway writes same-origin recorder config", () => {
  it("app setup metafield uses app proxy path without publicToken", () => {
    const setup = read("../../../apps/shopify-gateway/app/routes/app._index.tsx");
    expect(setup).toContain("STOREFRONT_CAPTURE_PATH");
    // Recorder config object must not embed publicToken (pixel settings still may).
    const recorderBlock = setup.slice(
      setup.indexOf("const recorderConfig"),
      setup.indexOf("const metafieldResponse"),
    );
    expect(recorderBlock).toContain("STOREFRONT_CAPTURE_PATH");
    expect(recorderBlock).not.toContain("publicToken");
    expect(recorderBlock).not.toContain("PATHMINTY_COLLECTOR_URL");
    expect(recorderBlock).not.toContain("/v1/replay-batches");
  });
});
