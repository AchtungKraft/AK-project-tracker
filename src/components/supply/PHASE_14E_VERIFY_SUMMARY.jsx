# PHASE 14E-FINAL: Inventory UI Wiring Lockdown

## VERIFIED QUERY KEY CONSOLIDATION

### A) QUERY KEY PATTERNS - ALL CANONICAL ✅

| Component | Query Key | Purpose | Invalidated By |
|-----------|-----------|---------|----------------|
| InventoryLocations | `['inventoryItems']` | Stock by location | predicate |
| InventoryLocations | `['locations']` | Location tree | direct |
| InventoryLocations | `['partCommitments']` | Reserved display | direct |
| InstallPartModal | `['inventoryItems']` | Available stock | predicate |
| InstallPartModal | `['commitmentState', id]` | Commitment state | predicate |
| EditPartDrawer | `['partSupplyUsage', id]` | Part stats | predicate |
| InventoryLocationsList | `['inventoryItems']` | Part locations | predicate |
| InventoryManagement | `['partsInventoryView']` | Global inventory | predicate |

### B) LEGACY PATTERNS ELIMINATED ✅

**NO components use:**
- ~~`['inventoryItems', partId]`~~ - REMOVED
- ~~`['inventoryItems', 'forPart', partId]`~~ - REMOVED
- ~~`['partProjectRequirements']`~~ - REMOVED from queries
- ~~`['partBuildAssignments']`~~ - REMOVED from queries

### C) supplyInvalidation.js - COMPLETE PREDICATE COVERAGE ✅

```javascript
// ALWAYS invalidated via predicate:
inventoryItems      → predicate (key[0] === 'inventoryItems')
commitmentState     → predicate (key[0] === 'commitmentState' || 'commitmentStates')
partSupplyUsage     → predicate (key[0] === 'partSupplyUsage')
partInventoryState  → predicate (key[0] === 'partInventoryState' || 'partInventoryStates')
partsInventoryView  → predicate (key[0] === 'partsInventoryView')
locations           → direct key
parts               → direct key
partCommitments     → direct key
```

### D) INSTALL MODAL CONSISTENCY ✅

**InstallPartModal computes:**
```javascript
const reserved = commitmentState?.reserved_from_stock ?? passedCommitment?.reserved_from_stock ?? 0;
const installed = commitmentState?.qty_installed ?? passedCommitment?.qty_installed ?? 0;
const maxInstallable = Math.max(0, reserved - installed);
```

**Does NOT read:**
- ~~InventoryItem directly for install calculation~~
- ~~part.allocated_stock~~
- ~~requirement.qty_allocated (legacy)~~

### E) INVENTORY LOCATIONS SOURCE OF TRUTH ✅

**InventoryLocations.getInventoryStats():**
```javascript
const items = inventoryItems.filter(i => i.part_id === partId);
const onHand = items.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
const reserved = items.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
```

**Does NOT derive stock from:**
- ~~commitments~~
- ~~Part.physical_stock per location~~

## FILES VERIFIED

| File | Status |
|------|--------|
| `components/inventory/InventoryLocations.jsx` | ✅ Uses `['inventoryItems']` only |
| `components/project/InstallPartModal.jsx` | ✅ Uses `['inventoryItems']`, `['commitmentState']` |
| `components/parts/EditPartDrawer.jsx` | ✅ Uses `['partSupplyUsage']` |
| `components/inventory/InventoryLocationEditor.jsx` | ✅ Uses `['inventoryItems']`, predicate invalidation |
| `components/inventory/InventoryManagement.jsx` | ✅ Uses `['partsInventoryView']` |
| `components/receiving/ReceiveInventoryModal.jsx` | ✅ Uses unified invalidation |
| `components/inventory/AddInventoryModal.jsx` | ✅ Uses unified invalidation |
| `components/supply/supplyInvalidation.js` | ✅ Predicate for all families |
| `components/supply/useSupplyState.js` | ✅ Calls unified invalidation |

## MUTATION ROUTING VERIFIED

All supply mutations route through `executeSupplyAction`:
- ADD_STOCK → `invalidateSupplyQueries()`
- RECEIVE → `invalidateSupplyQueries()`
- INSTALL → `useSupplyAction` → `invalidateSupplyQueries()`
- REVERSE_INSTALL → `useSupplyAction` → `invalidateSupplyQueries()`
- CREATE_PO → `invalidateSupplyQueries()`
- ADJUST_REQUIRED → `invalidateSupplyQueries()`
- CANCEL_COMMITMENT → `invalidateSupplyQueries()`

## ARCHITECTURE LOCKED ✅

This configuration is now production-ready. Any new inventory surfaces must:
1. Use `['inventoryItems']` (not per-part patterns)
2. Use `['commitmentState', id]` for commitment data
3. Use `['partSupplyUsage', id]` for part aggregates
4. Route mutations through `executeSupplyAction`
5. NOT add direct `queryClient.invalidateQueries` calls