# Lifecycle Gating Canonicalization Audit
## Generated: 2026-02-24

---

# PHASE 1 — DETECT RULE MISMATCHES

## Action Gating Comparison Table

| Action | Tab Filter Logic | Gating Logic (getAllowedCommitmentActions) | Canonical Field | Legacy Field | Conflict? |
|--------|------------------|-------------------------------------------|-----------------|--------------|-----------|
| `canCreatePO` | `to_order > 0 \|\| coverage_status === 'PARTIAL'` (lines 383-387) | `commitment_status === 'planned' && unorderedQty > 0` (line 107) | `to_order` | `commitment_status` | **⚠️ YES** |
| `canCreateDeltaOrder` | N/A | `['ordered','partially_received','received'].includes(commitment_status) && effectiveOnOrder > 0` (lines 113-115) | `covered_from_po` | `commitment_status` | **⚠️ YES** |
| `canInstall` | `reserved_from_stock > qty_installed` (lines 399-403) | `uninstalled > 0` where `uninstalled = reserved - installed` (lines 75, 137-140) | `reserved_from_stock`, `qty_installed` | None | ✅ NO |
| `canCreateInvoice` | N/A | `remainingToBill > 0` where `remainingToBill = required - invoiced_qty` (lines 163-168) | `required_total`, `invoiced_qty` | None | ✅ NO |
| `canEdit` | N/A | `!hasBeenBilled && !isPaidOrInvoiced` (lines 76-77, 100-103) | N/A | **`billing_status`** | **⚠️ YES** |
| `canCancel` | N/A | `qty_installed === 0 && !hasReceived` (lines 149-156) | `qty_installed`, `received_qty` | None | ✅ NO |
| `canReceive` | `on_order_qty > 0 \|\| commitment_status in ['ordered','partially_received']` (lines 391-393) | `unreceived > 0` where `unreceived = covered_from_po` (lines 118-121) | `covered_from_po` | `commitment_status` | **⚠️ YES** |

---

## Conflict Analysis

### 1. `canCreatePO` — CONFLICT DETECTED

**Tab Filter (PSM line 383-387)**:
```javascript
filtered = filtered.filter(c => {
  if (c.coverage_status === 'FULL') return false;
  const gapQty = c.to_order ?? 0;
  return gapQty > 0 || c.coverage_status === 'PARTIAL';
});
```

**Gating Logic (getAllowedCommitmentActions line 107)**:
```javascript
if (commitment_status === 'planned' && unorderedQty > 0) {
  actions.canCreatePO = true;
}
```

**Problem**: Tab shows items with `to_order > 0`, but button is disabled unless `commitment_status === 'planned'`. This causes greyed-out buttons in the Buy tab.

**Root Cause**: The gating logic incorrectly requires `commitment_status === 'planned'`, which is a LIFECYCLE STRING constraint that should NOT gate PO creation.

---

### 2. `canEdit` — CONFLICT DETECTED

**Gating Logic (getAllowedCommitmentActions lines 76-77, 100)**:
```javascript
const hasBeenBilled = billing_status && !['not_billable', 'billable'].includes(billing_status);
const isPaidOrInvoiced = ['invoiced', 'paid'].includes(billing_status);
// ...
if (!hasBeenBilled && !isPaidOrInvoiced) {
  actions.canEdit = true;
}
```

**Problem**: Edit is gated on `billing_status` enum, which can be stale. Should gate on `invoiced_qty > 0` instead.

---

### 3. `canCreateDeltaOrder` — CONFLICT DETECTED

**Gating Logic (getAllowedCommitmentActions lines 113-115)**:
```javascript
const canDeltaOrderStates = ['ordered', 'partially_received', 'received'];
if (canDeltaOrderStates.includes(commitment_status) && effectiveOnOrder > 0) {
  actions.canCreateDeltaOrder = true;
}
```

**Problem**: Gates on `commitment_status` string instead of canonical quantity. Should be: `covered_from_po > 0 && to_order > 0` (has existing orders AND needs more).

---

### 4. `canReceive` — CONFLICT DETECTED

