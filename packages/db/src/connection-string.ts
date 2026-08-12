const SSL_MODES_WITH_FUTURE_SEMANTIC_CHANGES = new Set([
  "prefer",
  "require",
  "verify-ca",
]);

/** Keeps `pg` certificate verification explicit across driver major versions. */
export function normalizePostgresConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode && SSL_MODES_WITH_FUTURE_SEMANTIC_CHANGES.has(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
