import { useState, useEffect } from 'react';
import { useIsMobile } from '@/components/mobile/useIsMobile';

/**
 * ViewportDiagnostic — Temporary floating badge for debugging iPad layout issues.
 * 
 * Activate by setting localStorage: ak_debug_viewport = "true"
 * Shows: viewport dimensions, detected mode (MOBILE/DESKTOP), user agent hints.
 * 
 * Remove after iPad validation is complete.
 */
export default function ViewportDiagnostic() {
  const isMobile = useIsMobile();
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('ak_debug_viewport') !== 'true') return;
    setVisible(true);

    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!visible) return null;

  const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  const dpr = window.devicePixelRatio || 1;

  return (
    <div
      className="fixed bottom-20 right-4 z-[9999] bg-black/90 border border-yellow-500/50 text-yellow-300 text-[10px] font-mono px-3 py-2 rounded-lg shadow-lg space-y-0.5 pointer-events-none"
      style={{ maxWidth: '200px' }}
    >
      <div className="font-bold text-yellow-400">VIEWPORT DEBUG</div>
      <div>{dims.w} × {dims.h}</div>
      <div>DPR: {dpr.toFixed(1)}</div>
      <div>Mode: <span className={isMobile ? 'text-red-400' : 'text-green-400'}>{isMobile ? 'MOBILE' : 'DESKTOP'}</span></div>
      <div>iPad: {isIPad ? '✓' : '✗'}</div>
      <div>Breakpoint: 768px</div>
    </div>
  );
}