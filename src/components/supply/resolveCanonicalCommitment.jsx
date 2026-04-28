/**
 * resolveCanonicalCommitment — DEPRECATED
 * 
 * Re-exports from the new canonical adapter for backward compatibility.
 * New code should import from commitmentModalAdapter.js directly.
 */
export { resolveCanonicalCommitment, normalizeCommitmentForModal, validateCommitmentForModal } from "./commitmentModalAdapter";

import { resolveCanonicalCommitment } from "./commitmentModalAdapter";

/**
 * createModalGuard — DEPRECATED
 * Use openModal pattern in PSM instead.
 */
export function createModalGuard(modalName, setter, enrichedCommitments) {
  return (incoming) => {
    const resolved = resolveCanonicalCommitment(incoming, enrichedCommitments);
    if (!resolved) {
      console.warn(`[ModalGuard:${modalName}] Rejected:`, incoming?.id || incoming?.commitment_id || incoming);
      return;
    }
    setter(resolved);
  };
}