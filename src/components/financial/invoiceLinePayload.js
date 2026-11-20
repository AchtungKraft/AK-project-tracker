// Builds the server payload for one selected billable item (Create Invoice and Add Lines share it).
// Part lines carry a price only when an administrator overrides it; otherwise the server uses the canonical
// selling price. Labor and service prices always come from the server.
export function toInvoiceLine(item) {
  const line = {
    type: item.type || "part",
    source_entity: item.source_entity,
    source_id: item.source_id,
    description: item.description || item.part_name || "Item",
    qty: item.qty ?? 1,
  };
  if (item.type === "labor") line.labor_basis = item.labor_basis || "earned";
  if (item.type === "part") {
    if (item.part_basis) line.part_basis = item.part_basis;
    if (item.price_override) {
      line.unit_price = item.unit_price;
      line.price_override = { reason: item.price_override.reason, below_cost_approved: !!item.price_override.below_cost_approved };
    }
  }
  if (item.type === "service" && item.children?.length) line.expanded_lines = item.children;
  return line;
}