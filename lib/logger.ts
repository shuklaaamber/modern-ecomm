// Structured JSON logs: one line to stdout per event, and (when configured) shipped to Axiom; errors also go to Sentry.
// Shipping is batched, best-effort and never throws or blocks the request path.
import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";

function serializeError(e: unknown) {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack, code: (e.cause as { code?: string } | undefined)?.code };
  return { message: String(e) };
}

const queue: object[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const MAX_QUEUE = 1000;

async function flush() {
  timer = undefined;
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET;
  if (!token || !dataset || queue.length === 0) { queue.length = 0; return; }
  const batch = queue.splice(0, 100);
  const base = process.env.AXIOM_URL || "https://api.axiom.co";
  try {
    const res = await fetch(`${base}/v1/datasets/${encodeURIComponent(dataset)}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(JSON.stringify({ level: "warn", msg: "axiom rejected batch", status: res.status }));
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", msg: "axiom unreachable", err: serializeError(e) }));
  }
  if (queue.length) schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(flush, 2000);
  timer.unref?.();
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const { err, ...rest } = fields ?? {};
  const event = { level, msg, ...rest, ...(err ? { err: serializeError(err) } : {}) };
  const time = new Date().toISOString();
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify({ time, ...event }));
  if (process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ _time: time, host: process.env.HOSTNAME, service: "thread-and-co", ...event });
    schedule();
  }
  if (level === "error" && process.env.SENTRY_DSN) {
    Sentry.captureException(err instanceof Error ? err : new Error(msg), { extra: { msg, ...rest } });
  }
}

export const log = {
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};
