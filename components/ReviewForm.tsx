"use client";
import { useState, useTransition } from "react";
import { submitReview } from "@/app/actions/engage";
import { btn, input, Notice } from "@/components/ui";

export function ReviewForm({ productId, signedIn }: { productId: number; signedIn: boolean }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!signedIn) return <p className="text-sm text-muted"><a className="underline" href="/sign-in">Sign in</a> to write a review.</p>;

  return (
    <form
      className="space-y-3 rounded-card border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitReview({ productId, rating, body });
          setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
        });
      }}
    >
      <h3 className="font-medium">Write a review</h3>
      <label className="block text-sm">
        Rating
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className={`${input} mt-1 max-w-40`}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        Your review (optional)
        <textarea value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} rows={3} className={`${input} mt-1`} />
      </label>
      <button className={btn} disabled={pending}>{pending ? "Saving…" : "Submit review"}</button>
      <div aria-live="polite">{msg && <Notice kind={msg.ok ? "success" : "error"}>{msg.text}</Notice>}</div>
    </form>
  );
}
