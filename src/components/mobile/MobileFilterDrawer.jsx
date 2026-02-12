import React, { useState, useEffect } from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileFilterDrawer
 * Full-screen bottom sheet drawer for filters on mobile.
 * 90dvh height, scrollable sections, sticky footer with Apply/Clear.
 */
export default function MobileFilterDrawer({ 
  isOpen, 
  onClose, 
  onApply,
  onClear,
  title = 'Filters',
  children,
  className = ''
}) {
  const isMobile = useIsMobile();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Lock background scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Unlock background scroll
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isMobile || !isOpen) return null;

  const handleApply = () => {
    onApply?.();
    onClose();
  };

  const handleClear = () => {
    onClear?.();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={cn(
          'fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-red-900/30 z-[70] rounded-t-2xl',
          'transform transition-transform duration-300 ease-out',
          isAnimating ? 'translate-y-0' : 'translate-y-full',
          className
        )}
        style={{
          height: '90dvh',
          maxHeight: '90dvh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable Content */}
        <div 
          className="flex-1 overflow-y-auto"
          style={{
            height: 'calc(90dvh - 120px)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="p-4 space-y-4">
            {children}
          </div>
        </div>

        {/* Sticky Footer - 56px max */}
        <div 
          className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-4 py-2"
          style={{
            paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClear}
              className="flex-1 h-11 border-gray-600"
            >
              Clear
            </Button>
            <Button
              onClick={handleApply}
              className="flex-1 h-11 bg-red-600 hover:bg-red-700"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * MobileFilterSection
 * Collapsible accordion section for filter groups
 */
export function MobileFilterSection({ 
  title, 
  children, 
  defaultOpen = true,
  badge,
  className = '' 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('border border-gray-700 rounded-lg overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800/50 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-sm">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-xs bg-red-600 text-white rounded-full">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      
      {isOpen && (
        <div className="p-3 bg-gray-900/50">
          {children}
        </div>
      )}
    </div>
  );
}