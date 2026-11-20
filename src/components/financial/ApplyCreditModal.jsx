import React from "react";
import ApplyDepositDialog from "@/components/project/financials/deposits/ApplyDepositDialog";

/**
 * ApplyCreditModal — applies GENERAL project credit (part removals, adjustments) through the secured
 * projectDepositAction (sources 'general'). Deposit credit is applied separately with Apply Available Deposit;
 * the two are never combined. Parts settlement without an invoice stays in SettlePartsWithCreditModal.
 */
export default function ApplyCreditModal({ open, onClose, projectId, onSuccess }) {
  return (
    <ApplyDepositDialog
      open={!!open}
      onOpenChange={(o) => !o && onClose?.()}
      projectId={projectId ? String(projectId) : null}
      sources="general"
      onDone={(r) => onSuccess?.(r)}
    />
  );
}