**Tab Filter (PSM lines 391-393)**:
```javascript
filtered = filtered.filter(c => 
  c.on_order_qty > 0 || ['ordered', 'partially_received'].includes(c.commitment_status)
);
```

**Gating Logic (getAllowedCommitmentActions lines 118-121)**:
```javascript
if (unreceived > 0) {
  actions.canReceive = true;
}
```

**Problem**: Tab filter includes `commitment_status` check, gating logic does not. Tab may show items that gating logic disables.

---

# PHASE 2 — DETECT LEGACY FIELD USAGE

## Search Results

| File | Function | Legacy Field | Used For Gating? | Must Remove? |
|------|----------|--------------|------------------|--------------|
| `getAllowedCommitmentActions.js:76` | Top-level | `billing_status` | ✅ YES (`hasBeenBilled`) | **YES** |
| `getAllowedCommitmentActions.js:77` | Top-level | `billing_status` | ✅ YES (`isPaidOrInvoiced`) | **YES** |
| `getAllowedCommitmentActions.js:100` | `canEdit` | via `hasBeenBilled`, `isPaidOrInvoiced` | ✅ YES | **YES** |
| `getAllowedCommitmentActions.js:107` | `canCreatePO` | `commitment_status` | ✅ YES | **YES** |
| `getAllowedCommitmentActions.js:113-115` | `canCreateDeltaOrder` | `commitment_status` | ✅ YES | **YES** |
| `getActionBlockReason:305-338` | Block reasons | `qty_committed`, `qty_ordered`, `qty_allocated` | ✅ YES | **YES** |

### Legacy Fields Found in `getActionBlockReason` (lines 305-338):

```javascript
// Line 310:
if ((commitment?.qty_committed || 0) <= (commitment?.qty_ordered || 0)) {
  return 'All committed quantity already on order';
}

// Line 329:
if ((commitment?.qty_allocated || 0) <= (commitment?.qty_installed || 0)) {
  return 'No allocated parts available to install';
}
```

**CRITICAL**: These use deprecated `qty_committed`, `qty_ordered`, `qty_allocated` fields.

---

# PHASE 3 — CANONICALIZE INSTALL ELIGIBILITY

## Current Implementation

**getAllowedCommitmentActions (lines 75, 137-140)**:
```javascript
const uninstalled = Math.max(0, effectiveReserved - qty_installed);
// ...
if (uninstalled > 0) {
  actions.canInstall = true;
  actions.installableQty = uninstalled;
}
```

Where `effectiveReserved = reserved_from_stock`.

**Tab Filter (PSM lines 399-403)**:
```javascript
filtered = filtered.filter(c => {
  const reservedProject = c.reserved_from_stock ?? 0;
  const installed = c.qty_installed ?? 0;
  return reservedProject > installed;
});
```

## Assessment

| Check | Status |
|-------|--------|
| Uses `reserved_from_stock` | ✅ YES |
| Uses `qty_installed` | ✅ YES |
| No `billing_status` dependency | ✅ YES |
| No `available_to_install` from read model | ⚠️ INCONSISTENT |

**Issue**: Read model provides `available_to_install` but tab filter recomputes locally.

## Recommendation

**OPTION A (Preferred)**: Use read model's `available_to_install`:
```javascript
// Tab filter:
filtered = filtered.filter(c => (c.available_to_install ?? 0) > 0);

// Gating:
if ((commitment.available_to_install ?? 0) > 0) {
  actions.canInstall = true;
}
```

**OPTION B**: Keep computing but standardize field name `installableQty` in read model.

---

# PHASE 4 — CANONICALIZE PO ELIGIBILITY

## Current Implementation (PROBLEMATIC)

```javascript
// Line 107:
if (commitment_status === 'planned' && unorderedQty > 0) {
  actions.canCreatePO = true;
}
```

## Canonical Rule

PO eligibility MUST equal:
```
to_order > 0 AND commitment_status NOT IN ['cancelled', 'closed']
```

## Required Change

```javascript
// BEFORE (line 107):
if (commitment_status === 'planned' && unorderedQty > 0) {

// AFTER:
if (unorderedQty > 0 && !['cancelled', 'closed'].includes(commitment_status)) {
```

