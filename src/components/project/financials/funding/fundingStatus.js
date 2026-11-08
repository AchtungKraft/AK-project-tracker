// "Need funding before ordering" — based ONLY on the explicit admin funding target and
// deposit payments actually received (canonical invoices). No target → "not set", never a false $0.
export function fundingStatus(plan, fa) {
  const target = plan?.funding_target_cents ?? null;
  const received = Math.round((fa?.by_type?.deposit?.received || 0) * 100);
  const deposit = fa?.by_type?.deposit || {};
  const pending = { drafted: deposit.draft_count || 0, sent_unpaid: Math.max((deposit.live_count || 0) - (deposit.paid_count || 0), 0) };
  if (target == null) return { state: "not_set", target: null, received, short: null, pending };
  if (received >= target) return { state: "funded", target, received, short: 0, pending };
  return { state: "need_funding", target, received, short: target - received, pending };
}

// {known, unknown} + {known, unknown}
export const addAcc = (a, b) => ({ known: Math.round(((a?.known || 0) + (b?.known || 0)) * 100) / 100, unknown: (a?.unknown || 0) + (b?.unknown || 0) });