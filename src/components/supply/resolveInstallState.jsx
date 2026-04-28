/**
 * resolveInstallState — Single source of truth for install readiness
 * 
 * CANONICAL FORMULA:
 *   available_to_install = (reserved_from_stock + covered_from_po) - qty_installed
 * 
 * This replaces ALL ad-hoc checks like:
 *   - reserved_from_stock > 0
 *   - stock > 0
 *   - covered_from_po > 0
 *   - available_to_install (backend, which may be stale)
 */

export function resolveInstallState(commitment) {
  if (!commitment) {
    return { available_to_install: 0, is_ready_to_install: false, is_fully_installed: false };
  }

  const reserved = commitment.reserved_from_stock ?? 0;
  const covered = commitment.covered_from_po ?? 0;
  const installed = commitment.qty_installed ?? 0;
  const required = commitment.required_total ?? 0;
  const removed = commitment.qty_removed ?? 0;
  const effectiveRequired = Math.max(0, required - removed);

  const available = Math.max(0, (reserved + covered) - installed);

  return {
    available_to_install: available,
    is_ready_to_install: available > 0,
    is_fully_installed: installed >= effectiveRequired && effectiveRequired > 0,
  };
}