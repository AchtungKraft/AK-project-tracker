# Supply System Documentation

**Version:** 2.0 (Resolver-Only Architecture)  
**Date:** 2026-02-19

---

## Shop Manager Flow

### A) Project-First Workflow

The project-first workflow starts from a specific project and manages parts through their lifecycle.

#### Steps: Requirement → Install

1. **Create Requirement**
   - Navigate: `SupplyLanding` → Click project → `ProjectSupplyManager`
   - Action: Add part requirement with `source_type`:
     - `SHOP_PURCHASED` - Normal vendor purchase (default)
     - `CLIENT_SUPPLIED` - Client provides part, no PO needed
     - `AK_CUSTOM` - AK manufactures internally
     - `TAKE_OFF` - Part removed from vehicle
   - Data: Creates `PartCommitment` with `required_total`

2. **Reserve from Stock**
   - Tab: Plan/Requirements
   - Action: Click "Reserve from Stock" or use bulk reserve
   - Dispatcher: `executeSupplyAction({action_type:'AUTO_RESERVE', commitment_ids})`
   - Result: Updates `reserved_from_stock` from `Part.physical_stock`

3. **Fund (if needed)**
   - Tab: Fund
   - Condition: Items with `exposure_gap > 0` or `next_action === 'ALLOCATE_POOL'`
   - Action: Create pool or allocate from existing pool
   - Result: Updates `covered_retail_total`, reduces `exposure_gap`

4. **Order**
   - Tab: Buy
   - Condition: Items with `to_order > 0` and no funding blocks
   - Action: Select items → Create PO
   - Dispatcher: `executeSupplyAction({action_type:'CREATE_PO', commitment_ids, dry_run:true})` → Preview → Execute
   - Result: Creates `Order`, `PartPurchaseLineItem`, updates `covered_from_po`

5. **Receive**
   - Tab: Receive (or `POReceiving` page)
   - Action: Open PO → Enter receive quantities → Assign locations → Receive
   - Dispatcher: `executeSupplyAction({action_type:'RECEIVE', payload:{order_id, lines}})`
   - Result: Updates `Part.physical_stock`, line item status

6. **Install**
   - Tab: Install
   - Condition: Items with `available_to_install > 0`
   - Action: Select items → Install
   - Dispatcher: `executeSupplyAction({action_type:'INSTALL', commitment_ids, payload:{qty}})`
   - Result: Updates `qty_installed`, reduces `reserved_from_stock`

7. **Reverse Install (if needed)**
   - Action: Select installed item → Reverse Installation
   - Dispatcher: `executeSupplyAction({action_type:'REVERSE_INSTALL', commitment_ids})`
   - Result: Restores `reserved_from_stock`, reduces `qty_installed`

---

### B) Operations-First Workflow

The ops-first workflow starts from global queues and manages parts across all projects.

#### Steps: Global Queue → PO → Receive → Stock

1. **Review Global Queue**
   - Navigate: `SupplyLanding` → "Order Queue" or `GlobalNeedToOrder`
   - View: All items with `to_order > 0` grouped by vendor/project/coverage
   - Data Source: `getOpsSupplyView({mode:'ORDERING'})`

2. **Filter & Select**
   - Filter by: Vendor, Project, Coverage status, Prepay requirement
   - Group by: Vendor (default), Project, Coverage
   - Select: Checkbox individual items or "Select All" in group

3. **Batch PO Creation**
   - Action: Click "Create Batch PO"
   - Preview: `executeSupplyAction({action_type:'CREATE_PO', commitment_ids, dry_run:true})`
   - Shows: PO breakdown by vendor, blocked items, total cost
   - Confirm: Creates all POs atomically

4. **Navigate to Receiving**
   - CTA: "Go to Receiving" button after PO creation
   - Or: Direct navigation to `POReceiving`

5. **PO-Centric Receiving**
   - Page: `POReceiving`
   - View: List of open POs with remaining quantities
   - Action: Click PO → Fast batch receiving interface

6. **Batch Receive**
   - Interface: Table with all line items
   - Quick actions:
     - "Receive All Remaining" - sets all receive_qty to remaining
     - Default location selector + "Apply to Selected"
   - Submit: Single dispatcher call receives all selected lines
   - Result: Stock updated, available for reservation

---

## Screen Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUPPLY LANDING                            │
│              (Portfolio overview, project list)                  │
└────────────────────┬────────────────────────┬───────────────────┘
                     │                        │
                     ▼                        ▼
