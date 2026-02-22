# AK Industrial Mode - Supply & Commitment UI Simplification

## Overview

This document defines the minimal industrial UX rules for the AK supply chain interface.

---

## 1. Lifecycle Display Rules

### Display Status Mapping

| `commitment_status` | `display_status` |
|---------------------|------------------|
| `planned` | NEEDS TO ORDER |
| `ordered` | ORDERED |
| `partially_received` | IN PROGRESS |
| `partially_installed` | IN PROGRESS |
| `received` | RECEIVED |
| `installed` | INSTALLED |
| `cancelled` | CANCELLED (hidden by default) |
| `closed` | CLOSED (hidden by default) |

### Show/Hide Toggle

- **Default**: OFF (hide Closed/Cancelled)
- **Toggle**: "Show Closed / Cancelled"
- Only active commitments render by default

### Implementation

```js
import { getDisplayStatus, filterActiveCommitments, isHiddenByDefault } from '@/components/supply/lifecycleDisplay';

const displayStatus = getDisplayStatus(commitment.commitment_status);
const activeCommitments = filterActiveCommitments(commitments, showClosedCancelled);
```

---

## 2. Supply Queue Structure

### Section A: Needs to Order
- **Condition**: `commitment_status = 'planned'`

### Section B: Awaiting Payment
- **Condition**: `commitment_status = 'ordered' AND payment_status = 'unpaid'`

### Grouping
- **Max depth**: 2 levels
- **Options**: Project > Vendor OR Project > Category
- **NO** triple nesting
- **NO** pricing integrity filtering

---

## 3. Pricing Integrity Display

### Core Rule
- If `pricing_integrity_status = 'ok'` → **Render NOTHING**
- If `pricing_integrity_status != 'ok'` → Render compact badge

### Badge Style
- Small
- Uppercase
- Monochrome (no bright colors)
- Left border accent only (subtle red or amber)

### Badge Labels

| Status | Label |
|--------|-------|
| `missing_cost` | MISSING COST |
| `missing_retail` | MISSING RETAIL |
| `margin_negative` | NEGATIVE MARGIN |
| `estimated_cost` | ESTIMATED COST |
| `overridden_retail` | RETAIL OVERRIDDEN |
| `cost_retail_mismatch` | COST/RETAIL MISMATCH |

### Implementation

```jsx
import PricingIntegrityBadge from '@/components/supply/PricingIntegrityBadge';

// Only renders if status != 'ok'
<PricingIntegrityBadge commitment={commitment} />
```

---

## 4. Mobile Commitment Card

### Collapsed View
- Part Name (clickable → opens Edit Part Drawer)
- Inventory Status
- Cost
- Retail
- Display Status
- Vendor
- Payment Status
- Pricing Warning Badge (if exists)

### Expanded View (tap to expand)
- Exact `commitment_status`
- Quantity Ordered
- Quantity Received
- Quantity Installed
- Pricing details
- Margin calculation

### Implementation

```jsx
import MobileCommitmentCard from '@/components/supply/MobileCommitmentCard';

<MobileCommitmentCard
  commitment={commitment}
  part={part}
  vendor={vendor}
  onPartClick={handlePartClick}
/>
```

---

## 5. Mutation Button Contract

### Interaction Stability Rules

All mutation buttons must:
1. **Disable immediately** on click
2. **Show loading indicator** inline
3. **Prevent double execution**
4. **Re-enable only** on success/error
5. **NO optimistic transitions**
6. **Always await** backend confirmation

### Error Handling
- Show **inline error banner** inside row
- Do **not** silently fail

### Implementation

```jsx
import MutationButton from '@/components/supply/MutationButton';

<MutationButton
  onClick={handleAction}
  onSuccess={() => refetch()}
  onError={(err) => console.error(err)}
  loadingText="Processing..."
>
  Confirm
</MutationButton>
```

---

## 6. Modal Behavior

### Part Name Click
- **Always** opens Edit Part Drawer
- **Never** triggers navigation

### Drawer Must Display
- Full lifecycle state
- Full pricing integrity status
- RetailAdjustmentRequest indicator (if exists)

---

## 7. Visual Design Constraints

### DO
- Minimal industrial aesthetic
- Tight spacing
- Neutral palette (grays, subtle accents)
- Clear hierarchy
- Monospace fonts for data
- Functional over decorative

### DO NOT
- Bright UI colors
- Emoji icons
- Celebratory states
- Green success badges
- Multiple pricing badges
- Lifecycle duplication

---

## 8. Anti-Patterns Removed

| Anti-Pattern | Replacement |
|--------------|-------------|
| Deep nested grouping | Max 2-level grouping |
| Multiple pricing badges | Single warning badge |
| Green OK indicators | No badge when OK |
| Lifecycle in list AND badge | Single display_status only |
| Overloaded supply logic | Two-section queue |
| Implicit mutation triggers | Explicit MutationButton |

---

## Component Index

| Component | Purpose |
|-----------|---------|
| `lifecycleDisplay.js` | Status mapping utilities |
| `PricingIntegrityBadge.jsx` | Warning-only pricing badge |
| `MobileCommitmentCard.jsx` | Mobile expandable card |
| `MutationButton.jsx` | Interaction stability layer |
| `SupplyQueueSimplified.jsx` | Two-section queue page |

---

## Files Modified

- `components/parts/PricingBadge.jsx` - Removed OK/MATRIX badges
- `components/parts/PartsListView.jsx` - Simplified pricing columns
- `components/parts/CommitmentCard.jsx` - Industrial display status
- `components/supply/SupplyIntegrityBanner.jsx` - Removed success badge