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
  incompleteChecklistCount = 0,
}) {
  const title = incompleteChecklistCount > 0
    ? "Incomplete Checklist Items"
    : "Mark Task Complete?";

  const message = incompleteChecklistCount > 0
    ? `This task has ${incompleteChecklistCount} incomplete checklist item${incompleteChecklistCount === 1 ? '' : 's'}. Complete task anyway?`
    : `Mark '${taskName || 'this task'}' as completed? This will move the task into the Completed Tasks section.`;

  return (
    <ResponsiveConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      message={message}
      confirmLabel="Complete Task"
      cancelLabel="Cancel"
      confirmVariant="primary"
      isLoading={isLoading}
    />
  );
}