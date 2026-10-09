import { base44 } from "@/api/base44Client";

// Parse a user-typed dollar string into integer cents without floating point. Returns null if invalid.
export function parseDollarsToCents(input) {
  const s = String(input ?? "").trim().replace(/[$,\s]/g, "");
  const m = s.match(/^(-)?(\d{1,10})(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) return "—";
  const neg = cents < 0, abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${neg ? "-" : ""}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

export async function retainerReviewAction(payload) {
  try {
    return (await base44.functions.invoke("retainerReviewAction", payload)).data;
  } catch (e) {
    throw new Error(e?.response?.data?.error || e.message);
  }
}

export async function retainerAction(payload) {
  try {
    return (await base44.functions.invoke("retainerAdminAction", payload)).data;
  } catch (e) {
    throw new Error(e?.response?.data?.error || e.message);
  }
}