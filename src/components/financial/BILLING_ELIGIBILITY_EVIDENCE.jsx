# Phase 0-7: Billing Eligibility Evidence Table & Fix Summary

## Phase 0: Gating Call Sites Identified

| File | Lines | Input Fields | Rule Logic | Source |
|------|-------|--------------|------------|--------|
| `lifecycle/getAllowedCommitmentActions.js` | 44-217 | `required_total`, `reserved_from_stock`, `covered_from_po`, `qty_installed`, `to_order`, `billing_status`, `invoiced_qty` | **Install**: `uninstalled > 0` (reserved - installed). **Invoice**: `remainingToBill > 0` (required - invoiced_qty) | Backend read model via props |
| `financial/BillablePartsSelector.jsx` | 198-227 | `billing_state`, `allowed.canInvoice`, `invoiced_qty`, `required_total` | Filter to `canInvoice === true && remainingToBillQty > 0` | `getBillingAndProcurementStates` |
| `financial/CreateProjectInvoiceModal.jsx` | 52-798 | Selection from `BillablePartsSelector` | Passes through selector eligibility | Via `BillablePartsSelector` |
| `pages/ProjectSupplyManager.jsx` | 391-400 | `reserved_from_stock`, `qty_installed` | **Install tab**: `reserved > installed` (inventory only) | `getProjectSupplyView` read model |
| `supply/PSMGroupedCards.jsx` | 364-369 | `allowed.canInstall`, `reserved_from_stock`, `qty_installed` | Install action shows `reserved - installed` available | Props from `ProjectSupplyManager` |
| `functions/getProjectSupplyView.js` | 419-422 | `invoiced_qty`, `invoiced_amount` from commitment | Exposes to read model for UI consumption | PartCommitment entity |
| `functions/getBillingAndProcurementStates.js` | 98-173, 447-458 | `remainingToBillQty`, `billingState`, `financialRole` | `computeInvoiceEligibility()` gates on remaining qty only | PartCommitment + ProjectInvoiceLine |

## Phase 1: Ground Truth Commitment Financial Facts

Created `functions/normalizeProjectCommitmentBilling.js`:

**Canonical Sources:**
- `ProjectInvoiceLine` (by `part_commitment_id`) → invoiced_qty, invoiced_amount
- `ProjectInvoice` (status, paid_amount) → payment ratio
- `CreditAllocation` (by `commitment_id`) → credit applied

**Computed Per Commitment:**
```
derived_invoiced_qty      = SUM(invoice_lines.qty)
derived_invoiced_amount   = SUM(invoice_lines.line_total)
derived_credit_applied    = SUM(credit_allocations.amount_applied)
derived_paid_amount       = SUM(line_total * paid_ratio)
derived_balance_due       = invoiced_amount - credit - paid
derived_is_invoiced       = invoiced_amount > 0
derived_is_paid           = is_invoiced && balance_due <= 0
derived_billing_status    = paid | invoiced | unbilled
```

**Supply Facts:**
```
required_qty         = commitment.required_total
installed_qty        = commitment.qty_installed
available_to_allocate = Part.physical_stock - global_reserved
installable_qty      = reserved_from_stock - installed_qty
remaining_to_bill_qty = required_qty - derived_invoiced_qty
```

## Phase 2: Install Eligibility Fix

**BEFORE (Buggy):**
- Install gated by `billing_status` in some paths
- Conflated billing state with inventory availability

**AFTER (Fixed):**
```javascript
// getAllowedCommitmentActions.js lines 129-140
// Install eligibility depends ONLY on inventory state
// - reserved_from_stock > qty_installed
// - Does NOT depend on: billing_status, payment status, credit
if (uninstalled > 0) {
  actions.canInstall = true;
  actions.installableQty = uninstalled;
}
```

```javascript
// ProjectSupplyManager.jsx lines 395-400
case 'install':
  // PHASE 7: Items with in-stock parts that can be installed
  // Install eligibility depends ONLY on inventory
  filtered = filtered.filter(c => {
    const reservedProject = c.reserved_from_stock ?? 0;
    const installed = c.qty_installed ?? 0;
    return reservedProject > installed;
  });
```

