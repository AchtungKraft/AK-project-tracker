import React from 'react';
import { useIsMobile } from './useIsMobile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Mobile Compact Button
 * Renders a compact 44px height button on mobile, normal on desktop
 */
export function MobileCompactButton({ 
  children, 
  className = '', 
  size,
  ...props 
}) {
  const isMobile = useIsMobile();
  
  return (
    <Button
      {...props}
      className={cn(
        className,
        isMobile && 'h-[44px] min-h-[44px] text-sm px-3 py-2 [&_svg]:w-4 [&_svg]:h-4'
      )}
      size={isMobile ? 'sm' : size}
    >
      {children}
    </Button>
  );
}

/**
 * Mobile Action Strip
 * Horizontal row of equal-width action buttons for mobile
 */
export function MobileActionStrip({ 
  children, 
  className = '' 
}) {
  const isMobile = useIsMobile();
  
  if (!isMobile) {
    return <div className={cn('flex items-center gap-2', className)}>{children}</div>;
  }
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, {
          className: cn(
            child.props.className,
            'flex-1 h-[44px] min-h-[44px] text-sm'
          )
        });
      })}
    </div>
  );
}

/**
 * Mobile Section Header
 * Compact section header with reduced spacing on mobile
 */
export function MobileSectionHeader({ 
  children, 
  className = '',
  noBorder = false
}) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      isMobile ? 'mb-2 mt-3' : 'mb-4 mt-6',
      !noBorder && isMobile && 'pb-2 border-b border-gray-800',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Mobile Page Header
 * Compact page header with reduced padding on mobile
 */
export function MobilePageHeader({ 
  children, 
  className = '' 
}) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      'flex items-center justify-between gap-2',
      isMobile ? 'mb-3' : 'mb-6',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Mobile Spacing wrapper
 * Applies reduced spacing on mobile
 */
export function MobileSpacing({ 
  children, 
  className = '',
  desktop = 'space-y-6',
  mobile = 'space-y-3'
}) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(isMobile ? mobile : desktop, className)}>
      {children}
    </div>
  );
}

/**
 * Hook for mobile-aware class names
 */
export function useMobileClasses(mobileClasses, desktopClasses = '') {
  const isMobile = useIsMobile();
  return isMobile ? mobileClasses : desktopClasses;
}

/**
 * Mobile compact spacing constants
 */
export const MOBILE_SPACING = {
  pageHeader: {
    mobile: 'mb-3',
    desktop: 'mb-6'
  },
  section: {
    mobile: 'mb-2 mt-3',
    desktop: 'mb-4 mt-6'
  },
  card: {
    mobile: 'p-3',
    desktop: 'p-4'
  },
  gap: {
    mobile: 'gap-2',
    desktop: 'gap-4'
  }
};