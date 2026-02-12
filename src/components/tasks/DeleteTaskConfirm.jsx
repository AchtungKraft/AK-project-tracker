import React from "react";
import ResponsiveConfirmDialog from "@/components/ui/ResponsiveConfirmDialog";

/**
 * DeleteTaskConfirm
 * Confirmation dialog for deleting a task
 * Uses ResponsiveConfirmDialog for mobile/desktop support
 */
export default function DeleteTaskConfirm({ 
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
      title="Delete Task?"
      message={`Delete "${taskName || 'this task'}"? This action cannot be undone.`}
      confirmLabel={isLoading ? 'Deleting...' : 'Delete Task'}
      cancelLabel="Cancel"
      confirmVariant="danger"
      isLoading={isLoading}
    />
  );
}