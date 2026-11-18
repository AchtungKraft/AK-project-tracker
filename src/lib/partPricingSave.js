import { base44 } from "@/api/base44Client";

// The retail value a part form should show/edit for its current mode.
// Manual shows only the manual price; matrix shows only the matrix price (no cross-mode fallback).
export const retailForMode = (f) => (f.pricing_mode === "manual" ? f.retail_override : f.retail_matrix_price);

// Switching to manual keeps the price the user was looking at, instead of silently saving $0.
export const applyPricingModeChange = (prev, mode) => ({
  ...prev,
  pricing_mode: mode,
  retail_override:
    mode === "manual" && !(prev.retail_override > 0) ? (prev.retail_matrix_price || null) : prev.retail_override,
});

// Canonical master pricing fields to persist. Matrix retail is computed by the server at save time
// (not the debounced preview), so a quick save can't store a missing matrix price.
export async function resolvePartPricingForSave({ pricing_mode, cost, retail_override, applied_markup_pct }) {
  if (pricing_mode === "manual") {
    if (!(Number(retail_override) > 0)) return { error: "Manual pricing needs a retail price above $0." };
    return { retail_override: Number(retail_override), retail_matrix_price: null, applied_markup_pct };
  }
  if (!(Number(cost) > 0)) return { retail_override: null, retail_matrix_price: null, applied_markup_pct: null };
  const res = await base44.functions.invoke("computeRetailFromMatrix", { cost: Number(cost) }).catch((e) => ({ data: { error: e?.response?.data?.message || e.message } }));
  if (!res.data?.success) return { error: `Could not calculate matrix retail: ${res.data?.message || res.data?.error || "unknown error"}` };
  return { retail_override: null, retail_matrix_price: res.data.retail_matrix_price, applied_markup_pct: res.data.applied_markup_pct };
}