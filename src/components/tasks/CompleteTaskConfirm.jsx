import React from "react";
import ResponsiveConfirmDialog from "@/components/ui/ResponsiveConfirmDialog";

/**
 * CompleteTaskConfirm
 * 
 * Confirmation dialog for marking a task as complete.
 * Uses ResponsiveConfirmDialog for mobile/desktop support.
 */
export default function CompleteTaskConfirm({
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
      title="Mark Task Complete?"
      message={`Mark '${taskName || 'this task'}' as completed? This will move the task into the Completed Tasks section.`}
      confirmLabel="Complete Task"
      cancelLabel="Cancel"
      confirmVariant="primary"
      isLoading={isLoading}
    />
  );
}