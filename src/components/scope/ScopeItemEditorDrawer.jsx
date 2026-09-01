import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ScopeItemEditor from "./ScopeItemEditor";

/**
 * Drawer wrapper for the Scope Item editor.
 * Desktop: right-side 580px panel.
 * Mobile: full-screen overlay.
 * Preserves scroll position of the list behind it.
 */
export default function ScopeItemEditorDrawer({
  open,
  onClose,
  mode = "create", // "create" | "edit"
  editItem = null,
  requestId,
  categories,
  groups,
  laborGroups,
  laborEstimates,
  preselectedCategoryId,
  preselectedGroupId,
  onSave,
  isMobile = false,
}) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const title = mode === "edit" ? "Edit Scope Item" : "Add Scope Item";
  const subtitle = mode === "edit" 
    ? editItem?.title || "" 
    : [
        categories?.find(c => c.id === preselectedCategoryId)?.name,
        groups?.find(g => g.id === preselectedGroupId)?.name,
      ].filter(Boolean).join(" / ") || "Select category & group";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />

      {/* Drawer Panel */}
      <div className={cn(
        "fixed top-0 right-0 bottom-0 z-[70] flex flex-col bg-gray-900 border-l border-gray-700/50",
        isMobile ? "left-0" : "w-[580px]"
      )}>
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-gray-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body — scrollable, contains the existing ScopeItemEditor */}
        <div className="flex-1 overflow-y-auto">
          <ScopeItemEditor
            requestId={requestId}
            categories={categories}
            groups={groups}
            laborGroups={laborGroups}
            laborEstimates={mode === "edit" ? laborEstimates : []}
            editItem={mode === "edit" ? editItem : null}
            preselectedCategoryId={preselectedCategoryId}
            preselectedGroupId={preselectedGroupId}
            onSave={onSave}
            onCancel={onClose}
            isMobile={isMobile}
            insideDrawer={true}
          />
        </div>
      </div>
    </>
  );
}