/**
 * resolveDefaultVendor — Canonical default vendor resolution for procurement.
 *
 * Precedence:
 *   1. Explicit selectedVendorContext override (user picked vendor from Vendor Queue)
 *   2. Active preferred PartVendorSource (is_preferred=true) from vendorSourcesByPart
 *   3. Any active PartVendorSource (first by sort_order) from vendorSourcesByPart
 *   4. Item-embedded vendor_sources from the read model (is_preferred first, then first)
 *   5. Fallback to item.vendor_id / item.vendor?.id (commitment-level stale vendor)
 *
 * Returns: { vendor_id, vendor_name, source_id, unit_cost, order_url, vendor_part_number }
 *          or null if nothing can be resolved.
 */
export default function resolveDefaultVendor(item, selectedVendorContext, vendorSourcesByPart) {
  // ── 1. Explicit vendor context override ─────────────────────────────
  if (selectedVendorContext?.vendor_id) {
    const ctxVid = selectedVendorContext.vendor_id;

    // Check if this vendor has a configured source for this part
    const overrideSources = vendorSourcesByPart?.[item.part_id] || [];
    const match = overrideSources.find(s => s.vendor_id === ctxVid && s.is_active !== false);
    if (match) {
      return {
        vendor_id: ctxVid,
        vendor_name: selectedVendorContext.vendor_name || match.vendor_name || null,
        source_id: match.id || null,
        unit_cost: match.unit_cost ?? 0,
        order_url: match.order_url || null,
        vendor_part_number: match.vendor_part_number || null,
      };
    }

    // Also check item-embedded vendor_sources
    const embeddedMatch = (item.vendor_sources || []).find(s => s.vendor_id === ctxVid);
    if (embeddedMatch) {
      return {
        vendor_id: ctxVid,
        vendor_name: selectedVendorContext.vendor_name || embeddedMatch.vendor_name || null,
        source_id: embeddedMatch.source_id || embeddedMatch.id || null,
        unit_cost: embeddedMatch.unit_cost ?? 0,
        order_url: embeddedMatch.order_url || null,
        vendor_part_number: embeddedMatch.vendor_part_number || null,
      };
    }

    // Context vendor doesn't have a source, but user explicitly chose it — honour it
    return {
      vendor_id: ctxVid,
      vendor_name: selectedVendorContext.vendor_name || null,
      source_id: null,
      unit_cost: item.resolved_unit_cost ?? item.unit_cost ?? 0,
      order_url: null,
      vendor_part_number: null,
    };
  }

  // ── 2+3. PartVendorSource from vendorSourcesByPart ──────────────────
  const externalSources = vendorSourcesByPart?.[item.part_id] || [];
  if (externalSources.length > 0) {
    const activeSources = externalSources.filter(s => s.is_active !== false);
    if (activeSources.length > 0) {
      // Prefer is_preferred, then lowest sort_order
      const preferred = activeSources.find(s => s.is_preferred);
      const best = preferred || activeSources.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
      return {
        vendor_id: best.vendor_id,
        vendor_name: best.vendor_name || null,
        source_id: best.id || null,
        unit_cost: best.unit_cost ?? 0,
        order_url: best.order_url || null,
        vendor_part_number: best.vendor_part_number || null,
      };
    }
  }

  // ── 4. Item-embedded vendor_sources from read model ─────────────────
  const embeddedSources = item.vendor_sources || [];
  if (embeddedSources.length > 0) {
    const preferred = embeddedSources.find(s => s.is_preferred);
    const best = preferred || embeddedSources[0];
    return {
      vendor_id: best.vendor_id,
      vendor_name: best.vendor_name || null,
      source_id: best.source_id || best.id || null,
      unit_cost: best.unit_cost ?? 0,
      order_url: best.order_url || null,
      vendor_part_number: best.vendor_part_number || null,
    };
  }

  // ── 5. Fallback to item-level commitment vendor ─────────────────────
  const fallbackVid = item.vendor_id || item.vendor?.id;
  if (fallbackVid) {
    return {
      vendor_id: fallbackVid,
      vendor_name: item.vendor_name || item.vendor?.vendor_name || null,
      source_id: null,
      unit_cost: item.resolved_unit_cost ?? item.unit_cost ?? 0,
      order_url: item.order_url || null,
      vendor_part_number: item.vendor_part_number || item.part?.vendor_part_number || null,
    };
  }

  return null;
}