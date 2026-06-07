import { useState, useEffect } from 'react';

/**
 * MOBILE_BREAKPOINT — single source of truth for mobile vs desktop.
 *
 * Desktop: >= 768px  (includes large iPads — 1024×768 portrait, 1024×1366 landscape)
 * Mobile:  <  768px  (phones only)
 *
 * There is intentionally NO tablet tier. Large iPads always receive the
 * desktop rendering path. This matches the Tailwind `md:` breakpoint (768px)
 * and the sidebar component at hooks/use-mobile.jsx.
 */
const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setIsMobile(width < MOBILE_BREAKPOINT);

      // Diagnostic logging — temporary, remove after iPad validation
      if (import.meta.env.DEV || localStorage.getItem('ak_debug_viewport') === 'true') {
        console.log(`[VIEWPORT] ${width}×${window.innerHeight} → ${width < MOBILE_BREAKPOINT ? 'MOBILE' : 'DESKTOP'} (breakpoint: ${MOBILE_BREAKPOINT}px)`);
      }
    };
    checkMobile();
    
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export default useIsMobile;