import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { log } from "@/lib/logger";

const globalForDb = globalThis as unknown as { pool?: Pool };

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true },
    max: local ? 1 : 5, // PGlite shares one session; Neon free tier has small connection limits
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000, // stop runaway queries from holding locks/connections
  });
// An idle client dying (Neon suspend, network blip) must be logged, not crash the process.
if (!globalForDb.pool) pool.on("error", (err) => log.error("pg pool idle client error", { err }));
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
