const tokenVersion = 1 as const;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function constantTimeEqual(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);

  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return difference === 0;
}

export type StorefrontTokenClaims = Readonly<{
  version: typeof tokenVersion;
  shopId: string;
  issuedAt: number;
  expiresAt: number;
}>;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function isClaims(value: unknown): value is StorefrontTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;

  return (
    claims.version === tokenVersion &&
    typeof claims.shopId === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(claims.shopId) &&
    typeof claims.issuedAt === "number" &&
    Number.isInteger(claims.issuedAt) &&
    typeof claims.expiresAt === "number" &&
    Number.isInteger(claims.expiresAt) &&
    claims.expiresAt > claims.issuedAt
  );
}

export async function createStorefrontToken(
  claims: StorefrontTokenClaims,
  secret: string,
): Promise<string> {
  if (!isClaims(claims)) throw new Error("Invalid storefront token claims");

  const payload = encodeBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));

  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyStorefrontToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<StorefrontTokenClaims | null> {
  const [payload, encodedSignature, unexpected] = token.split(".");
  if (!payload || !encodedSignature || unexpected !== undefined) return null;

  try {
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      textEncoder.encode(payload),
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(textDecoder.decode(decodeBase64Url(payload)));
    if (!isClaims(parsed)) return null;
    if (parsed.issuedAt > nowSeconds + 60 || parsed.expiresAt <= nowSeconds)
      return null;

    return parsed;
  } catch {
    return null;
  }
}
