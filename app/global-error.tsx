"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort boundary when the root layout itself fails; must render its own <html>.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <div role="alert">
          <h1>Something went wrong</h1>
          <p>Please try again.</p>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
