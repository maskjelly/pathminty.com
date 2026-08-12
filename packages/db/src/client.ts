import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { normalizePostgresConnectionString } from "./connection-string";
import * as schema from "./schema";

export interface DatabaseClientOptions extends Omit<PoolConfig, "connectionString"> {
  connectionString: string;
}

/**
 * Creates the portable PostgreSQL client used by Node services and Cloudflare
 * Workers through Hyperdrive. Call `close` when a long-running process exits.
 */
export function createDatabaseClient({
  connectionString,
  ...poolOptions
}: DatabaseClientOptions) {
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(connectionString),
    max: 5,
    ...poolOptions,
  });

  return {
    db: drizzle({ client: pool, schema }),
    close: () => pool.end(),
  };
}
