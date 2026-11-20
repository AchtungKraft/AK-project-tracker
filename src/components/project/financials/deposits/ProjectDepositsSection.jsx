import React, { useState } from "react";
import { Loader2, FilePlus, Landmark, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateProjectInvoiceModal from "@/components/financial/CreateProjectInvoiceModal";
import RecordPaymentDialog from "@/components/financial/payments/RecordPaymentDialog";
import DepositTotals from "./DepositTotals";
import DepositList from "./DepositList";
import DepositHistory from "./DepositHistory";
import ApplyDepositDialog from "./ApplyDepositDialog";
import RecordExistingDepositDialog from "./RecordExistingDepositDialog";
import RefundDepositDialog from "./RefundDepositDialog";
import ReverseDepositDialog from "./ReverseDepositDialog";
import QbConfirmDialog from "./QbConfirmDialog";
import QbCorrectDialog from "./QbCorrectDialog";
import QbCorrectionLog from "./QbCorrectionLog";
import { useDepositRefresh, useProjectDeposits } from "./useProjectDeposits";

// Project Deposits: client down payments as a running credit balance, drawn against later invoices.
export default function ProjectDepositsSection({ projectId }) {
  const { data, isLoading } = useProjectDeposits(projectId);
  const refresh = useDepositRefresh(projectId);
  const [dialog, setDialog] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [refundFor, setRefundFor] = useState(null);
  const [reverseFor, setReverseFor] = useState(null);
  const [qbFor, setQbFor] = useState(null);
  const [fixFor, setFixFor] = useState(null);

  return (
    <div className="space-y-3 rounded-lg border border-emerald-900/40 bg-black/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto"><div className="text-sm font-semibold text-white">Project deposits</div><div className="text-xs text-gray-500">Client funding held as credit. Not earned revenue.</div></div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setDialog("create")}><FilePlus className="w-4 h-4 mr-1" />Create Deposit Invoice</Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setDialog("existing")}><Landmark className="w-4 h-4 mr-1" />Record Existing Down Payment</Button>
        <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700" disabled={!(data?.totals?.available_to_apply > 0)} onClick={() => setDialog("apply")}><ArrowDownToLine className="w-4 h-4 mr-1" />Apply Available Deposit</Button>
      </div>
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
        : !data?.success ? <p className="text-sm text-red-400">Could not load deposits: {data?.error}</p>
        : <>
          <DepositTotals t={data.totals} />
          <DepositList deposits={data.deposits} onRecordPayment={setPayFor} onRefund={setRefundFor} onQb={setQbFor} onCorrect={setFixFor} />
          <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Deposit history</div>
          <DepositHistory history={data.history} onReverse={setReverseFor} onQb={setQbFor} onCorrect={setFixFor} />
          <QbCorrectionLog items={data.qb_corrections} />
        </>}
      {dialog === "create" && <CreateProjectInvoiceModal open preselectedProjectId={projectId} initialInvoiceType="deposit" onClose={() => setDialog(null)} onSuccess={() => { setDialog(null); refresh(); }} onOpenDraft={() => setDialog(null)} />}
      <RecordExistingDepositDialog open={dialog === "existing"} onOpenChange={(o) => !o && setDialog(null)} projectId={projectId} />
      <ApplyDepositDialog open={dialog === "apply"} onOpenChange={(o) => !o && setDialog(null)} projectId={projectId} />
      <RecordPaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} invoice={payFor && { id: payFor.invoice_id, subtotal: payFor.invoiced, credit_applied: 0, paid_amount: payFor.received }} onRecorded={refresh} />
      <RefundDepositDialog deposit={refundFor} onOpenChange={(o) => !o && setRefundFor(null)} projectId={projectId} />
      <ReverseDepositDialog entry={reverseFor} onOpenChange={(o) => !o && setReverseFor(null)} projectId={projectId} />
      <QbConfirmDialog target={qbFor} onOpenChange={(o) => !o && setQbFor(null)} projectId={projectId} />
      <QbCorrectDialog target={fixFor} onOpenChange={(o) => !o && setFixFor(null)} projectId={projectId} />
    </div>
  );
}