/**
 * applyProjectCreditManual — RETIRED.
 *
 * The old handler applied credit without the billing lock or conditional updates (concurrent requests could spend the
 * same credit twice), never moved an invoice to paid, and left no per-receipt trail. Credit applications now go through
 * projectDepositAction (action 'apply', sources 'all' for non-deposit credit). Parts settlement stays in
 * applyProjectCreditToCommitments. This endpoint refuses every request and changes nothing.
 */
Deno.serve(() => Response.json({
  success: false,
  code: 'RETIRED',
  error: 'This credit tool has been replaced. Use Apply Available Deposit (projectDepositAction) on the invoice instead.',
}, { status: 410 }));