// Financial Status Components - Phase 3.2 + 3.3 + Phase 4 + Phase 6 + Phase 9.6
export { default as FinancialStatusBadge, ClientBillingBadge, VendorStatusBadge, MarginStateBadge, FinancialDrilldown } from './FinancialStatusBadge';
export { default as FinancialStatusFilters, BillingStatusFilter, VendorPaymentFilter, MarginStateFilter, FinancialRoleFilter, applyFinancialFilters } from './FinancialStatusFilters';
export { useFinancialStatus, useFinancialStatusBatch, buildFinancialContexts, mergeFinancialStatus } from './useFinancialStatus';
export { default as FinancialDetailDrawer } from './FinancialDetailDrawer';
export { default as ProjectFinancialWarningBanner } from './ProjectFinancialWarningBanner';
export { default as ProjectFinancialSummaryWidget } from './ProjectFinancialSummaryWidget';
export { default as InvoiceWorkbench } from './InvoiceWorkbench';

// Phase 9.6 - Invoice Confidence UX + Payment Safety
export { default as InvoiceBatchPreviewModal } from './InvoiceBatchPreviewModal';
export { default as InvoiceBatchSuccessDrawer } from './InvoiceBatchSuccessDrawer';
export { default as InvoiceConfidencePanel } from './InvoiceConfidencePanel';
export { default as InvoiceAgingBadge, getAgingCategory } from './InvoiceAgingBadge';
export { default as ConfirmPaymentModal } from './ConfirmPaymentModal';
export { default as ConfirmPaymentReversalModal } from './ConfirmPaymentReversalModal';
export { default as PaymentConfidenceBadge, derivePaymentConfidence } from './PaymentConfidenceBadge';
export { default as PaymentTimeline, PaymentTimelineCompact } from './PaymentTimeline';

// Pool & Commitment Management Components
export { default as PoolPanel } from './PoolPanel';
export { default as PoolDetailView } from './PoolDetailView';
export { default as CoverageBadge } from './CoverageBadge';
export { default as ProjectFinancialDashboard } from './ProjectFinancialDashboard';
export { 
  isProtectedEntity, 
  isSensitiveField, 
  isSafeField,
  validateUpdate,
  validateDelete,
  guardedUpdate,
  guardedDelete,
  commitmentAction,
  CommitmentActions
} from './financialMutationGuard';

// Note: FinancialExceptionDashboard is a page at pages/FinancialExceptionDashboard.jsx
// Note: ProjectFinancialReport is a page at pages/ProjectFinancialReport.jsx
// Backend functions: getFinancialExceptions, getInvoiceReadyItems, createInvoiceBatch, exportInvoiceBatchToQuickBooks, updatePaymentStatus, voidInvoiceBatch
// Entities: InvoiceBatch, InvoiceBatchLine