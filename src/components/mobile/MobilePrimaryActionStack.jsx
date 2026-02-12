import React from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * MobilePrimaryActionStack
 * Reduces decision friction and improves one-handed usability on mobile.
 * Desktop retains original horizontal button layout.
 * 
 * Props:
 * - primaryAction: { label, onClick, icon, variant, disabled, loading }
 * - secondaryActions: [{ label, onClick, icon, variant, disabled }] (max 2)
 * - desktopLayout: 'horizontal' | 'vertical' (default: 'horizontal')
 */
export default function MobilePrimaryActionStack({ 
  primaryAction,
  secondaryActions = [],
  desktopLayout = 'horizontal',
  className = ''
}) {
  const isMobile = useIsMobile();

  const renderButton = (action, isPrimary = false) => {
    const Icon = action.icon;
    return (
      <Button
        key={action.label}
        onClick={action.onClick}
        disabled={action.disabled || action.loading}
        variant={action.variant || (isPrimary ? 'default' : 'outline')}
        className={cn(
          isMobile ? 'h-[44px] min-h-[44px] text-sm' : 'min-h-[48px]',
          'font-medium',
          isPrimary && isMobile && 'w-full',
          isPrimary && !isMobile && 'px-6',
          !isPrimary && isMobile && 'flex-1',
          action.className
        )}
      >
        {action.loading ? (
          <span className="animate-spin mr-2">⟳</span>
        ) : Icon ? (
          <Icon className={cn(isMobile ? 'w-4 h-4 mr-1.5' : 'w-4 h-4 mr-2')} />
        ) : null}
        {action.label}
      </Button>
    );
  };

  // Mobile Layout: Vertical stack with full-width primary, reduced gap
  if (isMobile) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {primaryAction && renderButton(primaryAction, true)}
        {secondaryActions.length > 0 && (
          <div className="flex gap-2">
            {secondaryActions.slice(0, 2).map(action => renderButton(action, false))}
          </div>
        )}
      </div>
    );
  }

  // Desktop Layout: Horizontal or vertical based on prop
  if (desktopLayout === 'vertical') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {primaryAction && renderButton(primaryAction, true)}
        {secondaryActions.map(action => renderButton(action, false))}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {secondaryActions.map(action => renderButton(action, false))}
      {primaryAction && renderButton(primaryAction, true)}
    </div>
  );
}

/**
 * MobileActionButton
 * Standardized action button with proper touch targets (44px on mobile)
 */
export function MobileActionButton({ 
  children, 
  icon: Icon, 
  variant = 'default',
  fullWidth = false,
  className = '',
  ...props 
}) {
  const isMobile = useIsMobile();

  return (
    <Button
      variant={variant}
      className={cn(
        isMobile ? 'h-[44px] min-h-[44px] text-sm' : 'min-h-[48px]',
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {Icon && <Icon className={cn(isMobile ? 'w-4 h-4 mr-1.5' : 'w-4 h-4 mr-2')} />}
      {children}
    </Button>
  );
}