import React from 'react';
import { useIsMobile } from './useIsMobile';

/**
 * MobileSafeAreaContainer
 * Prevents content from being hidden by bottom navigation, mobile browser bars, or iOS safe-area zones.
 * On desktop, returns children with no modification.
 */
export default function MobileSafeAreaContainer({ children, className = '' }) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div 
      className={`mobile-safe-area-container ${className}`}
      style={{
        height: '100%',
        minHeight: '100dvh',
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </div>
  );
}