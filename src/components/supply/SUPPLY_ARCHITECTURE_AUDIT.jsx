# Supply Architecture Audit Report

**Date:** 2026-02-19  
**Status:** Mid-Transition (FRAGILE)

## Phase 1: Legacy Field Usage Audit

### Fields Searched
- `qty_reserved`, `qty_to_order`, `qty_committed`, `qty_needed`, `qty_ordered`, `qty_received`, `qty_installed`

### Findings by Category

#### ✅ UPDATED TO CANONICAL (with fallback)
- `ProjectSupplyManager.jsx` - Coverage computation uses canonical fields
- `CommitmentQuantityManager.jsx` - Constraints use canonical fields
- `FinancialColumns.jsx` - Uses canonical `required_total`
- `GlobalNeedToOrder.jsx` - Uses `to_order` from resolver
- `SupplyQueues.jsx` - Uses `required_total ?? qty_committed`
- `DeltaOrderModal.jsx` - Uses canonical fields for order status
- `getAllowedCommitmentActions.jsx` - Already uses canonical with fallback

#### ⚠️ LEGACY STILL IN USE (Display Only - Lower Priority)
- `InstallPartModal.jsx` - Line 134-136 shows `requirement.qty_needed`, `qty_allocated`, `qty_installed`
- `OrderPartModal.jsx` - Line 85 filters by `qty_needed - qty_allocated - qty_ordered`

#### 🔴 ARCHITECTURAL DRIFT (Needs Fix)
- `ProjectSupplyManager.jsx` - Lines 379-395: Filter logic still uses legacy fields for `buy`, `receive`, `install` tabs

---

## Phase 2: Resolver Boundary Enforcement

### Components Verified

| Component | Resolver Data? | Computes Math? | Status |
|-----------|---------------|----------------|--------|
| `ProjectSupplyManager` | ❌ Derives locally | ✅ Fixed coverage | ⚠️ Partial |
| `SupplyQueues` | ✅ From `getGlobalSupplyQueues` | ❌ Display only | ✅ OK |
| `GlobalNeedToOrder` | ✅ From `getGlobalOrderQueue` | ❌ Display only | ✅ OK |
| `InstallPartModal` | ✅ Uses `useCommitmentState` | ❌ | ✅ OK |
| `ReceiveInventoryModal` | ✅ Uses `useSupplyAction` | ❌ | ✅ OK |
| `FinancialColumns` | ❌ Reads commitment fields | ⚠️ Derives exposure_gap | ⚠️ Minor |

### Violations Found
1. `ProjectSupplyManager` computes `coverage_total`, `gap_qty`, `overage_qty` locally
   - **Should:** Call backend resolver or use resolver-shaped data
   - **Fix:** Create `useProjectCommitmentStates(projectId)` hook

---

## Phase 3: Required vs Reserved Integrity

### Checked Logic
- ✅ No UI uses `reserved_from_stock > required_total` as a branch
- ⚠️ `coverage_status` not always from resolver - derived in `ProjectSupplyManager`

### Recommendation
- Ensure all coverage status comes from `resolveCommitmentState.coverage_status`
- UI should branch on `coverage_status` enum, not compute math

---

## Phase 4: InlineQtyStepper Safety

### Verified
- ✅ `InlineQtyStepper` calls `executeSupplyAction` with `action_type='ADJUST_REQUIRED'`
- ✅ Does NOT directly modify `reserved_from_stock` or `covered_from_po`
- ✅ Refreshes via query invalidation

### Backend Responsibility
The `executeSupplyAction` handler must:
- Validate constraints before mutation
- Never leave negative `to_order`
- Adjust related fields atomically

---

## Phase 5: FinancialColumns Consistency

### Verified
- ✅ Uses `commitment.exposure_gap` when available
- ✅ Fallback is `planned_retail - covered_retail` (correct formula)
- ❌ Does NOT branch on `coverage_status === 'UNFUNDED'`

### Recommendation
- Add coverage_status-based funding badge
- Remove arithmetic fallback once resolver provides all fields

---

## Phase 6: Fallback Removal Plan

### Current Pattern
```javascript
const required = commitment.required_total ?? commitment.qty_committed ?? 0;
```

### Migration Steps
1. ✅ All UI updated to use fallback pattern
2. ⬜ Run `runSupplyIntegrityAudit` - confirm critical=0
3. ⬜ Run data migration to populate canonical fields
4. ⬜ Enable `validateSupplyMutationGuard` logging
5. ⬜ After 1 week clean: Remove fallbacks
6. ⬜ Lock mutation guard to reject legacy writes

---

## Canonical Field Reference

| Canonical | Legacy | Source |
|-----------|--------|--------|
| `required_total` | `qty_committed` | PartCommitment |
| `reserved_from_stock` | `qty_reserved`, `qty_allocated` | PartCommitment |
| `covered_from_po` | `qty_ordered` | PartCommitment |
| `qty_installed` | `qty_installed` | Same |
| `to_order` (derived) | `qty_to_order` | Resolver computes: `required - reserved - covered` |

---

## Immediate Actions Required

### Critical
1. **Freeze new features** until resolver-only rendering complete
2. **Fix `ProjectSupplyManager`** to not compute coverage locally

### High Priority
3. Move install/receive tab filtering to use canonical coverage
4. Add backend resolver call for project supply state

### Medium Priority
5. Update `OrderPartModal` requirement filter to use canonical
6. Add funding status to `FinancialColumns` based on coverage_status

---

## Strategic Status

| Layer | Status |
|-------|--------|
| Canonical Schema | ✅ Defined |
| Resolver Layer | ✅ Exists (`resolveCommitmentState`) |
| Dispatcher | ✅ Exists (`executeSupplyAction`) |
| Orphan Cleanup | ✅ Done |
| CommitmentQuantityManager | ⚠️ Partially aligned |
| Resolver-only UI | ❌ Not complete |
| Install via dispatcher | ✅ Done |
| Receiving PO-centric | ⚠️ Partial |
| Legacy fallback removed | ❌ Not done |
| SupplyQueues aligned | ⚠️ Partial |
| Mutation guard locked | ❌ Not enabled |

**Overall:** Mid-transition - most fragile state. Complete cleanup before new features.