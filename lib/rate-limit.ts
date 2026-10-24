import "server-only";
import Redis from "ioredis";
import { log } from "@/lib/logger";

// Fixed-window limiter. Redis-backed when REDIS_URL is set (shared across instances);
// otherwise per-process memory (local dev/tests). If Redis errors, we fail open to memory rather than block checkout.
const g = globalThis as unknown as { redis?: Redis | null };

function redis(): Redis | null {
  if (g.redis !== undefined) return g.redis;
  const url = process.env.REDIS_URL;
  if (!url) return (g.redis = null);
  const r = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000, commandTimeout: 1000, lazyConnect: false });
  r.on("error", (err) => log.warn("redis error", { err }));
  return (g.redis = r);
}

const buckets = new Map<string, { n: number; reset: number }>();

function memoryLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

/** Returns true if the request is allowed. */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const r = redis();
  if (!r) return memoryLimit(key, max, windowMs);
  try {
    const k = `rl:${key}`;
    // INCR then set expiry only on first hit, atomically, so a crash can't leave a key without a TTL.
    const n = (await r.eval(
      "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return n",
      1, k, String(windowMs),
    )) as number;
    return n <= max;
  } catch (err) {
    log.warn("rate limit fell back to memory", { err });
    return memoryLimit(key, max, windowMs);
  }
}
