import React from "react";
import BillingOpportunityCard from "../invoices/BillingOpportunityCard";
import ProjectInvoicesPanel from "../invoices/ProjectInvoicesPanel";
import FinancialInvoiceSummary from "../FinancialInvoiceSummary";
import ProjectDepositsSection from "../deposits/ProjectDepositsSection";
import QuickBooksExportsPanel from "../qbExports/QuickBooksExportsPanel";

// Invoices & Payments: what can be billed, the invoice list with all invoice/payment actions, and totals by status.
export default function InvoicesPaymentsArea({ projectId, data }) {
  return (
    <div className="space-y-3">
      <BillingOpportunityCard p={data.position} />
      <ProjectDepositsSection projectId={projectId} />
      <ProjectInvoicesPanel projectId={projectId} history={data.authorization.cancelled_history} />
      <FinancialInvoiceSummary invoices={data.invoices} summary={data.summary} />
      <QuickBooksExportsPanel projectId={projectId} />
    </div>
  );
}