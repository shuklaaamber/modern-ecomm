"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { btn } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted">That didn’t work. Your cart is safe. Please try again.</p>
      <button className={btn} onClick={reset}>Try again</button>
    </div>
  );
}
