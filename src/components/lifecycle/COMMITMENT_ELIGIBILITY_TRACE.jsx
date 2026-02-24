# Commitment Eligibility Trace — Electric Air Conditioning

**Date**: 2026-02-24  
**Commitment ID**: `699d18287e3d0b91beb0d6f0`  
**Part ID**: `691b33440244c2156b796384`  
**Project ID**: `69176d6e3888297089966a36`

---

## PHASE 1: Commitment Data Snapshot

| Field | Value |
|-------|-------|
| required_total | 1.0 |
| reserved_from_stock | 1.0 |
| covered_from_po | 0.0 |
| qty_installed | 0.0 |
| invoiced_qty | 0.0 |
| qty_to_order | 0.0 ✅ |
| available_to_install (derived) | 1.0 |
| commitment_status | planned |
| billing_status | unbilled |
| requires_prepay | false |

## Part Data Snapshot

| Field | Value |
|-------|-------|
| requires_client_billing | ✅ true |
| affects_inventory | ✅ true |
| physical_stock | 1.0 |

---

## PHASE 2: Reservation Flow Verification

### Rebalance Test Output

```json
{
  "success": true,
  "part_id": "691b33440244c2156b796384",
  "physical_stock": 1,
  "commitments_scanned": 1,
  "commitments_updated": 0,  // Already correctly allocated
  "remaining_stock_after": 0,
  "updates": []
}
```

**Stock is correctly reserved!** The commitment has:
- `reserved_from_stock = 1.0` (matches `physical_stock`)
- `qty_to_order = 0.0` (no PO needed)

### Auto-Reserve Rule Applied

```
CANONICAL INVARIANT:
remaining_required = required_total - qty_installed = 1.0 - 0.0 = 1.0
reserved_from_stock (1.0) + covered_from_po (0.0) + qty_to_order (0.0) = 1.0 ✅
```

---

## PHASE 3: PO Prevention Verification

### getAllowedCommitmentActions.js Update

```javascript
// CANONICAL: CREATE PO - depends ONLY on to_order > 0
// PHASE 3 FIX: If reserved_from_stock can cover the remaining need, don't suggest PO
const needsFromStock = Math.max(0, effectiveRequired - qty_installed - effectiveOnOrder);
// needsFromStock = max(0, 1.0 - 0.0 - 0.0) = 1.0

const stockCanCover = effectiveReserved >= needsFromStock;
// stockCanCover = 1.0 >= 1.0 = true

if (unorderedQty > 0 && !stockCanCover) {
  actions.canCreatePO = true;  // Will NOT be set (unorderedQty=0 anyway)
}
```

**Result**: `canCreatePO = false` ✅ — No phantom PO offered

---

## PHASE 4: Eligibility Verification

### Install Eligibility

```javascript
const uninstalled = Math.max(0, effectiveReserved - qty_installed);
// uninstalled = max(0, 1.0 - 0.0) = 1.0

if (uninstalled > 0) {
  actions.canInstall = true;  // ✅ TRUE
  actions.installableQty = 1;
}
```

**Result**: `canInstall = true` ✅

### Invoice Eligibility

```javascript
const remainingToBill = Math.max(0, effectiveRequired - commitmentInvoicedQty);
// remainingToBill = max(0, 1.0 - 0.0) = 1.0

if (remainingToBill > 0) {
  actions.canCreateInvoice = true;  // ✅ TRUE
}
```

**Result**: `canCreateInvoice = true` ✅

### Next Action

Since `to_order = 0` and `reserved_from_stock (1) > qty_installed (0)`:
- `next_action = INSTALL` ✅

---

## PHASE 5: Hard Guardrail Added

### rebalancePartReservations.js Guardrail

```javascript
// PHASE 5: HARD GUARDRAIL — STOCK_AVAILABLE_NOT_RESERVED
// If physical_stock > 0 AND to_order > 0 AND reserved_from_stock === 0
// This indicates a bug in the allocation algorithm
for (const u of updates) {
  if (physical_stock > 0 && u.new_to_order > 0 && u.new_reserved === 0 && u.remaining_required > 0) {
    violations.push({
      commitment_id: u.commitment_id,
      violation: 'STOCK_AVAILABLE_NOT_RESERVED',
      message: `Stock exists (${physical_stock}) but commitment needs order with zero reservation.`,
      ...
    });
  }
}
```

This throws `REBALANCE_INVARIANT_VIOLATION` if stock exists but isn't auto-reserved.

---

## Summary Table

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `reserved_from_stock` | 1.0 | 1.0 | ✅ PASS |
| `qty_to_order` | 0.0 | 0.0 | ✅ PASS |
| `canInstall` | true | true | ✅ PASS |
| `canCreateInvoice` | true | true | ✅ PASS |
| `canCreatePO` | false | false | ✅ PASS |
| `next_action` | INSTALL | INSTALL | ✅ PASS |

---

## Fixes Applied

1. **rebalancePartReservations.js**: Added `STOCK_AVAILABLE_NOT_RESERVED` hard guardrail
2. **getAllowedCommitmentActions.js**: `canCreatePO` now checks if stock can cover need before suggesting PO
3. **PSMGroupedCards.jsx**: Fixed `canInvoice` → `canCreateInvoice` field reference

---

## Expected Outcome (After Fix)

✅ Stock parts auto-reserve  
✅ No phantom "Need to Order"  
✅ Install always works when stock exists  
✅ Invoice never depends on allocation  
✅ CREATE_PO only fires when true shortage exists