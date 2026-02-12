import React, { createContext, useContext } from 'react';
import { useTaskInteraction } from './useTaskInteraction';
import PriorityRemoveConfirm from './PriorityRemoveConfirm';
import DeleteTaskConfirm from './DeleteTaskConfirm';

/**
 * TaskInteractionContext - Provider for task interaction state
 * 
 * Wraps:
 * - Project Detail
 * - Priority Dashboard
 * - Client Portal Task Views
 * 
 * Provides centralized:
 * - Task mutations
 * - Confirmation dialogs
 * - Drawer state
 */

const TaskInteractionContext = createContext(null);

export function useTaskInteractionContext() {
  const context = useContext(TaskInteractionContext);
  if (!context) {
    console.warn('useTaskInteractionContext must be used within TaskInteractionProvider');
    return null;
  }
  return context;
}

export function TaskInteractionProvider({ 
  children, 
  projectId = null, 
  priorityOnly = false,
  onTaskDeleted,
}) {
  const interaction = useTaskInteraction({ projectId, priorityOnly });

  const [pendingDelete, setPendingDelete] = React.useState(null);

  const handleDeleteRequest = (task) => {
    setPendingDelete(task);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await interaction.deleteTask(pendingDelete.id);
    setPendingDelete(null);
    onTaskDeleted?.(pendingDelete);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  const value = {
    ...interaction,
    requestDelete: handleDeleteRequest,
  };

  return (
    <TaskInteractionContext.Provider value={value}>
      {children}

      {/* Priority Removal Confirmation - Global */}
      <PriorityRemoveConfirm
        isOpen={!!interaction.pendingPriorityRemoval}
        onClose={interaction.cancelPriorityRemoval}
        onConfirm={interaction.confirmRemovePriority}
        taskName={interaction.pendingPriorityRemoval?.name}
        isLoading={interaction.isUpdating}
      />

      {/* Delete Confirmation - Global */}
      <DeleteTaskConfirm
        isOpen={!!pendingDelete}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        taskName={pendingDelete?.name}
        isLoading={interaction.isDeleting}
      />
    </TaskInteractionContext.Provider>
  );
}

export default TaskInteractionProvider;