**Rationale**: A commitment that already has orders (`ordered` status) but still has a gap (`to_order > 0`) should still allow creating additional POs.

---

# PHASE 5 — CANONICALIZE EDIT LOCKING

## Current Implementation (PROBLEMATIC)

```javascript
const hasBeenBilled = billing_status && !['not_billable', 'billable'].includes(billing_status);
const isPaidOrInvoiced = ['invoiced', 'paid'].includes(billing_status);
// ...
if (!hasBeenBilled && !isPaidOrInvoiced) {
  actions.canEdit = true;
}
```

## Canonical Rule

Edit locking MUST depend on:
```
invoiced_qty > 0 → lock quantity edits
invoiced_qty > 0 → lock price edits
```

## Required Change

```javascript
// BEFORE:
if (!hasBeenBilled && !isPaidOrInvoiced) {
  actions.canEdit = true;
}

// AFTER:
const isInvoiceLocked = (invoiced_qty ?? 0) > 0;
if (!isInvoiceLocked) {
  actions.canEdit = true;
  actions.canReduceQty = qty_installed === 0 || effectiveRequired > qty_installed;
}
```

**Explicit Invariant**:
```
EDIT_LOCK: invoiced_qty > 0 locks qty and price edits
REASON: Invoiced amounts are committed to client; changing would invalidate invoice
```

---

# PHASE 6 — UI DISABLE LOGIC AUDIT

## PSMGroupedCards.jsx Button Analysis

**Line 216**:
```javascript
const canOrder = allowed?.canCreatePO && toOrder > 0;
```
✅ Correctly adds local `toOrder > 0` check.

**Line 234**:
```javascript
disabled={!allowed?.canCreatePO}
```
⚠️ Checkbox uses raw `allowed?.canCreatePO` without local check.

**Lines 346-350**:
```javascript
{canOrder && (
  <DropdownMenuItem onClick={() => onCreatePO?.(commitment)}>
    Create PO
  </DropdownMenuItem>
)}
```
✅ Uses `canOrder` which includes local check.

**Lines 365-369**:
```javascript
{allowed?.canInstall && (
  <DropdownMenuItem onClick={() => onInstall?.(commitment)}>
    Install ({Math.max(0, reservedProject - (commitment.qty_installed ?? 0))} available)
  </DropdownMenuItem>
)}
```
✅ Uses `allowed?.canInstall` directly.

## Mismatch Report

| Location | Check Used | Matches Gating? | Issue |
|----------|------------|-----------------|-------|
| Checkbox (line 234) | `!allowed?.canCreatePO` | ⚠️ PARTIAL | Doesn't check local `toOrder > 0` |
| Create PO menu (line 346) | `canOrder` | ✅ YES | Includes local check |
| Install menu (line 365) | `allowed?.canInstall` | ✅ YES | Matches gating |

---

# PHASE 7 — REFACTOR PLAN

## Exact Lines to Remove/Replace

### File: `components/lifecycle/getAllowedCommitmentActions.js`

**Remove lines 76-77** (legacy billing_status derivations):
```javascript
// REMOVE:
const hasBeenBilled = billing_status && !['not_billable', 'billable'].includes(billing_status);
const isPaidOrInvoiced = ['invoiced', 'paid'].includes(billing_status);
```

**Replace line 100-103**:
```javascript
// BEFORE:
if (!hasBeenBilled && !isPaidOrInvoiced) {
  actions.canEdit = true;
  actions.canReduceQty = qty_installed === 0 || effectiveRequired > qty_installed;
}

// AFTER:
const isInvoiceLocked = (invoiced_qty ?? 0) > 0;
if (!isInvoiceLocked) {
  actions.canEdit = true;
  actions.canReduceQty = qty_installed === 0 || effectiveRequired > qty_installed;
}
```

**Replace line 107**:
```javascript
// BEFORE:
if (commitment_status === 'planned' && unorderedQty > 0) {

// AFTER:
if (unorderedQty > 0 && !['cancelled', 'closed'].includes(commitment_status)) {
```

