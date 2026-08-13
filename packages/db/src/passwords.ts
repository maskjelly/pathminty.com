const textEncoder = new TextEncoder();
/** Workers-safe. Legacy hashes used 120000 and a two-part `salt$hash`. */
export const PASSWORD_ITERATIONS = 10_000;
const LEGACY_ITERATIONS = 120_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function saltBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBuffer(salt),
      iterations,
    },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(
  password: string,
  saltHex?: string,
  iterations: number = PASSWORD_ITERATIONS,
): Promise<string> {
  const salt =
    saltHex !== undefined
      ? fromHex(saltHex)
      : crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, salt, iterations);
  return `${toHex(salt)}$${iterations}$${digest}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length === 3) {
    const [salt, iterRaw, expected] = parts;
    const iterations = Number(iterRaw);
    if (!salt || !expected || !Number.isInteger(iterations) || iterations < 1) {
      return false;
    }
    const digest = await derive(password, fromHex(salt), iterations);
    return digest === expected;
  }
  if (parts.length === 2) {
    const [salt, expected] = parts;
    if (!salt || !expected) return false;
    const digest = await derive(password, fromHex(salt), LEGACY_ITERATIONS);
    return digest === expected;
  }
  return false;
}
