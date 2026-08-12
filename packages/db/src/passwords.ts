const textEncoder = new TextEncoder();

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

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<string> {
  const salt =
    saltHex !== undefined
      ? fromHex(saltHex)
      : crypto.getRandomValues(new Uint8Array(16));
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
      salt: salt as BufferSource,
      iterations: 120_000,
    },
    key,
    256,
  );
  return `${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split("$");
  if (!salt || !expected) return false;
  const next = await hashPassword(password, salt);
  return next === stored;
}