**Replace lines 113-115**:
```javascript
// BEFORE:
const canDeltaOrderStates = ['ordered', 'partially_received', 'received'];
if (canDeltaOrderStates.includes(commitment_status) && effectiveOnOrder > 0) {
  actions.canCreateDeltaOrder = true;
}

// AFTER:
// Delta order when: has existing orders AND still has gap
if (effectiveOnOrder > 0 && unorderedQty > 0 && !['cancelled', 'closed'].includes(commitment_status)) {
  actions.canCreateDeltaOrder = true;
}
```

### File: `components/lifecycle/getAllowedCommitmentActions.js` (getActionBlockReason function)

**Replace lines 310-313**:
```javascript
// BEFORE:
if ((commitment?.qty_committed || 0) <= (commitment?.qty_ordered || 0)) {
  return 'All committed quantity already on order';
}

// AFTER:
if ((commitment?.to_order ?? 0) <= 0) {
  return 'All required quantity is covered';
}
```

**Replace lines 329-331**:
```javascript
// BEFORE:
if ((commitment?.qty_allocated || 0) <= (commitment?.qty_installed || 0)) {
  return 'No allocated parts available to install';
}

// AFTER:
if ((commitment?.available_to_install ?? (commitment?.reserved_from_stock ?? 0) - (commitment?.qty_installed ?? 0)) <= 0) {
  return 'No parts available to install';
}
```

---

## Canonical Action Invariant Comment Block

Add to top of `getAllowedCommitmentActions.js`:

```javascript
/**
 * ============================================================================
 * CANONICAL ACTION GATING RULES (Phase 8 Hardened)
 * ============================================================================
 * 
 * INSTALL:
 *   canInstall = available_to_install > 0
 *   where available_to_install = reserved_from_stock - qty_installed
 *   DOES NOT DEPEND ON: billing_status, paid, credit, lifecycle string
 * 
 * INVOICE:
 *   canInvoice = remaining_to_bill > 0
 *   where remaining_to_bill = required_total - invoiced_qty
 *   DOES NOT DEPEND ON: billing_status, paid, install status, stock
 * 
 * CREATE PO:
 *   canCreatePO = to_order > 0 AND NOT cancelled/closed
 *   where to_order = required_total - reserved_from_stock - covered_from_po
 *   DOES NOT DEPEND ON: billing_status, paid, lifecycle string (except cancel/close)
 * 
 * DELTA ORDER:
 *   canCreateDeltaOrder = covered_from_po > 0 AND to_order > 0 AND NOT cancelled/closed
 *   DOES NOT DEPEND ON: lifecycle string (except cancel/close)
 * 
 * EDIT:
 *   canEdit = invoiced_qty === 0
 *   LOCKS ON: invoiced_qty > 0 (invoiced amounts are committed)
 * 
 * RECEIVE:
 *   canReceive = covered_from_po > 0
 *   DOES NOT DEPEND ON: lifecycle string
 * 
 * CANCEL:
 *   canCancel = qty_installed === 0 AND received_qty === 0
 * ============================================================================
 */
```

---

# SUCCESS CRITERIA CHECKLIST

| Invariant | Status |
|-----------|--------|
| Tab filters and allowed actions derive from same canonical math | ⚠️ PARTIAL (PO filter uses `to_order`, gating uses `commitment_status`) |
| No lifecycle string state blocks quantity actions | ❌ FAIL (`canCreatePO` requires `planned`) |
| No billing state blocks install or invoice eligibility | ✅ PASS (already fixed in prior phase) |
| No legacy quantity fields are referenced | ❌ FAIL (`getActionBlockReason` uses `qty_committed`, etc.) |
| UI disables strictly reflect `allowed[action]` output | ✅ PASS |

---

# FINAL CANONICAL RULE SUMMARY

```
INSTALL:      available_to_install > 0
INVOICE:      required_total - invoiced_qty > 0
CREATE_PO:    to_order > 0 AND status NOT IN [cancelled, closed]
DELTA_ORDER:  covered_from_po > 0 AND to_order > 0 AND status NOT IN [cancelled, closed]
EDIT:         invoiced_qty === 0
RECEIVE:      covered_from_po > 0
CANCEL:       qty_installed === 0 AND received_qty === 0
```

No other conditions may gate these actions.