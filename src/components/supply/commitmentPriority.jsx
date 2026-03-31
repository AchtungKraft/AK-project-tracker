/**
 * commitmentPriority.js — CANONICAL priority scoring and action reasoning
 * 
 * All logic derives from canonical commitment fields ONLY:
 * - required_total, reserved_from_stock, covered_from_po, qty_installed
 * - Project.target_completion for deadline proximity
 * - Part.cost / planned_retail_total for value weighting
 * 
 * Priority levels: HIGH (≥70), MEDIUM (40-69), LOW (<40)
 * Score range: 0-100
 */

/**
 * Compute a priority score (0-100) for a commitment.
 * 
 * @param {Object} commitment - Canonical commitment + joined project/part data
 * @returns {{ score: number, level: 'HIGH'|'MEDIUM'|'LOW', factors: string[] }}
 */
export function computeCommitmentPriority(commitment) {
  if (!commitment) return { score: 0, level: 'LOW', factors: [] };
  
  const factors = [];
  let score = 0;

  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const gap = Math.max(0, rt - rfs - cfp);

  // ── Factor 1: Deadline proximity (0-35 pts) ──
  const targetDate = commitment.project_target_completion || commitment.project?.target_completion;
  if (targetDate) {
    const daysUntil = Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) {
      score += 35;
      factors.push('Project overdue');
    } else if (daysUntil <= 7) {
      score += 30;
      factors.push('Due within 7 days');
    } else if (daysUntil <= 14) {
      score += 20;
      factors.push('Due within 2 weeks');
    } else if (daysUntil <= 30) {
      score += 10;
      factors.push('Due within 30 days');
    }
  }

  // ── Factor 2: Supply gap blocking installation (0-30 pts) ──
  if (gap > 0 && qi === 0) {
    // Nothing installed yet AND has a gap — fully blocking
    score += 30;
    factors.push('Blocking installation — no stock or PO');
  } else if (gap > 0 && qi < rt) {
    // Partially installed but still has gap
    score += 20;
    factors.push('Partial gap blocking completion');
  } else if (rfs > qi && rfs > 0) {
    // Stock reserved but not installed — ready to progress
    score += 15;
    factors.push('Ready to install');
  }

  // ── Factor 3: Value/importance (0-20 pts) ──
  const retailTotal = commitment.planned_retail_total ?? 0;
  if (retailTotal >= 5000) {
    score += 20;
    factors.push('High-value part (≥$5K)');
  } else if (retailTotal >= 1000) {
    score += 12;
    factors.push('Medium-value part (≥$1K)');
  } else if (retailTotal >= 250) {
    score += 5;
  }

  // ── Factor 4: Integrity/risk flags (0-15 pts) ──
  if (commitment.integrity_warning) {
    score += 15;
    factors.push('Data integrity warning');
  }
  if (gap > 0 && cfp === 0 && rfs === 0) {
    // No coverage at all — completely uncovered
    score += 10;
    factors.push('No stock and no PO coverage');
  }

  // Clamp
  score = Math.min(100, Math.max(0, score));

  const level = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  return { score, level, factors };
}

/**
 * Get a human-readable explanation for the next action based on canonical state.
 * These reasons map directly to the resolveNextAction output.
 * 
 * @param {Object} commitment
 * @returns {string} Explanation text
 */
export function getActionExplanation(commitment) {
  if (!commitment) return '';

  const status = commitment.commitment_status;
  if (status === 'cancelled') return 'This commitment has been cancelled.';
  if (status === 'closed') return 'This commitment is closed — no further action needed.';

  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const gap = Math.max(0, rt - rfs - cfp);
  const installable = Math.max(0, rfs - qi);

  if (qi >= rt && rt > 0) return 'All parts installed — commitment complete.';

  if (installable > 0)
    return `Ready to Install — ${installable} unit${installable > 1 ? 's' : ''} reserved in stock and available for installation.`;

  if (cfp > 0 && rfs === 0)
    return `Waiting on Receiving — ${cfp} unit${cfp > 1 ? 's' : ''} ordered but not yet delivered.`;

  if (gap > 0) {
    const inv = commitment.inventory_snapshot || {};
    const avail = inv.available_global_active ?? inv.available ?? 0;
    if (avail > 0)
      return `Needs Allocation — ${Math.min(gap, avail)} unit${Math.min(gap, avail) > 1 ? 's' : ''} available in stock but not yet reserved.`;
    return `Needs Ordering — ${gap} unit${gap > 1 ? 's' : ''} have no stock available and no PO coverage.`;
  }

  if (rfs > 0 || cfp > 0) return 'Waiting on Receiving — items ordered and awaiting delivery.';

  return 'No action needed.';
}

/**
 * Determine if a commitment is blocked or at risk.
 * 
 * @param {Object} commitment
 * @returns {{ isBlocked: boolean, isAtRisk: boolean, reasons: string[] }}
 */
export function getBlockerStatus(commitment) {
  if (!commitment) return { isBlocked: false, isAtRisk: false, reasons: [] };

  const reasons = [];
  let isBlocked = false;
  let isAtRisk = false;

  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const gap = Math.max(0, rt - rfs - cfp);
  const status = commitment.commitment_status;

  if (status === 'cancelled' || status === 'closed') return { isBlocked: false, isAtRisk: false, reasons: [] };
  if (qi >= rt && rt > 0) return { isBlocked: false, isAtRisk: false, reasons: [] };

  // Blocked: no coverage at all and nothing installed
  if (gap > 0 && cfp === 0 && rfs === 0 && qi === 0) {
    isBlocked = true;
    reasons.push('No stock and no PO coverage');
  }

  // At risk: project deadline approaching with incomplete supply
  const targetDate = commitment.project_target_completion || commitment.project?.target_completion;
  if (targetDate) {
    const daysUntil = Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0 && qi < rt) {
      isBlocked = true;
      reasons.push('Project overdue');
    } else if (daysUntil <= 7 && gap > 0) {
      isAtRisk = true;
      reasons.push('Due in ≤7 days with supply gap');
    }
  }

  // Integrity warning
  if (commitment.integrity_warning) {
    isAtRisk = true;
    reasons.push('Data integrity issue detected');
  }

  return { isBlocked, isAtRisk, reasons };
}

/**
 * Priority badge configuration for UI rendering
 */
export const PRIORITY_CONFIG = {
  HIGH: { label: 'High', color: 'bg-red-900/40 text-red-400 border-red-700/50' },
  MEDIUM: { label: 'Med', color: 'bg-amber-900/40 text-amber-400 border-amber-700/50' },
  LOW: { label: 'Low', color: 'bg-gray-800/40 text-gray-500 border-gray-700/50' },
};

/**
 * Sort commitments by priority score (descending)
 */
export function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const pa = computeCommitmentPriority(a);
    const pb = computeCommitmentPriority(b);
    return pb.score - pa.score;
  });
}