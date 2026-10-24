import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).default("razorpay"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  EMAIL_TRANSPORT: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (cached) return cached;
  const e = schema.parse(process.env);
  if (e.PAYMENT_PROVIDER === "razorpay") {
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay");
    }
  }
  for (const v of [e.RAZORPAY_KEY_ID, e.RAZORPAY_KEY_SECRET]) {
    if (v?.startsWith("rzp_live_")) throw new Error("Live Razorpay keys are not allowed; use rzp_test_ keys");
  }
  if (e.RAZORPAY_KEY_ID && !e.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    throw new Error("RAZORPAY_KEY_ID must start with rzp_test_");
  }
  // Deployed (non-localhost) production must have its operational secrets; local prod builds (e2e) are exempt.
  const deployed = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(e.APP_URL);
  if (deployed) {
    if (!e.CRON_SECRET || e.CRON_SECRET.length < 16) throw new Error("CRON_SECRET (16+ chars) is required in production");
    if (e.PAYMENT_PROVIDER === "razorpay" && !e.RAZORPAY_WEBHOOK_SECRET) throw new Error("RAZORPAY_WEBHOOK_SECRET is required in production");
    if (e.PAYMENT_PROVIDER === "mock") throw new Error("PAYMENT_PROVIDER=mock is not allowed in production");
    if (!e.REDIS_URL) throw new Error("REDIS_URL is required in production (rate limiting must be shared across instances)");
    if (e.EMAIL_TRANSPORT !== "resend" || !e.RESEND_API_KEY || !e.EMAIL_FROM) throw new Error("EMAIL_TRANSPORT=resend with RESEND_API_KEY and EMAIL_FROM is required in production");
    if (!e.AXIOM_TOKEN || !e.AXIOM_DATASET) throw new Error("AXIOM_TOKEN and AXIOM_DATASET are required in production");
    if (!e.SENTRY_DSN) throw new Error("SENTRY_DSN is required in production");
    if (!e.APP_URL.startsWith("https://")) throw new Error("APP_URL must be https in production");
  }
  cached = e;
  return e;
}
