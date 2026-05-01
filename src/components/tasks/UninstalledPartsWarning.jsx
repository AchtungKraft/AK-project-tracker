import React from "react";
import ResponsiveConfirmDialog from "@/components/ui/ResponsiveConfirmDialog";

/**
 * UninstalledPartsWarning
 * 
 * Warning dialog shown when completing a task that has uninstalled parts.
 * Does NOT trigger installs — just warns the user.
 */
export default function UninstalledPartsWarning({
  isOpen,
  onClose,
  onConfirm,
  taskName,
  uninstalledCount = 0,
  isLoading = false,
}) {
  return (
    <ResponsiveConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Uninstalled Parts"
      message={`This task has ${uninstalledCount} uninstalled part${uninstalledCount === 1 ? '' : 's'}. Complete task anyway?`}
      confirmLabel="Complete Task"
      cancelLabel="Cancel"
      confirmVariant="primary"
      isLoading={isLoading}
    />
  );
}