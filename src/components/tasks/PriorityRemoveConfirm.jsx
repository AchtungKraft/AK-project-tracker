import React from "react";
import ResponsiveConfirmDialog from "@/components/ui/ResponsiveConfirmDialog";

/**
 * PriorityRemoveConfirm
 * Confirmation dialog for removing priority from a task
 * Uses ResponsiveConfirmDialog for mobile/desktop support
 */
export default function PriorityRemoveConfirm({ 
  isOpen, 
  onClose, 
  onConfirm, 
  taskName,
  isLoading = false,
}) {
  return (
    <ResponsiveConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Remove Priority?"
      message={`Remove priority from "${taskName || 'this task'}"? This task will no longer appear in the Priority Dashboard.`}
      confirmLabel={isLoading ? 'Removing...' : 'Remove Priority'}
      cancelLabel="Cancel"
      confirmVariant="danger"
      isLoading={isLoading}
    />
  );
}