import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "@/lib/orders";

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending", "paid")).toBe(true);
    expect(canTransition("paid", "fulfilled")).toBe(true);
    expect(canTransition("fulfilled", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("delivered", "pending")).toBe(false);
    expect(() => assertTransition("failed", "paid")).toThrow(/Illegal/);
  });
});
