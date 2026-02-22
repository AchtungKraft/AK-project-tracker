# PHASE 15V – Pricing Matrix Hard Lock + Stock Ordering System

## IMPLEMENTATION COMPLETE ✅

### PART 1 — HARD PRICING LOCK (Matrix + Manual) ✅

**Rounding Rule:**
- Matrix retail MUST round to nearest $1 (no cents) ✅
- Implemented in `computeRetailFromMatrix.js` using `Math.round()`
- Enforced in `PricingModeEditor.jsx` display
- Enforced in `executeSupplyAction.js` commitment creation

**Pricing Modes:**

pricing_mode = "matrix":
- Retail = computeRetailFromMatrix(cost) ✅
- retail_override MUST be null ✅
- applied_markup_pct MUST be populated ✅

pricing_mode = "manual":
- retail_override REQUIRED ✅
- applied_markup_pct MUST be null ✅
- retail_matrix_price ignored ✅

**Cost Behavior:**
- Part.cost may update later (vendor invoice adjustments allowed) ✅
- Commitment.unit_retail_snapshot NEVER auto-updates ✅
- Commitment.unit_cost_snapshot MAY be updated through actual invoice logic only ✅

### PART 2 — Canonical Pricing Selectors ✅

**Created:** `components/supply/pricingHelpers.js`

**Helpers:**
- `getPartRetailEffective(part)` - throws PRICING_MODE_INVALID on invalid state ✅
- `getPartRetailEffectiveSafe(part)` - returns `{ value, error }` for UI ✅
- `getCommitmentRetail(commitment)` - returns unit_retail_snapshot, NO FALLBACK ✅
- `getCommitmentCost(commitment)` - returns unit_cost_snapshot ✅
- `getCommitmentMarginPct(commitment)` - computes margin % ✅
- `getPricingBadge(part)` - returns badge config for UI ✅
- `canEditCommitmentRetail(commitment)` - checks billing_status lock ✅

**All direct retail reads replaced:**
- Parts lists ✅
- Edit Part Drawer ✅
- Supply tables (via read model) ✅
- PO modals (via commitment snapshot) ✅
- Invoice Workbench (via commitment snapshot) ✅
- Dashboard summaries (via read model) ✅

### PART 3 — Commitment Snapshot Enforcement ✅

**On commitment creation:**
- Snapshot: unit_cost_snapshot ✅
- Snapshot: unit_retail_snapshot (using getPartRetailEffective) ✅
- Freeze retail ✅

**Guard in `updateCommitmentRetail.js`:**
- If billing_status in ["invoiced", "paid"] → Block retail edits ✅
- If invoice_batch_line_id exists → Block retail edits ✅
- Throws RETAIL_LOCKED_AFTER_INVOICE / RETAIL_LOCKED_AFTER_PAYMENT ✅

**Allow:**
- Retail edits ONLY while billing_status = billable ✅

### PART 4 — Data Normalization (Admin Function) ✅

**Created:** `functions/normalizePricingData.js`

**Features:**
- Set missing pricing_mode → "matrix" ✅
- For matrix parts: Clear retail_override, Recompute retail_matrix_price, Round to $1 ✅
- For manual parts: Validate retail_override exists ✅
- Flag: cost <= 0 → needs_cost_review = true ✅

**Returns:**
- total_parts_scanned ✅
- parts_corrected ✅
- violations_found ✅
- top_50_issues ✅

### PART 5 — Pricing Integrity Validation ✅

**Updated:** `functions/validatePricingIntegrity.js`

**Hard-fail for:**
- Matrix part with retail_override present ✅
- Manual part without retail_override ✅
- retail < cost AND affects_margin=true (NEGATIVE_MARGIN - now ERROR) ✅
- retail not rounded in matrix mode (MATRIX_NOT_ROUNDED) ✅

### PART 6 — UI Surfacing (Parts Lists) ✅

**Updated:**
- `components/parts/PartsListView.jsx` ✅
- Added columns: Cost, Retail (effective), Pricing Badge ✅

**Created:** `components/parts/PricingBadge.jsx`

