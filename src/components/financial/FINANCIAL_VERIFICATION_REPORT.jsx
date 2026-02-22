# FINANCIAL VERIFICATION REPORT
## Forward Financial Model Integrity + Drift Lock (billing_status)

**Generated:** 2026-02-22  
**Status:** PHASE 1 AUDIT COMPLETE + PHASE 2 HARDENING REQUIRED

---

## PHASE 1 — DATA AUDIT RESULTS

### 1) Billing Status Distribution

| Status Value | Count | Category |
|-------------|-------|----------|
| `unbilled` | 47+ | ✅ CANONICAL |
| `invoiced` | 0 | ✅ CANONICAL |
| `paid` | 0 | ✅ CANONICAL |
| `billable` | 0* | ⚠️ LEGACY (migrated) |
| `not_billable` | TBD | ⚠️ LEGACY |
| `not_invoiced` | 0 | ⚠️ LEGACY |
| `awaiting_pay` | 0 | ⚠️ LEGACY |
| `null/undefined` | 0* | ⚠️ MISSING |

**Notes:**
- Migration function `migrateCommitmentBillingStatus` was executed on 2026-02-22
- 17 commitments migrated from `billable` → `unbilled`
- All sampled commitments now show `billing_status: 'unbilled'`

**Schema Mismatch Found:**
- Current schema enum: `["not_billable", "billable", "invoiced", "paid"]`
- Required canonical enum: `["unbilled", "invoiced", "paid"]`
- ⚠️ **ACTION REQUIRED:** Update schema to enforce canonical values

---

### 2) Invoice Read Model Audit

**File:** `components/financial/useProjectInvoiceView.js`

**Retail Totals Source:** ✅ CORRECT
```javascript
// Line 264-266
const unitRetail = c.unit_retail_snapshot ?? c.unit_retail ?? 0;
const unitCost = c.unit_cost_snapshot ?? c.unit_cost ?? 0;
const requiredTotal = c.required_total ?? 1;
```

**Findings:**
- ✅ Uses `unit_retail_snapshot` (frozen at commitment time)
- ✅ Falls back to `unit_retail` (commitment field)
- ✅ Does NOT read `Part.retail`, `Part.retail_matrix_price`, or `Part.retail_override`
- ✅ Canonical billing status normalization implemented in `normalizeCommitmentBillingStatus()`

**Status Normalization Logic (Lines 62-92):**
```javascript
// Maps legacy → canonical:
// - null, '', 'billable', 'not_invoiced' → UNBILLED
// - 'awaiting_pay', 'awaiting_payment', 'sent' → INVOICED
// - 'paid', 'client_paid' → PAID
```

---

### 3) UI Leakage Audit

#### ForwardInvoiceDashboard.jsx

| Field | Used? | Violation? |
|-------|-------|------------|
| commitment_status | ❌ NO | ✅ Clean |
| coverage_status | ❌ NO | ✅ Clean |
| reserved_from_stock | ❌ NO | ✅ Clean |
| qty_to_order | ❌ NO | ✅ Clean |
| qty_installed | ❌ NO | ✅ Clean |
| billing_status | ✅ YES | ✅ Allowed |
| unit_retail_snapshot | ✅ YES | ✅ Allowed |
| required_total | ✅ YES | ✅ Allowed |

**Result:** ✅ NO LIFECYCLE LEAKAGE

#### InvoiceWorkbench.jsx

| Field | Used? | Violation? |
|-------|-------|------------|
| commitment_status | ❌ NO | ✅ Clean |
| coverage_status | ❌ NO | ✅ Clean |
| inventory fields | ❌ NO | ✅ Clean |
| billing_status | ✅ YES | ✅ Allowed |

**Result:** ✅ NO LIFECYCLE LEAKAGE

---

### 4) Write Path Search (Drift Sources)

| File | Function/Location | Context | Status |
|------|-------------------|---------|--------|
| `functions/executeSupplyAction.js` | `adjustRequired` L279 | Creates commitment with `billing_status: 'billable'` | ⚠️ **LEGACY VALUE** |
| `functions/executeSupplyAction.js` | Supply actions | Does NOT modify billing_status | ✅ SAFE |
| `functions/createInvoiceBatch.js` | Invoice creation | Does NOT write billing_status directly | ✅ SAFE |
| `functions/updatePaymentStatus.js` | `mark_paid` L137-139 | Writes `billing_status: 'paid'` for legacy projects only | ⚠️ **CONDITIONAL** |
| `functions/updatePaymentStatus.js` | Forward model L136 | Skips commitment writes, uses InvoiceBatch.status | ✅ SAFE |
| `functions/migrateCommitmentBillingStatus.js` | Migration | One-time migration tool | ✅ ALLOWED |
| `functions/normalizeLegacyBillingFlags.js` | Normalization L123 | Writes `billing_status ?? 'billable'` | ⚠️ **LEGACY VALUE** |

**Critical Drift Sources:**
1. **executeSupplyAction.js L279:** Creates new commitments with `billing_status: 'billable'` instead of `'unbilled'`
2. **normalizeLegacyBillingFlags.js L123:** Preserves legacy values instead of normalizing

---

## PHASE 2 — HARDENING CHANGES REQUIRED

### 5) Schema Enforcement ❌ NOT YET DONE

Current schema allows: `["not_billable", "billable", "invoiced", "paid"]`
Required schema: `["unbilled", "invoiced", "paid"]`

### 6) Centralize Billing Status Transitions ❌ NOT YET DONE

Need to create: `components/financial/billingStatusTransitions.js`
- `setUnbilled(commitment_id)`
- `setInvoiced(commitment_id, invoice_batch_id)`
- `setPaid(commitment_id, invoice_batch_id)`

### 7) Guardrails on Supply Flows ⚠️ PARTIAL

- executeSupplyAction: Does NOT modify billing_status on existing commitments ✅
- BUT creates new commitments with `billing_status: 'billable'` ❌

### 8) Legacy Value Normalization ✅ DONE

Migration function exists and was executed successfully.

### 9) Dev Mode Drift Warning ❌ NOT YET DONE

Need to add warning in useProjectInvoiceView.

---

## ACTION ITEMS

1. **Update PartCommitment schema** - Change enum to `["unbilled", "invoiced", "paid"]`, default `"unbilled"`
2. **Fix executeSupplyAction.js L279** - Change `billing_status: 'billable'` to `billing_status: 'unbilled'`
3. **Fix normalizeLegacyBillingFlags.js L123** - Change fallback from `'billable'` to `'unbilled'`
4. **Create billingStatusTransitions.js** - Centralized billing mutation helper
5. **Add dev warning** - Console warn for non-canonical billing_status values

---

## VERIFICATION CHECKLIST

- [ ] Schema enum enforced: `["unbilled", "invoiced", "paid"]`
- [ ] All new commitments created with `billing_status: 'unbilled'`
- [ ] No legacy values remain in database
- [ ] Only invoice workflows can change billing_status
- [ ] UI shows only 3 buckets: Unbilled / Invoiced / Paid