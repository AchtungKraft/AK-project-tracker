import React, { useState, useEffect } from 'react';
import { useIsMobile } from './useIsMobile';
import { cn } from '@/lib/utils';

/**
 * MobileCollapsibleHeader
 * Collapses on scroll down (> 40px), expands on scroll up.
 * Desktop: No change.
 */
export default function MobileCollapsibleHeader({ 
  logo,
  title,
  tagline,
  actions,
  className = ''
}) {
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    if (!isMobile) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 40) {
        // Scrolling down past threshold
        setIsCollapsed(true);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up
        setIsCollapsed(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, lastScrollY]);

  // Desktop header - unchanged
  if (!isMobile) {
    return (
      <header className={cn('sticky top-0 bg-black/80 backdrop-blur-xl border-b border-red-900/30 px-4 py-3 z-40', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              {title && <h1 className="text-sm font-bold text-white">{title}</h1>}
              {tagline && <p className="text-xs text-gray-400">{tagline}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    );
  }

  // Mobile header - collapsible
  return (
    <header 
      className={cn(
        'sticky top-0 bg-black/90 backdrop-blur-xl border-b border-red-900/30 z-40 transition-all duration-200',
        isCollapsed ? 'shadow-lg shadow-black/50' : '',
        className
      )}
      style={{
        padding: isCollapsed ? '6px 12px' : '8px 12px',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logo && (
            <div className={cn(
              'transition-all duration-200',
              isCollapsed ? 'scale-90' : 'scale-100'
            )}>
              {logo}
            </div>
          )}
          <div className="overflow-hidden">
            {title && (
              <h1 className={cn(
                'font-bold text-white transition-all duration-200',
                isCollapsed ? 'text-xs' : 'text-xs'
              )}>
                {title}
              </h1>
            )}
            {tagline && !isCollapsed && (
              <p className="text-xs text-gray-400 truncate">{tagline}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}