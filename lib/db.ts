import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { log } from "@/lib/logger";

const globalForDb = globalThis as unknown as { pool?: Pool };

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
// Neon's pooler (PgBouncer, transaction mode) rejects startup parameters such as statement_timeout.
const pooled = /-pooler\./.test(url);

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true },
    // PGlite shares one session. Each serverless instance holds its own pool, so keep it small and let
    // the Neon pooler (-pooler host) multiplex; the direct host has a low connection cap.
    max: local ? 1 : Number(process.env.DB_POOL_MAX ?? 3),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // Stop runaway queries from holding locks/connections. Not sent through the pooler (unsupported there);
    // transactions that take row locks call setTxTimeouts instead.
    ...(pooled ? {} : { statement_timeout: 15_000 }),
  });
// An idle client dying (Neon suspend, network blip) must be logged, not crash the process.
if (!globalForDb.pool) pool.on("error", (err) => log.error("pg pool idle client error", { err }));
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Per-transaction limits, safe under transaction pooling (SET LOCAL ends with the transaction).
 * Call first in any transaction that row-locks hot rows, so a pile-up fails fast instead of hanging.
 */
export async function setTxTimeouts(tx: Tx, lockMs = 5_000, statementMs = 15_000) {
  await tx.execute(sql.raw(`SET LOCAL lock_timeout = ${Math.trunc(lockMs)}`));
  await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${Math.trunc(statementMs)}`));
}

/** True when a Postgres lock/statement timeout fired (code is on `.cause` because Drizzle wraps driver errors). */
export function isBusyError(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null);
  const c = code?.cause?.code ?? code?.code;
  return c === "55P03" || c === "57014";
}
