"use client";
import { useState, useTransition } from "react";
import { adjustStock, createProduct, createPromo, setProductStatus, updateOrderStatus } from "@/app/actions/admin";
import type { OrderStatus } from "@/lib/orders";
import { btn, btnGhost, input, Notice } from "@/components/ui";

export function StockAdjuster({ variantId, label }: { variantId: number; label: string }) {
  const [delta, setDelta] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => { const r = await adjustStock(variantId, Number(delta)); setErr(r.ok ? null : r.error); if (r.ok) setDelta(""); });
      }}
    >
      <label className="sr-only" htmlFor={`d-${variantId}`}>Change stock for {label}</label>
      <input id={`d-${variantId}`} value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+5 / -2" inputMode="numeric" className={`${input} w-24`} />
      <button className={btnGhost} disabled={pending || !delta}>Apply</button>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </form>
  );
}

export function ArchiveButton({ productId, status }: { productId: number; status: string }) {
  const [pending, start] = useTransition();
  const next = status === "active" ? "archived" : "active";
  return (
    <button className={btnGhost} disabled={pending} onClick={() => start(async () => { await setProductStatus(productId, next); })}>
      {status === "active" ? "Archive" : "Restore"}
    </button>
  );
}

export function OrderStatusSelect({ orderId, current, options }: { orderId: number; current: string; options: OrderStatus[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`s-${orderId}`}>Set status</label>
      <select id={`s-${orderId}`} defaultValue="" disabled={pending} className={`${input} w-36`}
        onChange={(e) => { const v = e.target.value as OrderStatus; if (v) start(async () => { const r = await updateOrderStatus(orderId, v); setErr(r.ok ? null : r.error); }); }}>
        <option value="" disabled>{current.replace("_", " ")}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function NewProductForm({ categories }: { categories: { id: number; name: string }[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await createProduct({
            name: String(fd.get("name")), categoryId: Number(fd.get("categoryId")),
            price: Number(fd.get("price")), stock: Number(fd.get("stock")), description: String(fd.get("description") ?? ""),
          });
          setMsg({ ok: r.ok, t: r.ok ? (r.message ?? "Created") : r.error });
          if (r.ok) form.reset();
        });
      }}
    >
      <h2 className="font-semibold sm:col-span-2">Add a product</h2>
      <label className="text-sm">Name<input name="name" required className={`${input} mt-1`} /></label>
      <label className="text-sm">Category
        <select name="categoryId" className={`${input} mt-1`}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label className="text-sm">Price (₹)<input name="price" type="number" step="0.01" min="1" required className={`${input} mt-1`} /></label>
      <label className="text-sm">Opening stock<input name="stock" type="number" min="0" defaultValue={10} required className={`${input} mt-1`} /></label>
      <label className="text-sm sm:col-span-2">Description<textarea name="description" rows={2} className={`${input} mt-1`} /></label>
      <div className="sm:col-span-2"><button className={btn} disabled={pending}>{pending ? "Saving…" : "Create product"}</button></div>
      <div aria-live="polite" className="sm:col-span-2">{msg && <Notice kind={msg.ok ? "success" : "error"}>{msg.t}</Notice>}</div>
    </form>
  );
}

export function NewPromoForm() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const max = String(fd.get("max") ?? "");
        start(async () => {
          const r = await createPromo({
            code: String(fd.get("code")), type: fd.get("type") as "percent" | "fixed" | "free_shipping",
            value: Number(fd.get("value") || 0), minSubtotal: Number(fd.get("min") || 0), maxRedemptions: max ? Number(max) : null,
          });
          setMsg({ ok: r.ok, t: r.ok ? (r.message ?? "Created") : r.error });
          if (r.ok) form.reset();
        });
      }}
    >
      <h2 className="font-semibold sm:col-span-2">New promo code</h2>
      <label className="text-sm">Code<input name="code" required className={`${input} mt-1 uppercase`} /></label>
      <label className="text-sm">Type
        <select name="type" className={`${input} mt-1`}>
          <option value="percent">Percent off</option><option value="fixed">Fixed ₹ off</option><option value="free_shipping">Free shipping</option>
        </select>
      </label>
      <label className="text-sm">Value (% or ₹)<input name="value" type="number" step="0.01" min="0" className={`${input} mt-1`} /></label>
      <label className="text-sm">Minimum subtotal (₹)<input name="min" type="number" step="0.01" min="0" className={`${input} mt-1`} /></label>
      <label className="text-sm">Max redemptions (blank = unlimited)<input name="max" type="number" min="1" className={`${input} mt-1`} /></label>
      <div className="self-end"><button className={btn} disabled={pending}>Create</button></div>
      <div aria-live="polite" className="sm:col-span-2">{msg && <Notice kind={msg.ok ? "success" : "error"}>{msg.t}</Notice>}</div>
    </form>
  );
}
