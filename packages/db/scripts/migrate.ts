import process from "node:process";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { normalizePostgresConnectionString } from "../src/connection-string";

const connectionString = process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is required. Migrations must never use the pooled URL.",
  );
}

const pool = new Pool({
  connectionString: normalizePostgresConnectionString(connectionString),
  max: 1,
});

try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Database migrations applied successfully.");
} finally {
  await pool.end();
}
