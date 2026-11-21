import { useEffect, useRef, useState } from "react";

const RESET = { s: 1, x: 0, y: 0 };
const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

/** Pinch / double-tap zoom with pan, and horizontal swipe when not zoomed. */
export function useZoomPan(resetKey, onSwipe) {
  const [t, setT] = useState(RESET);
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const lastTouch = useRef(0);
  useEffect(() => { setT(RESET); }, [resetKey]);
  const toggle = () => setT((v) => (v.s > 1 ? RESET : { s: 2.5, x: 0, y: 0 }));

  const onTouchStart = (e) => {
    lastTouch.current = Date.now();
    const ts = e.touches;
    if (ts.length === 2) { gesture.current = { mode: 'pinch', d: dist(ts[0], ts[1]), ...t }; return; }
    if (ts.length !== 1) return;
    const now = Date.now();
    if (now - lastTap.current < 280) { lastTap.current = 0; gesture.current = null; toggle(); return; }
    lastTap.current = now;
    gesture.current = { mode: 'pan', sx: ts[0].clientX, sy: ts[0].clientY, dx: 0, dy: 0, ...t };
  };
  const onTouchMove = (e) => {
    const g = gesture.current; const ts = e.touches;
    if (!g) return;
    if (g.mode === 'pinch' && ts.length === 2) {
      const s = Math.min(4, Math.max(1, (g.s * dist(ts[0], ts[1])) / g.d));
      setT(s === 1 ? RESET : { s, x: g.x, y: g.y });
    } else if (g.mode === 'pan' && ts.length === 1) {
      g.dx = ts[0].clientX - g.sx; g.dy = ts[0].clientY - g.sy;
      if (g.s > 1) setT({ s: g.s, x: g.x + g.dx, y: g.y + g.dy });
    }
  };
  const onTouchEnd = (e) => {
    const g = gesture.current;
    if (g?.mode === 'pan' && g.s === 1 && Math.abs(g.dx) > 60 && Math.abs(g.dx) > Math.abs(g.dy)) onSwipe(g.dx < 0 ? 1 : -1);
    if (e.touches.length === 0) gesture.current = null;
  };
  // Desktop double-click; ignored right after a touch so taps don't toggle twice.
  const onDoubleClick = () => { if (Date.now() - lastTouch.current > 600) toggle(); };

  return {
    zoomed: t.s > 1,
    style: { transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` },
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onDoubleClick },
  };
}