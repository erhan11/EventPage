import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSimulatorPayload, verifySimulatorPayload } from "@/lib/payments/simulator";
import { createTicketToken, verifyTicketToken } from "@/lib/security/ticket-token";

const SECRET = "s".repeat(48);
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("ticket tokens", () => {
  it("round-trips", () => {
    expect(verifyTicketToken(createTicketToken(ID, SECRET), SECRET)).toBe(ID);
  });
  it("rejects wrong secret, swapped ids and malformed input", () => {
    const token = createTicketToken(ID, SECRET);
    expect(verifyTicketToken(token, "x".repeat(48))).toBeNull();
    const other = createTicketToken("00000000-0000-4000-8000-000000000000", SECRET);
    const [, idB] = other.split(".");
    const [p, , sigA] = token.split(".");
    expect(verifyTicketToken(`${p}.${idB}.${sigA}`, SECRET)).toBeNull();
    for (const bad of ["", "EP1", "EP2." + token.slice(4), token + ".x", "a".repeat(500)])
      expect(verifyTicketToken(bad, SECRET)).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("simulator webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded", orderId: ID, amountCents: 100, currency: "EUR", paymentId: "p" });
  it("accepts valid signatures", () => {
    expect(verifySimulatorPayload(body, signSimulatorPayload(body, SECRET), SECRET).id).toBe("evt_1");
  });
  it("rejects tampered bodies, wrong secrets and stale timestamps", () => {
    const sig = signSimulatorPayload(body, SECRET);
    expect(() => verifySimulatorPayload(body.replace("100", "1"), sig, SECRET)).toThrow();
    expect(() => verifySimulatorPayload(body, signSimulatorPayload(body, "other"), SECRET)).toThrow();
    const old = signSimulatorPayload(body, SECRET, Math.floor(Date.now() / 1000) - 3600);
    expect(() => verifySimulatorPayload(body, old, SECRET)).toThrow();
    expect(() => verifySimulatorPayload(body, null, SECRET)).toThrow();
  });
});
