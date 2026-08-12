import process from "node:process";

import { Pool } from "pg";

import { normalizePostgresConnectionString } from "../src/connection-string";

interface ConnectionState {
  database: string;
  version: string;
  shops: string | null;
  sessions: string | null;
  orders: string | null;
}

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString: normalizePostgresConnectionString(connectionString),
  max: 1,
});

try {
  const result = await pool.query<ConnectionState>(
    `select
      current_database() as database,
      current_setting('server_version') as version,
      to_regclass('public.shops') as shops,
      to_regclass('public.sessions') as sessions,
      to_regclass('public.orders') as orders`,
  );
  const connection = result.rows[0];

  if (!connection || !connection.shops || !connection.sessions || !connection.orders) {
    throw new Error("Connected, but the expected PathMinty schema is incomplete.");
  }

  console.log(
    `Connected to ${connection.database} on PostgreSQL ${connection.version}; PathMinty schema is ready.`,
  );
} finally {
  await pool.end();
}
