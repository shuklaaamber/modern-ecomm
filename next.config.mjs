import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);

const dev = process.env.NODE_ENV !== "production";

// Razorpay Standard Checkout needs its script, an iframe and a few connections.
// Next.js inlines hydration scripts, so script-src keeps 'unsafe-inline'; a per-request nonce would be stricter.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval' " : ""}https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data: https://*.razorpay.com",
  "connect-src 'self' https://*.razorpay.com https://lumberjack.razorpay.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io" + (dev ? " ws: wss:" : ""),
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const config = {
  poweredByHeader: false,
  output: "standalone", // minimal self-contained server for the Docker image
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// Uploads source maps at build time only when SENTRY_AUTH_TOKEN is set; otherwise a plain build.
// The package entry resolved by Node does not export withSentryConfig, so load its config module directly (path may change on upgrade).
export default process.env.SENTRY_AUTH_TOKEN
  ? require(path.join(path.dirname(require.resolve("@sentry/nextjs/package.json")), "build/cjs/config/index.js")).withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : config;
