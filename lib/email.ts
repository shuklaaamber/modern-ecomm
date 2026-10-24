import "server-only";
import { Resend } from "resend";
import { formatMoney } from "@/lib/money";
import { log } from "@/lib/logger";

type Receipt = {
  number: string;
  email: string;
  totalCents: number;
  currency: string;
  lines: { name: string; qty: number; unitPriceCents: number }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** EMAIL_TRANSPORT=resend sends via Resend; anything else prints to the server console. Never throws: a mail failure must not fail an order. */
export async function sendReceipt(r: Receipt) {
  const text = r.lines
    .map((l) => `${l.qty} x ${l.name} @ ${formatMoney(l.unitPriceCents, r.currency)}`)
    .join("\n") + `\nTotal: ${formatMoney(r.totalCents, r.currency)}`;
  const subject = `Receipt for order ${r.number}`;

  if (process.env.EMAIL_TRANSPORT !== "resend") {
    console.log(`[email:console] To: ${r.email}\nSubject: ${subject}\n${text}`);
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    log.error("email not sent: RESEND_API_KEY and EMAIL_FROM are required", { order: r.number });
    return;
  }
  const rows = r.lines
    .map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${esc(formatMoney(l.unitPriceCents, r.currency))}</td></tr>`)
    .join("");
  const html = `<h1>Thanks for your order</h1><p>Order <strong>${esc(r.number)}</strong></p><table cellpadding="6"><tr><th align="left">Item</th><th>Qty</th><th>Price</th></tr>${rows}</table><p><strong>Total: ${esc(formatMoney(r.totalCents, r.currency))}</strong></p>`;
  try {
    const { error } = await new Resend(key).emails.send({ from, to: r.email, subject, text, html }, { idempotencyKey: `receipt-${r.number}` });
    if (error) log.error("resend rejected receipt", { order: r.number, resend: error });
    else log.info("receipt sent", { order: r.number });
  } catch (err) {
    log.error("receipt send failed", { order: r.number, err });
  }
}
