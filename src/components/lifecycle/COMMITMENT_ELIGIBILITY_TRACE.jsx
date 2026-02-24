# Commitment Eligibility Trace — Electric Air Conditioning

**Date**: 2026-02-24  
**Commitment ID**: `699d18287e3d0b91beb0d6f0`  
**Part ID**: `691b33440244c2156b796384`  
**Project ID**: `69176d6e3888297089966a36`

---

## Commitment Data Snapshot

| Field | Value |
|-------|-------|
| required_total | 1.0 |
| reserved_from_stock | 1.0 |
| covered_from_po | 0.0 |
| qty_installed | 0.0 |
| invoiced_qty | 0.0 |
| to_order (derived) | 0.0 |
| available_to_install (derived) | 1.0 |
| commitment_status | planned |
| billing_status | unbilled |
| requires_prepay | false |

---

## Part Data Snapshot (AFTER fix)

| Field | Value |
|-------|-------|
| requires_client_billing | ✅ true |
| affects_inventory | ✅ true |
| affects_margin | ✅ true |
| physical_stock | 1.0 |

---

## Eligibility Calculations (getAllowedCommitmentActions.js)

### Install Eligibility

```javascript
// Line 132-143
// INSTALL - only if has reserved & uninstalled (reserved_from_stock > qty_installed)
const uninstalled = Math.max(0, effectiveReserved - qty_installed);
// uninstalled = max(0, 1.0 - 0.0) = 1.0

if (uninstalled > 0) {
  actions.canInstall = true;  // ✅ TRUE
  actions.installableQty = uninstalled;  // 1
}
```

**Result**: `canInstall = true` ✅

### Invoice Eligibility

```javascript
// Line 161-174
// Invoice eligibility depends ONLY on: qty_required - invoiced_qty > 0
const remainingToBill = Math.max(0, effectiveRequired - commitmentInvoicedQty);
// remainingToBill = max(0, 1.0 - 0.0) = 1.0

if (remainingToBill > 0) {
  actions.canCreateInvoice = true;  // ✅ TRUE
}
```

**Result**: `canCreateInvoice = true` ✅

---

## UI Display Logic (PSMGroupedCards.jsx)

### Previous (BUGGY) Code
```javascript
const canInvoice = allowed?.canInvoice ?? true;  // ❌ Wrong field name
```

### Fixed Code
```javascript
const canInvoice = allowed?.canCreateInvoice ?? false;  // ✅ Correct field name
```

---

## PHASE 2: Install Verification

The `allowed` object now correctly shows:
- `canInstall: true` (reserved_from_stock=1 > qty_installed=0)
- `canCreateInvoice: true` (required_total=1 - invoiced_qty=0 = 1 > 0)

### Potential Blockers Checked

| Blocker | Value | Blocks? |
|---------|-------|---------|
| `actionsEnabled` | `true` | ❌ No |
| `block_reason_code` | `null` | ❌ No |
| `inventory_snapshot.reserved_this_project` | `1.0` | ❌ No |
| Part `requires_client_billing` | `true` | ❌ No (fixed) |
| Part `affects_inventory` | `true` | ❌ No (fixed) |

---

## Summary

| Action | Canonical Field Check | Expected | UI Shows |
|--------|----------------------|----------|----------|
| Install | `reserved_from_stock (1) > qty_installed (0)` | ✅ Enabled | ✅ Enabled |
| Invoice | `required_total (1) - invoiced_qty (0) > 0` | ✅ Enabled | ✅ Enabled |

**All eligibility checks PASS.** The commitment is now correctly eligible for both Install and Invoice actions.

---

## Fixes Applied

1. **Part Data Fix**: Updated `requires_client_billing`, `affects_inventory`, `affects_margin` to `true`
2. **UI Code Fix**: Changed `allowed?.canInvoice` to `allowed?.canCreateInvoice` with `?? false` fallback

---

## Debug Logging

When viewing this part in ProjectSupplyManager, the console will log:

```javascript
INSTALL DEBUG - A/C Part {
  part: "Electric Air Conditioning for Classic 911 (single condenser)",
  reserved_from_stock: 1.0,
  qty_installed: 0.0,
  available_to_install: 1.0,
  allowedInstall: true,
  allowedCreateInvoice: true,
  block_reason_code: null,
  actionsEnabled: true,
  inventory_snapshot: { physical_stock: 1.0, reserved_this_project: 1.0, ... }
}
``