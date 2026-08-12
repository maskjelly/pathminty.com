import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type WorkerDatabase = NeonHttpDatabase<typeof schema>;

/** HTTP Neon client for Cloudflare Workers. Never use `pg` pools on the edge. */
export function createWorkerDatabase(connectionString: string): WorkerDatabase {
  return drizzle(neon(connectionString), { schema });
}

export function databaseUrlFromEnv(env: { DATABASE_URL?: string }): string | null {
  const value = env.DATABASE_URL?.trim();
  return value && value.length > 0 ? value : null;
}
