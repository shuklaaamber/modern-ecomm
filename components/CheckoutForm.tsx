"use client";
import Script from "next/script";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearCart } from "@/app/actions/cart";
import { btn, input, Notice } from "@/components/ui";

type Start = {
  orderNumber: string; providerOrderId: string; amountCents: number; currency: string;
  provider: "razorpay" | "mock"; keyId: string | null; error?: string;
};

declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, cb: (r: { error: { description: string } }) => void): void };
  }
}

const FIELDS = [
  { name: "name", label: "Full name", autoComplete: "name" },
  { name: "phone", label: "Mobile number", autoComplete: "tel-national", inputMode: "numeric" as const },
  { name: "line1", label: "Address", autoComplete: "street-address" },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "state", label: "State", autoComplete: "address-level1" },
  { name: "pincode", label: "PIN code", autoComplete: "postal-code", inputMode: "numeric" as const },
];

export function CheckoutForm({ defaultEmail, defaultName, totalLabel }: { defaultEmail: string; defaultName: string; totalLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // One key per form session: a double-click or retry reuses the same order instead of duplicating it.
  const idem = useRef<string>(crypto.randomUUID());
  const emailRef = useRef(defaultEmail);

  async function finish(orderNumber: string) {
    await clearCart();
    router.push(`/orders/${orderNumber}?e=${encodeURIComponent(emailRef.current)}&paid=1`);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    emailRef.current = email;
    const address = Object.fromEntries(FIELDS.map((f) => [f.name, String(fd.get(f.name) ?? "")]));

    let start: Start;
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, address, idempotencyKey: idem.current }),
      });
      start = await res.json();
      if (!res.ok) throw new Error(start.error ?? "Checkout failed.");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }

    if (start.provider === "mock") {
      setStatus("Simulating payment…");
      const r = await fetch("/api/mock/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerOrderId: start.providerOrderId }) });
      if (!r.ok) { setError("Mock payment failed."); setBusy(false); setStatus(null); return; }
      return finish(start.orderNumber);
    }

    if (!window.Razorpay || !start.keyId) {
      setError("The payment window failed to load. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const rzp = new window.Razorpay({
      key: start.keyId,
      amount: start.amountCents,
      currency: start.currency,
      order_id: start.providerOrderId,
      name: "Thread & Co.",
      description: `Order ${start.orderNumber}`,
      prefill: { name: String(fd.get("name") ?? defaultName), email, contact: String(address.phone) },
      theme: { color: "#1f3d2b" },
      modal: {
        ondismiss: () => { setBusy(false); setStatus(null); setError("Payment window closed. Your items are held for 30 minutes; press Pay to try again."); },
      },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setStatus("Confirming your payment…");
        const v = await fetch("/api/razorpay/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resp) });
        if (v.ok) return finish(start.orderNumber);
        const body = await v.json().catch(() => ({}));
        setBusy(false);
        setStatus(null);
        setError(`${body.error ?? "We could not confirm your payment."} If you were charged, it will be reconciled automatically; check Orders shortly.`);
      },
    });
    rzp.on("payment.failed", (r) => { setBusy(false); setStatus(null); setError(`Payment failed: ${r.error.description}. You can try again.`); });
    rzp.open();
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required defaultValue={defaultEmail} autoComplete="email" className={input} />
        </div>
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name} className="mb-1 block text-sm font-medium">{f.label}</label>
            <input
              id={f.name} name={f.name} required autoComplete={f.autoComplete} inputMode={f.inputMode}
              defaultValue={f.name === "name" ? defaultName : ""} className={input}
              {...(f.name === "phone" ? { pattern: "[6-9][0-9]{9}", title: "10-digit Indian mobile number" } : {})}
              {...(f.name === "pincode" ? { pattern: "[1-9][0-9]{5}", title: "6-digit PIN code" } : {})}
            />
          </div>
        ))}
        <div aria-live="assertive" className="space-y-2">
          {error && <Notice kind="error">{error}</Notice>}
          {status && <Notice>{status}</Notice>}
        </div>
        <button className={`${btn} w-full`} disabled={busy}>{busy ? "Please wait…" : `Pay ${totalLabel}`}</button>
        <p className="text-center text-xs text-muted">Secure payment by Razorpay (test mode: use Razorpay test cards or UPI).</p>
      </form>
    </>
  );
}
