import { defineConfig } from "@playwright/test";

const PORT = 3100;

// Runs the PRODUCTION build (`npm run build` first). Uses the database in .env, and the test
// specs create their own tagged orders. Razorpay is in test mode.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, headless: process.env.HEADED ? false : true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/cron/release`,
    // That endpoint answers 401 without the secret, which still proves the server is up.
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { APP_URL: `http://localhost:${PORT}`, BETTER_AUTH_URL: `http://localhost:${PORT}` },
  },
});
