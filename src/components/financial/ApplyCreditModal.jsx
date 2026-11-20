import React from "react";
import ApplyDepositDialog from "@/components/project/financials/deposits/ApplyDepositDialog";

/**
 * ApplyCreditModal — now a thin wrapper over the secured Apply dialog (projectDepositAction, sources 'all').
 * The old manual allocator (applyProjectCreditManual) was retired: it could spend the same credit twice under
 * concurrent use. Parts settlement without an invoice stays in SettlePartsWithCreditModal.
 */
export default function ApplyCreditModal({ open, onClose, projectId, onSuccess }) {
  return (
    <ApplyDepositDialog
      open={!!open}
      onOpenChange={(o) => !o && onClose?.()}
      projectId={projectId ? String(projectId) : null}
      sources="all"
      onDone={(r) => onSuccess?.(r)}
    />
  );
}