# PHASE 15V.2 — Pricing Lock + Invoice Actuals + Retail Adjustment Requests

## IMPLEMENTATION COMPLETE ✅

### 0) Canonical Rules Enforced

| Rule | Implementation | Location |
|------|---------------|----------|
| Matrix retail rounds to nearest $1 | `Math.round()` applied | `computeRetailFromMatrix.js`, `executeSupplyAction.js` |
| Commitment retail frozen at creation | `unit_retail_snapshot` set once | `executeSupplyAction.js:adjustRequired()` |
| Cost can update from invoices | `applyInvoiceActualsToCommitment.js` | New canonical service |
| Manual mode = override retail only | `updatePartPricing.js` validates | Pricing service |
| Installable qty = reserved - installed | `reserved_from_stock - qty_installed` | Supply resolvers |

---

### 1) Pricing Write-Path Audit

**Canonical Services (ONLY allowed write paths):**

| Field(s) | Canonical Service | Location |
|----------|------------------|----------|
| `Part.retail_matrix_price`, `Part.applied_markup_pct` | `updatePartPricing()` | `functions/updatePartPricing.js` |
| `Part.retail_override`, `Part.pricing_mode` | `updatePartPricing()` | `functions/updatePartPricing.js` |
| `Part.cost`, `Part.cost_source`, `Part.is_cost_verified` | `applyInvoiceActualsToCommitment()` | `functions/applyInvoiceActualsToCommitment.js` |
| `PartCommitment.unit_retail_snapshot` | `executeSupplyAction:adjustRequired()` (create only) OR `updateCommitmentRetail()` | `functions/executeSupplyAction.js`, `functions/updateCommitmentRetail.js` |
| `PartCommitment.actual_unit_cost`, `actual_extended_cost`, `margin_pct` | `applyInvoiceActualsToCommitment()` | `functions/applyInvoiceActualsToCommitment.js` |

**Mutation Sites Removed/Refactored:**

| File | Line | Change |
|------|------|--------|
| `functions/executeSupplyAction.js` | 239-254 | Verified pricing snapshot at creation uses canonical selector |
| `functions/executeSupplyAction.js` | 379-398 | Verified retail_effective follows pricing_mode |
| `components/parts/EditPartDrawer.jsx` | 138-162 | Uses `updatePartPricing()` mutation |
| `components/parts/PricingModeEditor.jsx` | All | Read-only display, no direct writes |
| `functions/normalizePricingData.js` | All | Admin-only, uses `asServiceRole` |

**Direct Write Prevention:**
- All Part pricing fields marked SERVICE ONLY in entity schema
- Commitment pricing snapshots marked FROZEN in schema comments
- UI components use mutations that invoke canonical services

---

### 2) Invoice Actuals Application

**New Function:** `functions/applyInvoiceActualsToCommitment.js`

**Inputs:**
- `commitment_id` (required)
- `actual_unit_cost` (required)
- `invoice_id`, `vendor_id`, `received_date`, `notes` (optional)

**Behavior:**
1. Fetches commitment + part
2. Updates commitment:
   - `actual_unit_cost = input`
   - `actual_extended_cost = actual_unit_cost * required_total`
   - Recomputes `margin_pct` against frozen `unit_retail_snapshot`
   - Sets `pricing_integrity_status` based on margin
3. Updates part:
   - `Part.cost = actual_unit_cost`
   - `cost_source = "invoice"`
   - `is_cost_verified = true`
   - `last_cost_update_at/by` set
4. **NEVER modifies:**
   - `unit_retail_snapshot`
   - `retail_override`
   - `retail_matrix_price`

---

### 3) Negative Margin Policy

**Auto-Creation of RetailAdjustmentRequest:**

When `actual_unit_cost > unit_retail_snapshot`:
1. Creates `RetailAdjustmentRequest` with:
   - `reason_code = "COST_INCREASE_FROM_INVOICE"`
   - `status = "OPEN"`
   - `suggested_retail` computed from matrix (rounded to $1)
2. Sets commitment:
   - `pricing_integrity_status = "margin_negative"`
   - `integrity_warning = true`
   - `invoice_blocked_reason = "OPEN_ADJUSTMENT_REQUEST"`
   - `retail_adjustment_request_id` = new request ID

**Invoice Blocking:**
- `getInvoiceReadyItems.js` updated to check:
  - `retail_adjustment_request_id` + `!invoice_override_approved`
  - `invoice_blocked_reason` != null + `!invoice_override_approved`
  - `pricing_integrity_status === 'margin_negative'`

**Override Path:** `resolveRetailAdjustmentRequest.js`

Actions:
- `APPROVE_RETAIL_CHANGE`: Updates commitment retail (pre-invoice only)
- `WAIVE_INVOICE`: Sets `invoice_override_approved = true`, unblocks invoice
- `CLOSE_NO_ACTION`: Closes request without changes

---

### 4) Pricing Integrity Status

**Standardized Statuses:**

| Status | Meaning | UI Badge |
|--------|---------|----------|
| `ok` | All pricing valid | Green |
| `overridden_retail` | Manual mode or retail changed | Orange |
| `missing_cost` | Cost <= 0 | Yellow |
| `missing_retail` | No retail snapshot | Red |
| `margin_negative` | Actual cost > frozen retail | Red (triggers request) |
| `estimated_cost` | Cost not yet verified | Blue |
| `cost_retail_mismatch` | Inconsistent state | Yellow |

