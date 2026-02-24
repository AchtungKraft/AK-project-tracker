# Eligibility Integrity Audit Report
## Generated: 2026-02-24

---

# PHASE 1 — GATING CALL SITE DISCOVERY

## Invoice Eligibility Call Sites

| File | Function/Lines | Logic Used | Uses Derived? | Uses Legacy? | Risk |
|------|----------------|------------|---------------|--------------|------|
| `lifecycle/getAllowedCommitmentActions.js:158-171` | `getAllowedCommitmentActions()` | `remainingToBill = required_total - invoiced_qty > 0` | ✅ YES | ❌ NO | LOW |
| `financial/BillablePartsSelector.jsx:214-224` | Filter useMemo | `canInvoice && remainingToBillQty > 0` | ✅ YES | ❌ NO | LOW |
| `functions/getBillingAndProcurementStates.js:107-167` | `computeInvoiceEligibility()` | `remainingToBillQty > 0` only | ✅ YES | ❌ NO | LOW |
| `functions/createProjectInvoiceDraft.js:169-205` | Line validation | `billing_status`, `invoiced_qty`, blocks on ALREADY_INVOICED | ⚠️ MIXED | ⚠️ YES | **MEDIUM** |

### ⚠️ ISSUE: `createProjectInvoiceDraft.js` lines 169-190

**Problem**: Uses `billing_status` enum directly instead of derived `remaining_to_bill_qty`.

```javascript
// CURRENT (lines 169-190):
const billingStatus = normalizeBillingStatus(commitment.billing_status);
if (billingStatus === 'invoiced') { blockedLines.push(...) }
if (billingStatus === 'paid') { blockedLines.push(...) }
```

**Should be**:
```javascript
const remainingQty = Math.max(0, required - invoiced_qty);
if (remainingQty <= 0) { blockedLines.push({ reason: 'NO_OUTSTANDING' }) }
// REMOVE billing_status gating entirely
```

**Verdict**: The `billing_status` check at lines 172-190 is REDUNDANT with the `remainingQty` check at lines 192-206. Remove the `billing_status` gating.

---

## Install Eligibility Call Sites

| File | Function/Lines | Logic Used | Uses Derived? | Uses Legacy? | Risk |
|------|----------------|------------|---------------|--------------|------|
| `lifecycle/getAllowedCommitmentActions.js:129-140` | `getAllowedCommitmentActions()` | `uninstalled = reserved - installed > 0` | ✅ YES | ❌ NO | LOW |
| `pages/ProjectSupplyManager.jsx:395-400` | Install tab filter | `reserved > installed` only | ✅ YES | ❌ NO | LOW |
| `supply/PSMGroupedCards.jsx:364-369` | Install action | `reserved - installed` display | ✅ YES | ❌ NO | LOW |
| `functions/getProjectSupplyView.js:239` | `available_to_install` | `reserved + covered - installed` | ✅ YES | ❌ NO | LOW |

**Verdict**: Install eligibility is correctly implemented everywhere.

---

## Billing State Interpretation Sites

| File | Function/Lines | Field Used | Purpose | Risk |
|------|----------------|------------|---------|------|
| `getBillingAndProcurementStates.js:43-83` | `normalizeClientBillingStatus()` | `billing_status` | Normalize to enum | LOW |
| `getBillingAndProcurementStates.js:79-83` | `deriveBillingState()` | Normalized status | 3-state derivation | LOW |
| `getProjectSupplyView.js:151-158` | `normalizeBillingState()` | `billing_status` | 3-state for UI | LOW |
| `createProjectInvoiceDraft.js:26-32` | `normalizeBillingStatus()` | `billing_status` | Block logic | **MEDIUM** |

---

## Deprecated Field Usage Scan

| Field | Files Using | Status | Action |
|-------|-------------|--------|--------|
| `billing_state` | Used correctly as derived enum | OK | Keep |
| `is_fully_billed` | **NOT FOUND** in codebase | SAFE | N/A |
| `is_billable` | **NOT FOUND** in codebase | SAFE | N/A |
| `invoiceEligible` | **NOT FOUND** in codebase | SAFE | N/A |
| `readyToInvoice` | **NOT FOUND** in codebase | SAFE | N/A |
| `fully_installed` | **NOT FOUND** in codebase | SAFE | N/A |
| `installEligible` | **NOT FOUND** in codebase | SAFE | N/A |
| `paid_status` | **NOT FOUND** in codebase | SAFE | N/A |
| `balance_due` | ProjectInvoice only (correct) | OK | Keep |
| `has_been_invoiced` | **NOT FOUND** in codebase | SAFE | N/A |