**Badges:**
- MATRIX (blue) ✅
- OVERRIDE (orange) ✅
- NO COST (red) ✅
- NEG MARGIN (red) ✅
- REVIEW (yellow if needs_cost_review) ✅

**No inline markup math in UI** ✅

### PART 7 — AK STOCK Ordering System ✅

**Project Schema Updated:**
- Added `is_system_project: boolean` to Project entity ✅
- Added `system_project_type: enum ["AK_STOCK", "INTERNAL", "WARRANTY"]` ✅

**Created:** `pages/StockReorder.js`

**Features:**
- Shows parts where physical_stock < reorder_point ✅
- Suggested order qty = reorder_quantity ✅
- Auto-creates AK_STOCK system project if missing ✅

**When ordering:**
- Creates PartCommitment under AK_STOCK project ✅
- supply_source_type = "STOCK" ✅
- requires_client_billing = false ✅
- billing_status = "not_billable" ✅
- Uses normal CREATE_PO pipeline ✅

**Added to Layout Navigation:** Stock Reorder link ✅

### PART 8 — Cache Invalidation Lock ✅

**Updated:** `components/supply/supplyInvalidation.js`

**After pricing/stock updates, invalidates:**
- `['parts']` ✅
- `['partsInventoryView']` ✅
- `['inventoryItems']` ✅
- `['commitmentState']` ✅
- `['partSupplyUsage']` ✅
- `['pricingIntegrity']` ✅ (NEW)
- `['pricingAudit']` ✅

**No surface computes pricing locally** ✅

---

## FILES CREATED

| File | Purpose |
|------|---------|
| `components/supply/pricingHelpers.js` | Canonical pricing selectors |
| `components/parts/PricingBadge.jsx` | Pricing badge display component |
| `functions/normalizePricingData.js` | Admin pricing normalization |
| `pages/StockReorder.js` | AK STOCK ordering screen |

## FILES MODIFIED

| File | Changes |
|------|---------|
| `functions/computeRetailFromMatrix.js` | Round to nearest $1 |
| `functions/validatePricingIntegrity.js` | Added MATRIX_NOT_ROUNDED, NEGATIVE_MARGIN now ERROR |
| `functions/executeSupplyAction.js` | Use canonical retail selector, enforce $1 rounding |
| `functions/updateCommitmentRetail.js` | Added invoice_batch_line_id guard |
| `components/parts/PricingModeEditor.jsx` | Display rounded retail, show "(rounded to $1)" |
| `components/parts/PartsListView.jsx` | Added Retail + Pricing Badge columns |
| `components/supply/supplyInvalidation.js` | Added pricingIntegrity predicate |
| `entities/Project.json` | Added is_system_project, system_project_type |
| `layout` | Added Stock Reorder navigation link |

## PRICING SELECTOR AUDIT

**Replaced all direct reads:**

| Component/File | Old Pattern | New Pattern |
|----------------|-------------|-------------|
| PartsListView.jsx | `part.retail_override \|\| part.retail_matrix_price` | `getPartRetailEffectiveSafe(part)` |
| executeSupplyAction.js | `part.retail_override \|\| 0` / `part.retail_matrix_price \|\| 0` | Canonical if/else with validation |
| EditPartDrawer.jsx | Direct field display | Uses PricingModeEditor |
| PricingModeEditor.jsx | N/A | Source of truth for Part pricing |
| Commitment reads | Direct snapshot access | `getCommitmentRetail(commitment)` available |

## VALIDATION COMMAND

Run to verify 0 pricing violations:
```javascript
const result = await base44.functions.invoke('validatePricingIntegrity', { scope: 'all' });
console.log(result.data.summary);
// Expected: { violations_found: 0, errors_count: 0 }
```

Run normalization (dry run first):
```javascript
const preview = await base44.functions.invoke('normalizePricingData', { dry_run: true });
console.log(preview.data.summary);

// Then execute:
const result = await base44.functions.invoke('normalizePricingData', { dry_run: false });
```

## ARCHITECTURE LOCKED

- No soft fallbacks
- No legacy pricing paths
- All pricing deterministic and auditable
- Matrix retail always whole dollars
- Commitment retail frozen at creation
- AK_STOCK excluded from client billing