**Validation Updates (`validatePricingIntegrity.js`):**
- ✅ Matrix rounding check (nearest $1)
- ✅ Negative margin now ERROR severity
- ✅ Actual cost vs retail check
- ✅ Missing adjustment request check

---

### 5) Commitment Retail Edit Rules

**Guard Logic (`updateCommitmentRetail.js`):**

Retail editable ONLY when:
- `billing_status === "billable"`
- `billing_status !== "invoiced"`
- `billing_status !== "paid"`
- `invoice_batch_line_id` is null

On edit:
- Updates `unit_retail_snapshot`
- Recomputes `planned_retail_total`
- Sets `pricing_integrity_status = "overridden_retail"`
- Emits `RETAIL_OVERRIDE` lifecycle event

---

### 6) UI Requirements

**Part Edit Modal (`EditPartDrawer.jsx`, `PricingModeEditor.jsx`):**
- ✅ Cost + cost_source + last update displayed
- ✅ Pricing mode toggle: Matrix/Manual
- ✅ Matrix retail read-only when manual
- ✅ Override retail enabled only when manual
- ✅ Effective retail + badge

**Parts List Views (`PartsListView.jsx`):**
- ✅ Cost, Retail columns
- ✅ PricingBadge (MATRIX/OVERRIDE/NO COST/NEG MARGIN/REVIEW)

**Commitment Views (`PricingBadge.jsx`):**
- ✅ `CommitmentPricingBadge` component
- ✅ Shows frozen retail + integrity status
- ✅ "OPEN REQUEST" badge for pending adjustment requests

---

### 7) Data Normalization

**Function:** `normalizePricingData.js`

**Part Normalization:**
- Sets `pricing_mode = 'matrix'` if missing
- Clears `retail_override` for matrix parts
- Recomputes `retail_matrix_price` rounded to $1
- Sets `applied_markup_pct` from tier
- Flags `needs_cost_review` if cost <= 0

**Commitment Backfill (new in V.2):**
- Backfills missing `unit_retail_snapshot` from current part effective retail
- Backfills missing `unit_cost_snapshot` from part cost
- Does NOT overwrite existing snapshots

**Usage:**
```js
// Dry run (preview)
await base44.functions.invoke('normalizePricingData', { dry_run: true });

// Apply changes
await base44.functions.invoke('normalizePricingData', { dry_run: false });
```

---

### 8) New Entities/Fields

**New Entity: `RetailAdjustmentRequest`**
- `commitment_id`, `project_id`, `part_id`
- `old_retail`, `actual_unit_cost`, `suggested_retail`
- `reason_code`, `status`, `resolution_action`
- `resolved_by`, `resolved_at`, `override_reason`

**New PartCommitment Fields:**
- `retail_adjustment_request_id`
- `invoice_blocked_reason` (enum)
- `invoice_override_approved` (boolean)
- `invoice_override_reason`, `invoice_override_by`, `invoice_override_at`

---

### 9) New Functions

| Function | Purpose |
|----------|---------|
| `applyInvoiceActualsToCommitment` | Apply vendor invoice cost to commitment + part |
| `resolveRetailAdjustmentRequest` | Manager action to resolve negative margin requests |

---

### 10) Remaining Warnings / Migration Actions

**Pre-Production Checklist:**

1. **Run pricing normalization:**
   ```js
   // Verify first
   await base44.functions.invoke('normalizePricingData', { dry_run: true });
   // Then apply
   await base44.functions.invoke('normalizePricingData', { dry_run: false });
   ```

2. **Run pricing integrity validation:**
   ```js
   await base44.functions.invoke('validatePricingIntegrity', { scope: 'all' });
   ```

3. **Review existing negative margins:**
   - Query commitments with `pricing_integrity_status = 'margin_negative'`
   - Create RetailAdjustmentRequests for any that need resolution

4. **Verify invoice readiness:**
   - Run `getInvoiceReadyItems` and review `not_ready` items
   - Resolve any blocked by adjustment requests

---

### Test Coverage

| Test Case | Location | Status |
|-----------|----------|--------|
| Invoice actuals update Part.cost | `applyInvoiceActualsToCommitment` | ✅ |
| Invoice actuals do NOT change retail | `applyInvoiceActualsToCommitment` | ✅ |
| Negative margin creates request | `applyInvoiceActualsToCommitment` | ✅ |
| Negative margin blocks invoicing | `getInvoiceReadyItems` | ✅ |
| Commitment retail edit blocked after invoice | `updateCommitmentRetail` | ✅ |
| Matrix retail rounded to $1 | `computeRetailFromMatrix` | ✅ |
| Override path works | `resolveRetailAdjustmentRequest` | ✅ |

---

## Summary

Phase 15V.2 implements:
1. **Hard pricing locks** - Matrix retail always rounded, commitment retail frozen
2. **Invoice actuals flow** - Canonical path for cost updates that preserves retail
3. **Negative margin protection** - Auto-creates adjustment requests, blocks invoicing
4. **Manager override path** - Approve retail change or waive invoice block
5. **Complete audit trail** - All pricing changes emit lifecycle events