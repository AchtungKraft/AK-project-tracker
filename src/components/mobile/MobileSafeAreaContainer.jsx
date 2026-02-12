import React from 'react';
import { useIsMobile } from './useIsMobile';

/**
 * MobileSafeAreaContainer
 * Prevents content from being hidden by bottom navigation, mobile browser bars, or iOS safe-area zones.
 * On desktop, returns children with no modification.
 * 
 * IMPORTANT: Bottom nav is h-14 (56px) + safe-area-inset-bottom
 * Total padding: 56px + 16px buffer + safe-area = 72px + safe-area
 */
export default function MobileSafeAreaContainer({ children, className = '' }) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div 
      className={`mobile-safe-area-container flex flex-col ${className}`}
      style={{
        minHeight: '100dvh',
        // Bottom nav (56px) + buffer (16px) + safe area
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {children}
    </div>
  );
}