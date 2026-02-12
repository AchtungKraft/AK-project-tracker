import React from 'react';
import { useIsMobile } from './useIsMobile';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * MobileModalWrapper
 * Fixes modal height overflow, hidden close buttons, and bottom-nav conflicts on mobile.
 * Desktop retains existing modal styling passed through children.
 */
export default function MobileModalWrapper({ 
  children, 
  title,
  description,
  footer,
  onClose,
  showCloseButton = true,
  className = ''
}) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div 
      className={`mobile-modal-wrapper ${className}`}
      style={{
        height: '100dvh',
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Sticky Header */}
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-900 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {title && (
              <DialogHeader className="p-0 space-y-1">
                <DialogTitle className="text-lg font-semibold text-white pr-8">{title}</DialogTitle>
                {description && (
                  <DialogDescription className="text-sm text-gray-400">{description}</DialogDescription>
                )}
              </DialogHeader>
            )}
          </div>
          {showCloseButton && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 flex-shrink-0 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div 
        className="flex-1 overflow-y-auto"
        style={{
          padding: '16px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>

      {/* Sticky Footer */}
      {footer && (
        <div 
          className="flex-shrink-0 border-t border-gray-700 bg-gray-900"
          style={{
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * MobileModalBody - Wrapper for modal body content with proper scrolling
 */
export function MobileModalBody({ children, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * MobileModalFooter - Standardized footer layout for mobile modals
 */
export function MobileModalFooter({ children, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {children}
    </div>
  );
}