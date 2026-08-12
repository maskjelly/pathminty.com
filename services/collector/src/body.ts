export class BodyTooLargeError extends Error {
  override readonly name = "BodyTooLargeError";
}

export async function readCappedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new BodyTooLargeError("Request body exceeds the configured limit");
  }

  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;

      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Body exceeds configured limit");
        throw new BodyTooLargeError("Request body exceeds the configured limit");
      }

      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}
