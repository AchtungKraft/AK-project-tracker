/**
 * CANONICAL INVENTORY RESOLVER
 * 
 * Single source of truth for inventory calculations across all supply views.
 * 
 * PHASE 1-7 COMPLIANCE:
 * - All views MUST use this resolver
 * - NO local inventory calculations allowed
 * - "Reserved" = global reserved across ALL commitments for a part
 * - "Needed" = commitment.required_total - commitment.qty_installed
 * - "In Stock" = part.physical_stock (from Part entity)
 * - "Available" = physical_stock - global_reserved
 * 
 * CANONICAL FIELDS:
 * - physical_stock: Actual inventory count (Part.physical_stock)
 * - reserved_global: SUM(reserved_from_stock) across ALL active commitments for this part
 * - available: physical_stock - reserved_global
 * - on_order: SUM(covered_from_po - qty_received) across ALL active commitments
 * 
 * COMMITMENT-SCOPED FIELDS:
 * - reserved_this_commitment: commitment.reserved_from_stock
 * - needed_this_commitment: commitment.required_total - commitment.qty_installed
 * - remaining_to_fulfill: commitment.required_total - commitment.reserved_from_stock - commitment.covered_from_po
 */

/**
 * Build a part-level inventory map from all commitments
 * 
 * PHASE 5/7: Use null for unresolved values, not zero
 * 
 * @param {Array} parts - All Part entities
 * @param {Array} commitments - All PartCommitment entities (active only)
 * @returns {Map} partId -> { physical_stock, reserved_global, available, on_order }
 */
export function buildPartInventoryMap(parts, commitments) {
  const map = new Map();
  
  // PHASE 7: Check if data is loaded
  if (!parts || parts.length === 0) {
    return map; // Return empty map, caller must check
  }
  
  // Initialize with part data
  for (const part of parts) {
    // PHASE 5: Use null fallback for unresolved, preserve explicit zeros
    const physicalStock = part.physical_stock;
    map.set(part.id, {
      physical_stock: physicalStock !== undefined ? physicalStock : null,
      reserved_global: 0,
      on_order_global: 0,
      to_order_global: 0,
      available: physicalStock !== undefined ? physicalStock : null,
    });
  }
  
  // Aggregate commitment-level reservations
  for (const c of commitments) {
    if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') {
      continue;
    }
    
    const inv = map.get(c.part_id);
    if (!inv) continue;
    
    const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
    const covered_po = c.covered_from_po ?? c.qty_ordered ?? 0;
    const required = c.required_total ?? c.qty_committed ?? 0;
    const to_order = Math.max(0, required - reserved - covered_po);
    
    inv.reserved_global += reserved;
    inv.on_order_global += covered_po;
    inv.to_order_global += to_order;
  }
  
  // Calculate available after aggregation
  for (const [partId, inv] of map.entries()) {
    inv.available = Math.max(0, inv.physical_stock - inv.reserved_global);
  }
  
  return map;
}

/**
 * Resolve inventory for a single commitment using the global part inventory map
 * 
 * This is the CANONICAL resolver that all UI components MUST use.
 * 
 * PHASE 7: Returns null values when inventory map not loaded
 * 
 * @param {Object} commitment - The commitment to resolve
 * @param {Map} partInventoryMap - Pre-computed part inventory map
 * @returns {Object|null} Resolved inventory state, or null if map not loaded
 */
export function resolveInventoryForCommitment(commitment, partInventoryMap) {
  // PHASE 7: Guard against unloaded inventory
  if (!partInventoryMap || partInventoryMap.size === 0) {
    return null;
  }
  
  const partInv = partInventoryMap.get(commitment.part_id);
  
  // PHASE 7: If part not in map, return null (don't fabricate zeros)
  if (!partInv) {
    return null;
  }
  
  // Commitment-scoped values
  const reserved_this = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
  const covered_po = commitment.covered_from_po ?? commitment.qty_ordered ?? 0;
  const required = commitment.required_total ?? commitment.qty_committed ?? 0;
  const installed = commitment.qty_installed ?? 0;
  
  // CANONICAL: "Needed" = what's left to fulfill
  const needed = Math.max(0, required - installed);
  
  // CANONICAL: "To Order" = what's not yet covered
  const to_order = Math.max(0, required - reserved_this - covered_po);
  
  return {
    // Part-level (global)
    physical_stock: partInv.physical_stock,
    reserved_global: partInv.reserved_global,
    available_global: partInv.available,
    on_order_global: partInv.on_order_global,
    to_order_global: partInv.to_order_global,
    
    // Commitment-scoped
    reserved_this_commitment: reserved_this,
    covered_from_po: covered_po,
    qty_installed: installed,
    required_total: required,
    
    // Derived
    needed: needed,  // CANONICAL: what remains to fulfill for THIS commitment
    to_order: to_order,
    available_to_install: Math.max(0, reserved_this + covered_po - installed),
    
    // For display: "In Stock" = part physical stock, "Reserved" = global reserved
    display: {
      in_stock: partInv.physical_stock,
      reserved: partInv.reserved_global,
      available: partInv.available,
      needed: needed,
    }
  };
}

/**
 * DEV MODE: Validate inventory consistency between PSM and Part Modal
 * 
 * Call this in development to detect mismatches.
 * Logs warnings if PSM values differ from canonical values.
 * 
 * @param {string} source - Component name (e.g., 'ProjectSupplyManager')
 * @param {string} partId - Part ID being checked
 * @param {Object} displayed - Values currently displayed in UI
 * @param {Object} canonical - Values from canonical resolver
 */
export function validateInventoryConsistency(source, partId, displayed, canonical) {
  if (process.env.NODE_ENV !== 'development') return;
  
  const mismatches = [];
  
  if (displayed.in_stock !== canonical.physical_stock) {
    mismatches.push(`in_stock: displayed=${displayed.in_stock}, canonical=${canonical.physical_stock}`);
  }
  if (displayed.reserved !== canonical.reserved_global) {
    mismatches.push(`reserved: displayed=${displayed.reserved}, canonical=${canonical.reserved_global}`);
  }
  if (displayed.available !== canonical.available_global) {
    mismatches.push(`available: displayed=${displayed.available}, canonical=${canonical.available_global}`);
  }
  
  if (mismatches.length > 0) {
    console.warn(
      `[INVENTORY MISMATCH] ${source} part_id=${partId}:`,
      mismatches.join(', ')
    );
  }
}

/**
 * Enrich commitment view model with canonical inventory data
 * 
 * Use this when mapping raw commitments to view models.
 * 
 * @param {Object} commitment - Raw commitment data
 * @param {Object} part - Part entity
 * @param {Map} partInventoryMap - Pre-computed part inventory map
 * @returns {Object} Enriched commitment with canonical inventory
 */
export function enrichCommitmentWithInventory(commitment, part, partInventoryMap) {
  const resolved = resolveInventoryForCommitment(commitment, partInventoryMap);
  
  return {
    ...commitment,
    // Override inventory fields with canonical values
    inventory_snapshot: {
      physical: resolved.physical_stock,
      physical_stock: resolved.physical_stock,
      reserved: resolved.reserved_global,
      reserved_total: resolved.reserved_global,
      available: resolved.available_global,
      on_order: resolved.on_order_global,
      to_order: resolved.to_order_global,
    },
    // Canonical display values
    _canonical: {
      in_stock: resolved.display.in_stock,
      reserved: resolved.display.reserved,
      available: resolved.display.available,
      needed: resolved.display.needed,
    },
  };
}