---

# PHASE 2 — DATABASE FIELD AUDIT

## PartCommitment Entity Fields

| Field | Category | Used For Gating? | Safe? | Action |
|-------|----------|------------------|-------|--------|
| `required_total` | **Canonical** | YES (install, invoice) | ✅ | Keep |
| `reserved_from_stock` | **Canonical** | YES (install) | ✅ | Keep |
| `covered_from_po` | **Canonical** | NO | ✅ | Keep |
| `qty_installed` | **Canonical** | YES (install) | ✅ | Keep |
| `invoiced_qty` | **Canonical** | YES (invoice) | ✅ | Keep |
| `invoiced_amount` | **Canonical** | NO | ✅ | Keep |
| `billing_status` | **Derived** | ⚠️ YES (draft creation) | ⚠️ | **Stop reading for gating** |
| `billed_qty_total` | **Legacy** | NO | ⚠️ | **Mark deprecated** |
| `billed_amount_total` | **Legacy** | NO | ⚠️ | **Mark deprecated** |
| `qty_committed` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `qty_reserved` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `qty_to_order` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `qty_ordered` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `qty_received` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `qty_allocated` | **Deprecated** | NO | ⚠️ | Already deprecated |
| `commitment_status` | **Deprecated** | NO (lifecycle derived) | ⚠️ | Already deprecated |
| `coverage_status` | **Deprecated** | NO | ⚠️ | Already deprecated |

## ProjectInvoice Entity Fields

| Field | Category | Used For Gating? | Safe? | Action |
|-------|----------|------------------|-------|--------|
| `status` | **Canonical** | YES (payment flow) | ✅ | Keep |
| `subtotal` | **Canonical** | NO | ✅ | Keep |
| `total` | **Canonical** | NO | ✅ | Keep |
| `credit_applied` | **Canonical** | NO | ✅ | Keep |
| `balance_due` | **Canonical** | NO | ✅ | Keep |
| `paid_amount` | **Canonical** | NO | ✅ | Keep |
| `credit_preview` | **Deprecated** | NO | ⚠️ | **Remove** |

## ProjectInvoiceLine Entity Fields

| Field | Category | Used For Gating? | Safe? | Action |
|-------|----------|------------------|-------|--------|
| `part_commitment_id` | **Canonical** | YES (payment flow) | ✅ | Keep |
| `qty` | **Canonical** | YES (invoice aggregation) | ✅ | Keep |
| `line_total` | **Canonical** | YES (invoice aggregation) | ✅ | Keep |
| `unit_price` | **Canonical** | NO | ✅ | Keep |

## CreditAllocation Entity Fields

| Field | Category | Used For Gating? | Safe? | Action |
|-------|----------|------------------|-------|--------|
| `commitment_id` | **Canonical** | NO (aggregation only) | ✅ | Keep |
| `amount_applied` | **Canonical** | NO (aggregation only) | ✅ | Keep |
| `is_reversed` | **Canonical** | YES (excludes from sums) | ✅ | Keep |

---

# PHASE 3 — DERIVATION INTEGRITY CHECK

## Invoice Aggregation Rules

| Check | Status | Evidence |
|-------|--------|----------|
| `invoiced_qty` excludes cancelled invoices | ✅ PASS | `normalizeProjectCommitmentBilling.js:114-115` filters by `invoice.status !== 'cancelled'` |
| Draft invoices handled | ⚠️ AMBIGUOUS | Draft invoices ARE included in line sums. This may cause premature `invoiced_qty` inflation. |
| Credit does not reduce quantity | ✅ PASS | Credit is money, not qty. `derived_invoiced_qty` sums `line.qty`, not affected by credit. |
| Partial edits don't duplicate | ✅ PASS | Lines are immutable after creation. |
| Invoice deletion updates totals | ❌ **FAIL** | No cascade normalization on invoice delete. Must run `normalizeProjectCommitmentBilling`. |

### ⚠️ ISSUE: Draft Invoice Line Aggregation

