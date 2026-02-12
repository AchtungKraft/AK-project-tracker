import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * ResponsiveConfirmDialog
 * 
 * Single source wrapper for ALL confirmation dialogs.
 * 
 * MOBILE (<768px): Bottom sheet modal
 * DESKTOP: Centered dialog modal
 * 
 * Features:
 * - Keyboard trap
 * - ESC to close
 * - Backdrop tap to close
 * - Background scroll lock
 * - Safe area support
 * - Portal mounting to document.body
 */

// Global registry to prevent multiple confirms
let activeDialogCount = 0;

export default function ResponsiveConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger", // "danger" | "primary" | "warning"
  isLoading = false,
  children, // Optional custom content instead of message
}) {
  const isMobile = useIsMobile();
  const dialogRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Prevent multiple dialogs
  useEffect(() => {
    if (isOpen) {
      activeDialogCount++;
      previousActiveElement.current = document.activeElement;
      
      // Lock background scroll
      document.body.style.overflow = 'hidden';
      
      // Focus dialog
      setTimeout(() => dialogRef.current?.focus(), 0);
    }
    
    return () => {
      if (isOpen) {
        activeDialogCount--;
        if (activeDialogCount === 0) {
          document.body.style.overflow = '';
        }
        previousActiveElement.current?.focus();
      }
    };
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      
      // Trap focus within dialog
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getConfirmButtonClass = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'primary':
      default:
        return 'bg-red-600 hover:bg-red-700 text-white';
    }
  };

  const dialogContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Dialog Container */}
      {isMobile ? (
        // MOBILE: Bottom sheet
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={cn(
            "absolute bottom-0 left-0 right-0",
            "bg-gray-900 border-t border-red-900/30",
            "rounded-t-2xl shadow-2xl",
            "max-h-[70vh] overflow-y-auto",
            "animate-in slide-in-from-bottom duration-300"
          )}
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          }}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-600 rounded-full" />
          </div>
          
          {/* Content */}
          <div className="px-5 pb-4">
            <h2 
              id="confirm-dialog-title"
              className="text-lg font-semibold text-white mb-2"
            >
              {title}
            </h2>
            
            {children || (
              <p className="text-gray-300 text-sm leading-relaxed">
                {message}
              </p>
            )}
          </div>
          
          {/* Sticky Footer */}
          <div 
            className="sticky bottom-0 px-5 py-4 bg-gray-900 border-t border-gray-800 flex gap-3"
            style={{
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 h-12 border-gray-700 text-white"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className={cn("flex-1 h-12", getConfirmButtonClass())}
            >
              {isLoading ? "..." : confirmLabel}
            </Button>
          </div>
        </div>
      ) : (
        // DESKTOP: Centered modal
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={cn(
            "relative z-10 w-full max-w-md mx-4",
            "bg-gray-900 border border-red-900/30 rounded-xl shadow-2xl",
            "animate-in zoom-in-95 duration-200"
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          
          {/* Content */}
          <div className="p-6">
            <h2 
              id="confirm-dialog-title"
              className="text-lg font-semibold text-white mb-3 pr-8"
            >
              {title}
            </h2>
            
            {children || (
              <p className="text-gray-300 text-sm leading-relaxed">
                {message}
              </p>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-6 py-4 bg-gray-800/50 border-t border-gray-800 rounded-b-xl flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="border-gray-700 text-white"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isLoading}
              className={getConfirmButtonClass()}
            >
              {isLoading ? "..." : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // Portal to document.body to avoid positioning issues
  return createPortal(dialogContent, document.body);
}