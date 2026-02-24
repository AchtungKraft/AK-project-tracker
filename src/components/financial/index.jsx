// Financial Status Components - Phase 3.2 + 3.3 + Phase 4 + Phase 6 + Phase 6.2
export { default as FinancialStatusBadge, ClientBillingBadge, VendorStatusBadge, MarginStateBadge, FinancialDrilldown } from './FinancialStatusBadge';
export { default as FinancialStatusFilters, BillingStatusFilter, VendorPaymentFilter, MarginStateFilter, FinancialRoleFilter, applyFinancialFilters } from './FinancialStatusFilters';
export { useFinancialStatus, useFinancialStatusBatch, buildFinancialContexts, mergeFinancialStatus } from './useFinancialStatus';
export { default as FinancialDetailDrawer } from './FinancialDetailDrawer';
export { default as ProjectFinancialWarningBanner } from './ProjectFinancialWarningBanner';
export { default as ProjectFinancialSummaryWidget } from './ProjectFinancialSummaryWidget';
export { default as InvoiceWorkbench } from './InvoiceWorkbench';

// Canonical Financial Snapshot - SINGLE SOURCE OF TRUTH
export { 
  useProjectFinancialSnapshot, 
  useProjectFinancialDiagnostics, 
  formatCanonicalValue, 
  validateTotalsGate 
} from './useProjectFinancialSnapshot';
export { CanonicalFinancialDisplay, FinancialDiagnosticsPanel } from './CanonicalFinancialDisplay';

// Query Key Factories - centralized key management
export { 
  financialSnapshotKeys, 
  billingKeys, 
  invoiceKeys, 
  creditKeys,
  normalizeProjectId,
  normalizeId
} from './queryKeyFactories';

// Billing Drift Diagnostics (Phase 7)
export { default as CommitmentBillingDiagnostics } from './CommitmentBillingDiagnostics';

// Phase 6.2 - Invoice Dashboard + QB Export Status
export { default as InvoiceDashboard } from './InvoiceDashboard';
export { default as QBExportStatusCards, QBNeedsExportCard, QBExportFailedCard } from './QBExportStatusCards';
export { default as POCostReviewCard } from './POCostReviewCard';

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
export { default as ClosePoolModal } from './ClosePoolModal';
export { default as TransferPoolBalanceModal } from './TransferPoolBalanceModal';
export { default as CoverageBadge } from './CoverageBadge';
export { default as ProjectFinancialDashboard } from './ProjectFinancialDashboard';

// Phase 3: Credit Settlement
export { default as SettlePartsWithCreditModal } from './SettlePartsWithCreditModal';
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

// Lifecycle Action Gating
export { 
  getAllowedCommitmentActions, 
  getCommitmentLifecycleState,
  getActionBlockReason 
} from '../lifecycle/getAllowedCommitmentActions';

// Note: FinancialExceptionDashboard is a page at pages/FinancialExceptionDashboard.jsx
// Note: ProjectFinancialReport is a page at pages/ProjectFinancialReport.jsx
// Backend functions: getFinancialExceptions, getInvoiceReadyItems, createInvoiceBatch, exportInvoiceBatchToQuickBooks, updatePaymentStatus, voidInvoiceBatch
// Entities: InvoiceBatch, InvoiceBatchLine