**Problem**: When a draft invoice is created, `invoiced_qty` is immediately updated on commitments (lines 445-450 of `createProjectInvoiceDraft.js`). If the draft is later deleted or modified, the commitment `invoiced_qty` becomes stale.

**Fix**: Run `normalizeProjectCommitmentBilling` after any invoice cancellation/deletion, OR exclude draft invoice lines from aggregation.

---

## Example Drift Scenarios

| # | Scenario | Stored Value | Derived Value | Drift Type |
|---|----------|--------------|---------------|------------|
| 1 | Draft invoice created then deleted | `invoiced_qty=5` | `invoiced_qty=0` | **OVERCOUNT** |
| 2 | Invoice cancelled, commitment not updated | `billing_status='invoiced'` | `billing_status='unbilled'` | **STATUS_DRIFT** |
| 3 | Partial payment on invoice | `billing_status='invoiced'` | `billing_status='invoiced'` | OK (correct) |
| 4 | Credit applied post-creation | `billing_status='invoiced'` | `billing_status='paid'` (if credit covers) | **STATUS_DRIFT** |
| 5 | Over-invoiced (qty > required) | `invoiced_qty=10, required=5` | Invoice shows qty=10 | **OVERINVOICE** |

---

# PHASE 4 — CONFLICT MATRIX

| Scenario | Remaining Qty | Paid? | Credit Applied? | Install Stock? | Expected Invoice | Expected Install | Current Behavior | Correct? |
|----------|---------------|-------|-----------------|----------------|------------------|------------------|------------------|----------|
| Fresh commitment | 5 | NO | NO | YES (3 reserved) | ✅ YES | ✅ YES (3) | ✅ Eligible | ✅ |
| Fully invoiced, unpaid | 0 | NO | NO | YES (5 reserved) | ❌ NO | ✅ YES (5) | ✅ Correct | ✅ |
| Deposit paid, no parts | 5 | YES | Credit exists | NO | ✅ YES | ❌ NO | ✅ Correct | ✅ |
| Credit memo applied | 0 | NO | YES (full) | YES | ❌ NO | ✅ YES | ✅ Correct | ✅ |
| Void invoice | 5 (restored) | NO | Credit reversed | YES | ✅ YES | ✅ YES | ⚠️ Depends on normalization | ⚠️ |
| Over-invoiced | -2 | NO | NO | YES | ❌ NO (qty<=0) | ✅ YES | ✅ Blocked | ✅ |
| Partial install | 3 | NO | NO | YES (5 reserved, 2 installed) | ✅ YES (3) | ✅ YES (3) | ✅ Correct | ✅ |
| Reserved but not received | 5 | NO | NO | NO (covered_from_po=5) | ✅ YES | ❌ NO | ✅ Correct | ✅ |
| Received not reserved | 5 | NO | NO | NO (reserved=0) | ✅ YES | ❌ NO | ✅ Correct | ✅ |

---

# PHASE 5 — ROOT CAUSE IDENTIFICATION

## Q1: Are legacy DB flags influencing gating?

**ANSWER: PARTIALLY YES**

- `billing_status` enum IS read in `createProjectInvoiceDraft.js` to block already-invoiced items.
- This is REDUNDANT with `remainingQty > 0` check.
- If `billing_status` is stale (not normalized), it could incorrectly block valid items.

## Q2: Are derived values being bypassed?

**ANSWER: YES**

- `createProjectInvoiceDraft.js` reads stored `billing_status` instead of computing from invoice lines.
- If normalization hasn't run, stored values may conflict with truth.

## Q3: Is normalization relied upon instead of write-time enforcement?

**ANSWER: YES**

- Invoice creation updates commitment `invoiced_qty` and `billing_status` at write time (good).
- Invoice cancellation/deletion does NOT update commitments (bad).
- Payment flow DOES update `billing_status` to 'paid' (good).
- System relies on manual normalization to fix drift from cancellations.

## Q4: Are invoice statuses handled consistently?

**ANSWER: MOSTLY YES**

- `status: draft|sent|paid|cancelled` is well-defined.
- Cancelled invoices are excluded from aggregation.
- Draft invoices ARE included — this may be intentional (show pending invoice impact).

## Q5: Is any money state affecting quantity state?

**ANSWER: NO** ✅

