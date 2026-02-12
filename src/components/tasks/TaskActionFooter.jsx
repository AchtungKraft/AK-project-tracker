import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/components/mobile/useIsMobile';

/**
 * TaskActionFooter - Standard footer for ALL task modals and drawers
 * 
 * ENFORCEMENT RULE: All task modals and drawers MUST import this component.
 * 
 * Layout:
 * - Desktop: DELETE ICON | CLOSE | PRIMARY BUTTON
 * - Mobile: Same layout, optimized for touch (min 44px targets)
 */
export default function TaskActionFooter({
  mode = 'view', // 'view' | 'edit'
  onEdit,
  onSave,
  onClose,
  onDelete,
  onCancel,
  isSaving = false,
  isDeleting = false,
  saveLabel = 'Save',
  editLabel = 'Edit Task',
  closeLabel = 'Close',
  className,
}) {
  const isMobile = useIsMobile();

  return (
    <div 
      className={cn(
        "sticky bottom-0 left-0 right-0 bg-gray-900 border-t border-red-900/30",
        className
      )}
      style={{
        padding: isMobile ? '12px 16px' : '16px',
        paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : '16px',
      }}
    >
      <div className="flex gap-2 items-center">
        {/* DELETE - icon button with confirm */}
        {onDelete && (
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleting || isSaving}
            className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 text-red-400 hover:text-red-300 hover:bg-red-950/30"
            aria-label="Delete task"
          >
            {isDeleting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </Button>
        )}

        {/* CLOSE */}
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-11 min-h-[44px] border-gray-700"
          disabled={isSaving}
        >
          {closeLabel}
        </Button>

        {/* EDIT/SAVE primary action */}
        {mode === 'edit' ? (
          <>
            {onCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="h-11 min-h-[44px] px-4 border-gray-700"
                disabled={isSaving}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={onSave}
              disabled={isSaving}
              className="flex-1 h-11 min-h-[44px] bg-red-600 hover:bg-red-700"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {saveLabel}
                </>
              )}
            </Button>
          </>
        ) : (
          onEdit && (
            <Button
              onClick={onEdit}
              className="flex-1 h-11 min-h-[44px] bg-red-600 hover:bg-red-700"
            >
              {editLabel}
            </Button>
          )
        )}
      </div>
    </div>
  );
}