import React from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileSortDrawer
 * Compact drawer for sort/grouping options on mobile.
 */
export default function MobileSortDrawer({ 
  isOpen, 
  onClose,
  title = 'Sort & Group',
  children,
  className = ''
}) {
  const isMobile = useIsMobile();

  if (!isMobile || !isOpen) return null;

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
          className
        )}
        style={{
          maxHeight: '60dvh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
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

        {/* Content */}
        <div 
          className="overflow-y-auto p-4"
          style={{
            maxHeight: 'calc(60dvh - 60px)',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * MobileSortOption
 * Selectable option row for sort drawer
 */
export function MobileSortOption({ 
  label, 
  value, 
  selected, 
  onSelect,
  icon: Icon,
  className = '' 
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors',
        selected 
          ? 'bg-red-600/20 border border-red-500/50 text-white' 
          : 'bg-gray-800/50 border border-transparent text-gray-300 hover:bg-gray-800',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-5 h-5" />}
        <span>{label}</span>
      </div>
      {selected && <Check className="w-5 h-5 text-red-400" />}
    </button>
  );
}