┌────────────────────────────┐    ┌────────────────────────────┐
│   ProjectSupplyManager      │    │   GlobalNeedToOrder         │
│   (Project-first workflow)  │    │   (Ops-first workflow)      │
│                             │    │                             │
│   Tabs:                     │    │   Group by:                 │
│   - Plan (Requirements)     │    │   - Vendor                  │
│   - Fund (Pools)            │    │   - Project                 │
│   - Buy (Ordering)          │    │   - Coverage                │
│   - Receive                 │    │                             │
│   - Install                 │    │   Actions:                  │
│   - Report                  │    │   - Select items            │
└────────────┬────────────────┘    │   - Batch PO creation       │
             │                      │   - Go to Receiving         │
             │                      └──────────────┬──────────────┘
             │                                     │
             └──────────────┬──────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │         POReceiving            │
            │   (PO-centric fast receiving)  │
            │                                │
            │   - List mode: All open POs    │
            │   - Detail mode: Single PO     │
            │     batch receiving            │
            └───────────────────────────────┘
```

---

## Data Contract

### SupplyCommitmentViewModel

The canonical shape for all supply-related UI components. Returned by read-model backend functions.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `commitment_id` | string | PartCommitment.id | Primary key |
| `part_id` | string | PartCommitment.part_id | Part reference |
| `part_name` | string | Part.part_name | Display name |
| `vendor_part_number` | string? | Part.vendor_part_number | SKU |
| `featured_photo` | string? | Part.featured_photo | Image URL |
| `project_id` | string | PartCommitment.project_id | Project reference |
| `project_name` | string | Project.name | Display name |
| `vendor_id` | string? | Part.default_vendor_id | Vendor reference |
| `vendor_name` | string? | Vendor.vendor_name | Display name |

#### Canonical Quantities

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `required_total` | number | PartCommitment.required_total | Total needed |
| `reserved_from_stock` | number | PartCommitment.reserved_from_stock | Reserved from inventory |
| `covered_from_po` | number | PartCommitment.covered_from_po | Covered by POs |
| `qty_installed` | number | PartCommitment.qty_installed | Consumed |

#### Derived Quantities (Resolver-computed, NOT UI-computed)

| Field | Type | Formula | Description |
|-------|------|---------|-------------|
| `to_order` | number | `required - reserved - covered` | Gap to fill |
| `on_order_qty` | number | Sum of open PO lines | Pending delivery |
| `received_qty` | number | Sum of received from POs | Delivered |
| `available_to_install` | number | `reserved + covered - installed` | Ready to consume |

#### Coverage State

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `coverage_status` | enum | FULL, PARTIAL, NONE, OVER | Supply coverage |
| `coverage_percent` | number | 0-100+ | Percentage covered |

#### Next Action

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `next_action` | enum? | CREATE_PO, RECEIVE, INSTALL, ALLOCATE_POOL, FIX_VENDOR, FIX_QTY, FIX_INVARIANT, COMPLETE | Recommended action |
| `block_reason_code` | enum? | NO_VENDOR, INSUFFICIENT_FUNDS, PREPAY_REQUIRED, NEGATIVE_AVAILABLE, INVARIANT_VIOLATION, ARCHIVED_PART | Why blocked |
| `block_reason_message` | string? | - | Human-readable message |

#### Source Type

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `source_type` | enum | SHOP_PURCHASED, CLIENT_SUPPLIED, AK_CUSTOM, TAKE_OFF | Supply source |

#### Financial Fields

| Field | Type | Description |
|-------|------|-------------|
| `unit_cost` | number | Per-unit cost |
| `unit_retail` | number | Per-unit retail |
| `planned_cost_total` | number | unit_cost × required_total |
| `planned_retail_total` | number | unit_retail × required_total |
| `covered_retail_total` | number | Pool allocations |
| `exposure_gap` | number | planned_retail - covered_retail |
| `billing_status` | enum | not_billable, billable, invoiced, paid |

#### Inventory Snapshot

| Field | Type | Description |
|-------|------|-------------|
| `inventory_snapshot.physical_stock` | number | Actual count |
| `inventory_snapshot.reserved_total` | number | Sum of all reservations |
| `inventory_snapshot.available` | number | physical - reserved |
| `inventory_snapshot.on_order_total` | number | Sum of all PO quantities |
| `inventory_snapshot.to_order_total` | number | Sum of all gaps |

---

## Read Model Functions

### getProjectSupplyView(project_id, filters)

Returns `SupplyCommitmentViewModel[]` for a specific project.

**Filters:**
- `source_type`: Filter by supply source
- `coverage_status`: Filter by coverage state
- `next_action`: Filter by recommended action
- `category_id`: Filter by part category
- `search`: Text search on part name/SKU

**Response includes:**
- `items`: Filtered view models
- `tab_counts`: Counts for each tab (plan, fund, buy, receive, install)
- `summary`: Aggregate statistics
- `pools`: Active billing pools
- `categories`: Part categories for filtering

### getOpsSupplyView(mode, filters)

Returns `SupplyCommitmentViewModel[]` for global operations.

**Modes:**
- `ORDERING`: Items with `to_order > 0`
- `RECEIVING`: Items with `on_order_qty > 0`
- `INSTALL`: Items with `available_to_install > 0`
- `ALL`: All active commitments

**Filters:**
- `vendor_id`: Filter by vendor
- `project_id`: Filter by project
- `coverage_status`: Filter by coverage
- `source_type`: Filter by supply source
- `search`: Text search

### getPOReceivingView(order_id?, filters)

Returns PO-centric data for receiving.

**Single PO mode (order_id provided):**
- `po`: Full PO detail with line items
- `locations`: Available locations for put-away

**List mode (no order_id):**
- `orders`: All receivable POs
- `summary`: Aggregate statistics
- `locations`: Available locations

---

## Test Checklist

### Scenario: Need > Stock across 2 Projects

**Setup:**
- Part A: physical_stock = 5
- Project 1: needs 4 of Part A
- Project 2: needs 4 of Part A
- Total need (8) > stock (5) = partial coverage + ordering required

**Test Steps:**

1. **Create Requirements**
   - [ ] Create requirement in Project 1 for 4× Part A
   - [ ] Create requirement in Project 2 for 4× Part A
   - [ ] Verify `required_total = 4` for both commitments

2. **Auto Reserve**
   - [ ] Run auto-reserve on Project 1
   - [ ] Verify Project 1: `reserved_from_stock = 4` (takes available)
   - [ ] Run auto-reserve on Project 2
   - [ ] Verify Project 2: `reserved_from_stock = 1` (only 1 left)
   - [ ] Verify Project 2: `to_order = 3` (gap)

3. **Verify Global Queue**
   - [ ] Navigate to GlobalNeedToOrder
   - [ ] Verify Project 2 commitment appears with `to_order = 3`
   - [ ] Verify `is_orderable = true` (assuming funded)

4. **Batch PO Creation**
   - [ ] Select Project 2 commitment
   - [ ] Click "Create Batch PO"
   - [ ] Verify preview shows 1 PO, 1 line, qty = 3
   - [ ] Confirm PO creation
   - [ ] Verify commitment: `covered_from_po = 3`

5. **PO Receiving**
   - [ ] Navigate to POReceiving
   - [ ] Find created PO
   - [ ] Receive 3 units
   - [ ] Verify Part.physical_stock increased by 3

6. **Install**
   - [ ] Project 1: Install all 4 (from reservation)
   - [ ] Verify: `qty_installed = 4`, `reserved_from_stock = 0`
   - [ ] Project 2: Install all 4 (1 reserved + 3 received)
   - [ ] Verify: `qty_installed = 4`

7. **Reverse Install**
   - [ ] Project 1: Reverse 1 installation
   - [ ] Verify: `qty_installed = 3`, `reserved_from_stock = 1`
   - [ ] Verify Part.physical_stock unchanged (still reserved)

---

## Migration Notes

### Legacy Field Mapping

| Canonical | Legacy | Migration |
|-----------|--------|-----------|
| `required_total` | `qty_committed` | Copy if not set |
| `reserved_from_stock` | `qty_reserved`, `qty_allocated` | Copy from qty_reserved |
| `covered_from_po` | `qty_ordered` | Copy if not set |
| `source_type` | `supply_source_type` | Map values |

### Fallback Pattern (Temporary)

```javascript
const required = commitment.required_total ?? commitment.qty_committed ?? 0;
```

This pattern allows gradual migration. Remove fallbacks after:
1. Migration script populates all canonical fields
2. `runSupplyIntegrityAudit` returns `critical = 0`
3. 1 week of clean operation

---

## Governance Rules

1. **UI is resolver-only for state**
   - NO local math for coverage, to_order, available
   - All derived values come from read-model functions

2. **All mutations through dispatcher**
   - `executeSupplyAction` is the ONLY mutation entry point
   - Components MUST NOT write to entities directly

3. **Quantity visibility**
   - `required_total` and `reserved_from_stock` must always be visible
   - Project views show total required even when not fully covered

4. **Source type classification**
   - All commitments have explicit `source_type`
   - CLIENT_SUPPLIED and TAKE_OFF don't create PO demand