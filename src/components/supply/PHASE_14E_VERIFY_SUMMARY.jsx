# PHASE 14E-VERIFY: Inventory UI Wiring Gap Closure

## Summary of Changes

### A) INVENTORY LOCATIONS MUST BE INVENTORYITEM-DRIVEN ✅

**InventoryLocations.jsx** uses these query keys:
- `['inventoryItems']` - Main list query
- `['locations']` - For location tree
- `['partCommitments']` - For reserved stock (replaced legacy partProjectRequirements)

**Source of truth:**
- `getInventoryStats()` computes from `InventoryItem.quantity_on_hand` exclusively
- No `Part.physical_stock` per-location - only global

### B) UNASSIGNED ROUTING IS DETERMINISTIC ✅

**Backend (executeSupplyAction.js):**
- `addStock()` and `receiveSingleLine()` both route `null` location_id → UNASSIGNED_SYSTEM
- Creates `UNASSIGNED_SYSTEM` Location if missing
- InventoryItem always has non-null location_id

**Frontend (AddInventoryModal.jsx):**
- Passes `location_id: data.location_id || null` to backend
- Backend handles the default

### C) CACHE INVALIDATION MATCHES CONSUMERS ✅

**Query keys by surface:**

| Surface | Query Key(s) |
|---------|-------------|
| PartsTracker INVENTORY tab | `['partsInventoryView']` |
| PartsTracker LOCATIONS tab | `['inventoryItems']`, `['locations']`, `['partCommitments']` |
| PartDetailModal locations list | `['inventoryItems']` (via InventoryLocationsList) |
| PartDetailModal stats | `['partSupplyUsage', partId]` |
| Install modal | `['inventoryItems']`, `['commitmentState', commitmentId]` |

**supplyInvalidation.js now invalidates (ALWAYS):**
- `['inventoryItems']` via predicate (catches all patterns)
- `['locations']`
- `['partSupplyUsage', partId]` for each affected part
- `['commitmentState']` and `['commitmentStates']` via predicate
- `['partInventoryState']` and `['partInventoryStates']` via predicate
- `['partsInventoryView']`
- `['parts']`
- `['partCommitments']`

### D) INSTALL MODAL USES CANONICAL COMMITMENT STATE ✅

**InstallPartModal.jsx:**
- Uses `useCommitmentState(commitmentId)` hook from `useSupplyState.js`
- Computes `maxInstallable = reserved_from_stock - qty_installed`
- Falls back to `passedCommitment` props if resolver not loaded
- Now uses main `['inventoryItems']` query (not per-part pattern)

### Files Changed

| File | Change |
|------|--------|
| `components/supply/supplyInvalidation.js` | Use predicate for inventoryItems; add partSupplyUsage, commitmentState, partInventoryState |
| `components/supply/useSupplyState.js` | Use unified invalidation helper in onSuccess |
| `components/inventory/InventoryLocationEditor.jsx` | Use predicate for inventoryItems; InventoryLocationsList uses main query |
| `components/project/InstallPartModal.jsx` | Use main inventoryItems query; add useMemo import |

### Legacy Queries Status

| Query Key | Status |
|-----------|--------|
| `['partProjectRequirements']` | REMOVED from InventoryLocations |
| `['partBuildAssignments']` | REMOVED from InventoryLocations |

These are still in supplyInvalidation.js `invalidateAll` block but no longer queried.

### Verification Checklist

1. **Add Inventory with no location selected:**
   - ✅ Backend routes to UNASSIGNED_SYSTEM
   - ✅ InventoryItem created with non-null location_id
   - ✅ All surfaces invalidated via predicate

2. **Add Inventory to existing location:**
   - ✅ Backend upserts single InventoryItem (throws on duplicate)
   - ✅ Quantity increments, no new record

3. **Reserved part in project:**
   - ✅ Row shows Reserved from commitment.reserved_from_stock
   - ✅ Install modal uses useCommitmentState hook
   - ✅ Installable = reserved_from_stock - qty_installed