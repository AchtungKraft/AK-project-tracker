# AK Industrial Mode - Supply & Commitment UI Contract

## Overview

This document defines the complete enforced UI contract for ProjectSupplyManager and all supply list views.

---

## 1. Mandatory Row Data (Visible in All Lists)

Every row MUST display ALL of the following - **NOTHING may be conditionally hidden**:

| Field | Format | Notes |
|-------|--------|-------|
| Part Name | Clickable text | Opens Edit Part Drawer |
| In Stock | Integer | Physical inventory count |
| Reserved | Integer | Reserved from stock (cyan if > 0) |
| Needed | Integer | Required total |
| Cost | USD formatted | $X,XXX.XX |
| Retail | USD formatted | $X,XXX.XX |
| Display Lifecycle | Status badge | Mapped from commitment_status |
| Vendor | Text | Vendor name |
| Payment Status | Badge | billable/invoiced/paid |
| Coverage Indicator | Badge | COVERED/OUT OF STOCK/INSUFFICIENT |
| Pricing Warning | Badge | Only if NOT ok |

---

## 2. Currency Formatting (Hard Rule)

```js
import { formatCurrencyUSD } from '@/components/supply/pricingHelpers';

// Examples:
formatCurrencyUSD(1250)    // → "$1,250.00"
formatCurrencyUSD(1250000) // → "$1,250,000.00"
formatCurrencyUSD(0)       // → "$0.00"
```

ALL cost and retail values MUST use `formatCurrencyUSD`.

---

## 3. Inventory Display Format

### Desktop (single-line columns)
```
In Stock: X | Reserved: Y | Needed: Z
Cost: $12,500.00 | Retail: $18,900.00
```

### Mobile (stacked compact)
```
Stock X
Reserved Y
Need Z
Cost $12,500.00
Retail $18,900.00
```

**Inventory must NEVER be hidden.**

---

## 4. Inventory Coverage Indicators

| Condition | Label | Style |
|-----------|-------|-------|
| `available >= needed` | COVERED BY STOCK | Neutral gray |
| `available = 0` | OUT OF STOCK | Amber accent |
| `available < needed` | INSUFFICIENT STOCK | Amber accent |

- No bright colors
- No green success states
- Subtle industrial accent only

---

## 5. Part Name Click Behavior

Part name MUST:
- Be primary row text
- Be clickable
- Open Edit Part Drawer (modal)
- **NEVER navigate**
- **NEVER trigger row expand**

Modal MUST display:
- Exact `commitment_status`
- Pricing integrity status
- RetailAdjustmentRequest (if exists)
- Vendor
- Full pricing breakdown
- Inventory breakdown
- Quantity ordered/received/installed

**No inline editing in list.**

---

## 6. Lifecycle Display Mapping

| `commitment_status` | Display Label |
|---------------------|---------------|
| `planned` | NEEDS TO ORDER |
| `ordered` | ORDERED |
| `partially_received` | IN PROGRESS |
| `partially_installed` | IN PROGRESS |
| `received` | RECEIVED |
| `installed` | INSTALLED |
| `cancelled` | CANCELLED (hidden by default) |
| `closed` | CLOSED (hidden by default) |

Toggle: "Show Closed / Cancelled" (default OFF)

---

## 7. Pricing Integrity Display

| Condition | Render |
|-----------|--------|
| `status = 'ok'` | **NOTHING** |
| `status != 'ok'` | Compact monochrome badge |

### Allowed Labels
- MISSING COST
- MISSING RETAIL
- NEGATIVE MARGIN
- ESTIMATED COST
- RETAIL OVERRIDDEN
- COST/RETAIL MISMATCH

**No green badges. No success indicators.**

---

## 8. Grouping System (Hard Limit)

### Primary Group Options
- Project
- Vendor
- Category
- Lifecycle Status
- None

### Sub-Group Options
- Vendor
- Category
- Status

**Maximum 2 grouping levels only.**
**NEVER triple nesting.**

### Sorting (persisted per user)
- Most Recent
- In Stock Asc/Desc
- Cost Asc/Desc
- Retail Asc/Desc
- Status

---

## 9. Mobile Layout Contract

Replace tables with expandable industrial cards.

### Collapsed Card Shows
- Part Name (clickable)
- Stock / Reserved / Need
- Cost (formatted)
- Retail (formatted)
- Lifecycle display
- Vendor
- Payment Status
- Coverage Indicator
- Pricing warning (if exists)

### Expanded Section Shows
- Exact lifecycle state
- Quantity breakdown
- Pricing details
- Notes
- Actions

**No horizontal scroll tables on mobile.**

---

## 10. Interaction Stability (Button Contract)

All mutation buttons MUST:
1. Disable immediately on click
2. Show inline loading state
3. Prevent double execution
4. Await backend confirmation
5. Show inline error if failed
6. **Never silently fail**

**No optimistic lifecycle transitions.**

```jsx
import MutationButton from '@/components/supply/MutationButton';

<MutationButton
  onClick={handleAction}
  onSuccess={() => refetch()}
  loadingText="Processing..."
>
  Confirm
</MutationButton>
```

---

## 11. Supply Queue Logic

Supply Queue contains only:

### Section A: Needs to Order
- Condition: `commitment_status = 'planned'`

### Section B: Awaiting Payment
- Condition: `commitment_status = 'ordered' AND billing_status = 'billable'`

**No pricing-based filtering.**
**No deep grouping.**

---

## Component Index

| Component | Purpose |
|-----------|---------|
| `lifecycleDisplay.js` | Status mapping utilities |
| `pricingHelpers.js` | `formatCurrencyUSD` function |
| `PricingIntegrityBadge.jsx` | Warning-only pricing badge |
| `MobileCommitmentCard.jsx` | Mobile expandable card |
| `MutationButton.jsx` | Interaction stability layer |
| `SupplyRowData.jsx` | Desktop row + mobile card |
| `SupplyGroupingControls.jsx` | 2-level grouping + sorting |

---

## Files Modified

- `pages/ProjectSupplyManager.jsx` - Full contract implementation
- `pages/SupplyQueueSimplified.jsx` - Two-section queue
- `components/supply/MobileCommitmentCard.jsx` - Mobile card
- `components/supply/SupplyRowData.jsx` - Desktop/Mobile data row
- `components/supply/SupplyGroupingControls.jsx` - Grouping controls
- `components/supply/PricingIntegrityBadge.jsx` - Warning-only badge
- `components/supply/pricingHelpers.js` - formatCurrencyUSD
- `components/parts/CommitmentCard.jsx` - Industrial display status