## Phase 3: Invoice Eligibility Fix

**BEFORE (Buggy):**
- Gated on `billing_state === 'NOT_INVOICED'` (blocked partial rebilling)
- Blocked items that were "INVOICED" but had remaining qty

**AFTER (Fixed):**
```javascript
// getBillingAndProcurementStates.js lines 98-155
// Invoice eligibility depends ONLY on remaining_to_bill
// DOES NOT GATE ON: "in stock", "installed", "paid", "credit", "balance_due"
function computeInvoiceEligibility({
  remainingToBillQty = null,
  ...
}) {
  const hasRemainingToBill = remainingToBillQty !== null 
    ? remainingToBillQty > 0 
    : outstandingAmount > 0;
  
  if (!hasRemainingToBill) {
    return { canInvoice: false, block_reason_code: 'NO_OUTSTANDING' };
  }
  return { canInvoice: true };
}
```

```javascript
// BillablePartsSelector.jsx lines 198-227
const invoiceableItems = commitments.filter(c => {
  const canInvoice = c.allowed?.canInvoice ?? true;
  const requiredQty = c.required_total ?? c.assigned_qty ?? 0;
  const invoicedQty = c.invoiced_qty ?? 0;
  const remainingToBillQty = Math.max(0, requiredQty - invoicedQty);
  return canInvoice && remainingToBillQty > 0;
});
```

## Phase 4: Normalization Function

`normalizeProjectCommitmentBilling(project_id, { dry_run })`

Updates PartCommitment fields:
- `invoiced_qty`
- `invoiced_amount`
- `billing_status` (unbilled/invoiced/paid)

Does NOT touch:
- Invoices
- Credit ledger
- Credit allocations
- Payments

Returns:
- counts: { total, drifted, updated }
- drift_report[]
- sample_before_after[]

## Phase 5: Read Model Fields Confirmed

`getProjectSupplyView` includes:
- `required_total` ✓
- `qty_installed` ✓
- `reserved_from_stock` (for installable_qty) ✓
- `available_to_install` ✓
- `invoiced_qty` ✓ (lines 419-422)
- `invoiced_amount` ✓
- `billing_status` ✓
- `billing_state` ✓

## Phase 6: UI Diagnostics Panel

Created `CommitmentBillingDiagnostics.jsx`:
- Shows per-commitment: part_name, required/installed, available/installable
- Compares stored vs derived: invoiced_qty, invoiced_amount, billing_status
- Highlights drift rows with red border
- Offers "Fix N Drifts" button to run normalization

Integrated into `ProjectSupplyManager.jsx` at line 57 import, line 736 render.

## Phase 7: Test Matrix

| Scenario | Expected Install | Expected Invoice | Paid Badge |
|----------|------------------|------------------|------------|
| In-stock, not installed, unbilled | ✅ installable (reserved > 0) | ✅ invoiceable (remaining > 0) | ❌ false |
| In-stock, partially installed | ✅ installable (reserved > installed) | ✅ invoiceable (remaining > 0) | ❌ false |
| Fully invoiced but unpaid | ✅ installable (if stock) | ❌ remaining=0 | ❌ false |
| Fully invoiced and paid (payment) | ✅ installable (if stock) | ❌ remaining=0 | ✅ true |
| Fully invoiced and paid (credit) | ✅ installable (if stock) | ❌ remaining=0 | ✅ true |
| Partially invoiced | ✅ installable (if stock) | ✅ invoiceable (remaining > 0) | ❌ false |

## Files Changed

1. `components/lifecycle/getAllowedCommitmentActions.js` - Install/Invoice rules
2. `components/financial/BillablePartsSelector.jsx` - Invoice selection filter
3. `functions/getProjectSupplyView.js` - Expose invoiced_qty/amount
4. `functions/getBillingAndProcurementStates.js` - Invoice eligibility logic
5. `pages/ProjectSupplyManager.jsx` - Install tab filter, diagnostics panel
6. `components/supply/PSMGroupedCards.jsx` - Install action display
7. `functions/normalizeProjectCommitmentBilling.js` - NEW: Normalization
8. `components/financial/CommitmentBillingDiagnostics.jsx` - NEW: Diagnostics panel