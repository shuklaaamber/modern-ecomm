"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { mergeCartAfterSignIn } from "@/app/actions/cart";
import { btn, input, Notice } from "@/components/ui";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = mode === "sign-up";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const res = up
      ? await authClient.signUp.email({ email, password, name: String(fd.get("name")) })
      : await authClient.signIn.email({ email, password });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    // Wait for the cart merge and a refresh BEFORE navigating, so protected pages see the new session.
    await mergeCartAfterSignIn();
    router.refresh();
    router.push(next);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{up ? "Create your account" : "Sign in"}</h1>
      {up && (
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">Name</label>
          <input id="name" name="name" required autoComplete="name" className={input} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={input} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete={up ? "new-password" : "current-password"} className={input} />
        {up && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
      </div>
      <div aria-live="assertive">{error && <Notice kind="error">{error}</Notice>}</div>
      <button className={`${btn} w-full`} disabled={busy}>{busy ? "Please wait…" : up ? "Create account" : "Sign in"}</button>
      <p className="text-center text-sm text-muted">
        {up ? "Already have an account? " : "New here? "}
        <Link className="underline" href={`${up ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(next)}`}>{up ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
