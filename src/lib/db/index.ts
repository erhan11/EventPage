import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __eventpagePool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
}

// Reuse the pool across hot reloads in development.
const pool = globalForDb.__eventpagePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__eventpagePool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema };
