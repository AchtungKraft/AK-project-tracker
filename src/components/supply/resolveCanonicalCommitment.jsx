/**
 * resolveCanonicalCommitment — PHASE DATA CONTRACT
 *
 * Resolves an incoming commitment reference (which may be partial/minimal
 * from diagnostic panels, coverage diagnostics, blocked-item resolution, etc.)
 * into the fully enriched canonical commitment from ProjectSupplyManager's
 * enrichedCommitments array.
 *
 * This is the ONLY allowed entry point for opening modals.
 * All modal setters MUST go through this resolver.
 *
 * Returns null if no canonical match is found — callers must guard.
 */
export function resolveCanonicalCommitment(incoming, enrichedCommitments) {
  if (!incoming || !enrichedCommitments?.length) return null;

  const incomingId = incoming.id || incoming.commitment_id;
  if (!incomingId) return null;

  return enrichedCommitments.find(c =>
    c.id === incomingId || c.commitment_id === incomingId
  ) || null;
}

/**
 * createModalGuard — Factory for guarded modal setters.
 *
 * Usage in PSM:
 *   const guardedSetReceiveModal = createModalGuard('receiveModal', setReceiveModal, enrichedCommitments);
 *   // then pass guardedSetReceiveModal as onReceive callback
 */
export function createModalGuard(modalName, setter, enrichedCommitments) {
  return (incoming) => {
    const resolved = resolveCanonicalCommitment(incoming, enrichedCommitments);
    if (!resolved) {
      console.warn(`[ModalGuard:${modalName}] Rejected non-canonical commitment:`, incoming?.id || incoming?.commitment_id || incoming);
      return;
    }
    setter(resolved);
  };
}