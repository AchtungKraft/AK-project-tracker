# PROJECT INVOICE VERIFICATION REPORT
## Forward Financial Model - Deposit / Progress / Final Billing

**Generated:** 2026-02-22  
**Status:** PHASE 1-4 IMPLEMENTATION COMPLETE

---

## ENTITIES CREATED

### ProjectInvoice
- `project_id` (required)
- `invoice_type`: deposit | progress | final
- `status`: draft | sent | paid (default: draft)
- `qb_invoice_number` (nullable)
- `issue_date`, `due_date`, `payment_date` (nullable dates)
- `subtotal`, `credit_applied`, `total`, `balance_due` (numbers)
- `notes` (nullable)

### ProjectInvoiceLine
- `invoice_id` (required)
- `type`: part | outside_cost | manual
- `part_commitment_id` (nullable - for part lines)
- `description` (required)
- `qty`, `unit_price`, `line_total`

### ProjectCreditLedger
- `project_id` (required)
- `source_invoice_id` (required)
- `credit_amount`, `remaining_amount`

### PartCommitment (UPDATED)
- `invoiced_qty` (number, default 0) - NEW
- `invoiced_amount` (number, default 0) - NEW
- `billed_qty_total` (legacy, kept)
- `billed_amount_total` (legacy, kept)

---

## FUNCTIONS CREATED

### createProjectInvoiceDraft
- Creates draft invoice with lines
- Computes subtotal from line_totals
- Applies credit if `apply_credit=true`
- Does NOT mutate billing_status in PartCommitment
- Returns: invoice_id, totals, applied_credit_detail, warnings[]

### updateInvoiceDraft
- Updates draft invoice lines and notes
- Recomputes totals and credit application
- Draft status only

### markInvoiceSent
- Transitions draft → sent
- Requires: qb_invoice_number, issue_date, due_date
- Updates PartCommitment.invoiced_qty and invoiced_amount for part lines
- Deducts applied credits from ProjectCreditLedger

### markInvoicePaid
- Transitions sent → paid
- Requires: payment_date
- Optional: paid_amount (default balance_due)
- Creates ProjectCreditLedger entry on overpayment

### getProjectInvoicesView
- Returns invoices with flags: overdue, missing_qb_fields
- Returns credit balances per project
- Returns summary stats

---

## UI COMPONENTS CREATED

### pages/ProjectInvoices.jsx
- Global invoice management page
- Tabs: Draft / Sent / Paid
- Filters: Project, search
- Summary cards: Draft, Sent, Paid, Overdue counts
- Table: Project | Type | QB# | Subtotal | Credit | Balance | Due | Flags

### components/financial/CreateProjectInvoiceModal.jsx
- Step 1: Select Project
- Step 2: Select invoice_type
- Step 3: Add Lines (parts from remaining to bill, manual lines)
- Step 4: Review with credit toggle

### components/financial/ProjectInvoiceDetailDrawer.jsx
- Shows invoice details and lines
- Actions: Export CSV, Mark Sent, Mark Paid
- Handles overpayment credit creation

### components/financial/BillingSummaryStrip.jsx
- Compact strip for ProjectSupplyManager
- Shows: Remaining to Bill, Credit Balance, Link to invoices

---

## VERIFICATION CHECKLIST

### Create Draft Invoice End-to-End
- [ ] Select project
- [ ] Choose invoice type (deposit/progress/final)
- [ ] Add part lines from remaining to bill
- [ ] Add manual/outside cost lines
- [ ] Toggle credit application
- [ ] Save draft creates ProjectInvoice + ProjectInvoiceLine records

### Mark Sent Updates Correctly
- [ ] Draft → Sent transition
- [ ] qb_invoice_number, issue_date, due_date required
- [ ] PartCommitment.invoiced_qty += line.qty
- [ ] PartCommitment.invoiced_amount += line.line_total
- [ ] Credit deducted from ProjectCreditLedger

### Mark Paid Creates Credit on Overage
- [ ] Sent → Paid transition
- [ ] payment_date required
- [ ] paid_amount > balance_due creates credit
- [ ] ProjectCreditLedger entry with overage amount

### Credit Applies to Next Invoice
- [ ] New invoice draft detects available credit
- [ ] Credit applied up to subtotal
- [ ] Multiple credits consumed FIFO

### Export CSV
- [ ] Contains invoice header info
- [ ] Contains line items with qty/price/total
- [ ] Contains summary (subtotal, credit, balance)

### No Lifecycle Leakage
- [ ] Invoice pages do NOT inspect commitment_status
- [ ] Invoice pages do NOT inspect coverage_status
- [ ] Invoice pages do NOT inspect inventory fields
- [ ] Only use: invoiced_qty, invoiced_amount, unit_retail_snapshot

---

## SAFETY RULES COMPLIANCE

✅ Did NOT delete or repurpose existing billing_status flows
✅ Did NOT change supply lifecycle rules
✅ Built new invoice domain in parallel
✅ Only reads from commitments for selection
✅ Money formatting uses $XXX,XXX.00 (formatCurrencyUSD)
✅ Warning-only badges (show nothing if OK)

---

## NAVIGATION

- Layout.js updated with "Project Invoices" nav item (Receipt icon)
- PSM has BillingSummaryStrip with link to Project Invoices

---

## REMAINING WORK

1. Run E2E test: create draft → send → pay with overage
2. Verify credit balance flows correctly
3. Test CSV export format
4. Add date range filters to ProjectInvoices page (optional)