- `canInvoice` depends on `remaining_to_bill_qty > 0` (quantity only).
- `canInstall` depends on `reserved > installed` (quantity only).
- `paid` status does not affect quantity eligibility.
- `credit` does not affect quantity eligibility.

---

## Root Cause Summary

1. **Redundant gating**: `createProjectInvoiceDraft.js` checks `billing_status` enum when it should only check `remaining_to_bill_qty > 0`.

2. **No cascade on delete**: Invoice cancellation does not trigger commitment normalization.

3. **Draft invoice inflation**: Draft invoices update `invoiced_qty` immediately, which inflates the count if draft is later abandoned.

---

# PHASE 6 — RECOMMENDED FIX STRATEGY

## Schema Changes

| Entity | Field | Action |
|--------|-------|--------|
| PartCommitment | `billed_qty_total` | Mark deprecated in schema comment |
| PartCommitment | `billed_amount_total` | Mark deprecated in schema comment |
| ProjectInvoice | `credit_preview` | Mark deprecated, stop reading |

## Logic Rewrites

### 1. Remove redundant `billing_status` gating in `createProjectInvoiceDraft.js`

**Before (lines 169-190)**:
```javascript
if (billingStatus === 'invoiced') { blockedLines.push(...) }
if (billingStatus === 'paid') { blockedLines.push(...) }
```

**After**:
```javascript
// REMOVE ENTIRELY - remainingQty check at line 192-206 is sufficient
// billing_status can be stale; remainingQty is always fresh
```

### 2. Add cascade normalization on invoice cancellation

In `cancelProjectInvoice.js`, add:
```javascript
// After cancelling invoice, normalize all linked commitments
for (const line of invoiceLines) {
  if (line.part_commitment_id) {
    await normalizeCommitmentBilling(line.part_commitment_id);
  }
}
```

### 3. Exclude draft invoices from invoiced_qty aggregation (OPTIONAL)

If drafts should not count as "invoiced":
- Update `normalizeProjectCommitmentBilling.js:114` to filter `status !== 'draft'`
- Update `createProjectInvoiceDraft.js` to NOT update `invoiced_qty` on commitment

## Migration Steps

1. **Deploy logic fix** to `createProjectInvoiceDraft.js` (remove billing_status gating)
2. **Deploy cascade** to `cancelProjectInvoice.js`
3. **Run bulk normalization** for all projects: `normalizeProjectCommitmentBilling({ project_id, dry_run: false })`
4. **Verify** via diagnostics panel

## Guardrails

Add these comments to critical files:

```javascript
// ============================================================================
// INVARIANT: Invoice eligibility depends ONLY on remaining_to_bill_qty > 0
// DO NOT gate on: billing_status, paid, credit, balance_due, install status
// ============================================================================
```

```javascript
// ============================================================================
// INVARIANT: Install eligibility depends ONLY on reserved_from_stock > qty_installed
// DO NOT gate on: billing_status, paid, credit, invoiced
// ============================================================================
```

---

# OUTPUT SUMMARY

## PASS/FAIL Summary

| Invariant | Status |
|-----------|--------|
| Invoice eligibility depends only on remaining qty | ⚠️ FAIL (redundant billing_status check exists) |
| Install eligibility depends only on inventory | ✅ PASS |
| Payment state never blocks quantity eligibility | ✅ PASS |
| No UI reads deprecated billing/install flags | ✅ PASS |
| Stored values always equal derived | ⚠️ FAIL (no cascade on cancel) |

## Fields to Delete/Deprecate

- `PartCommitment.billed_qty_total` — mark deprecated
- `PartCommitment.billed_amount_total` — mark deprecated
- `ProjectInvoice.credit_preview` — mark deprecated

## Files to Modify

1. **`functions/createProjectInvoiceDraft.js`** — Remove lines 169-190 (billing_status gating)
2. **`functions/cancelProjectInvoice.js`** — Add cascade normalization
3. **`entities/PartCommitment.json`** — Add deprecation comments
4. **`entities/ProjectInvoice.json`** — Add deprecation comments

## Critical Invariants

```
INVOICE_ELIGIBILITY: (required_total - invoiced_qty) > 0
INSTALL_ELIGIBILITY: (reserved_from_stock - qty_installed) > 0
BILLING_STATUS: derived from SUM(invoice_lines) NOT stored flag
``