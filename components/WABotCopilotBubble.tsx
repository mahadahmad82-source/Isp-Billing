import React, { useEffect, useRef, useState } from 'react';

// ── Movable Copilot bubble (NetBot web) ──────────────────────────────────────
// Self-contained floating action button, mirroring the dashboard CopilotBar's
// drag behavior: pointer drag, snap to nearest left/right edge on release,
// drag-to-bottom-center-close with a close target + hint, position persisted
// in localStorage, tap-vs-drag disambiguation. No backend changes.
// ─────────────────────────────────────────────────────────────────────────────

const LS_POS_KEY = 'wabot_copilot_bubble_pos';
const LS_CLOSED_KEY = 'wabot_copilot_bubble_closed';
const FAB = 56; // 56px — exceeds the 44px touch target, fine for a FAB
const TAP_SLOP = 8; // moved < 8px counts as a tap
const CLOSE_DIST = 90; // drop within ~90px of the bottom-center target closes

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const loadPos = (): { x: number; y: number } | null => {
  try {
    const raw = localStorage.getItem(LS_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  return null;
};

interface WABotCopilotBubbleProps {
  onOpenCopilot: () => void;
  onCloseHint: (msg: string) => void;
}

export default function WABotCopilotBubble({ onOpenCopilot, onCloseHint }: WABotCopilotBubbleProps) {
  const [closed, setClosed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_CLOSED_KEY) === '1'; } catch { return false; }
  });
  const [pos, setPos] = useState(() => loadPos() ?? { x: -FAB, y: -FAB }); // off-screen until measured
  const [dragging, setDragging] = useState(false);
  const [nearClose, setNearClose] = useState(false);
  const posRef = useRef(pos);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  posRef.current = pos;

  // Default position once window size is known: right edge, ~62% down.
  useEffect(() => {
    if (!loadPos()) {
      const p = {
        x: Math.max(8, window.innerWidth - FAB - 16),
        y: Math.round(window.innerHeight * 0.62),
      };
      posRef.current = p;
      setPos(p);
    }
  }, []);

  // Keep the bubble on screen on resize/orientation change.
  useEffect(() => {
    const onResize = () => {
      const p = posRef.current;
      const np = {
        x: clamp(p.x, 8, window.innerWidth - FAB - 8),
        y: clamp(p.y, 8, window.innerHeight - FAB - 8),
      };
      posRef.current = np;
      setPos(np);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  if (closed) return null;

  const closeCenter = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 64 });

  const dragStart = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false };
    setDragging(true);
    setNearClose(false);
  };

  const dragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    const np = {
      x: clamp(d.ox + dx, 8, window.innerWidth - FAB - 8),
      y: clamp(d.oy + dy, 8, window.innerHeight - FAB - 8),
    };
    posRef.current = np;
    setPos(np);
    const t = closeCenter();
    setNearClose(Math.hypot(np.x + FAB / 2 - t.x, np.y + FAB / 2 - t.y) < CLOSE_DIST);
  };

  const dragEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setNearClose(false);
    if (!d) return;
    if (!d.moved) { onOpenCopilot(); return; } // tap
    const t = closeCenter();
    const p = posRef.current;
    if (Math.hypot(p.x + FAB / 2 - t.x, p.y + FAB / 2 - t.y) < CLOSE_DIST) {
      try { localStorage.setItem(LS_CLOSED_KEY, '1'); } catch { /* ignore */ }
      setClosed(true);
      onCloseHint('Bubble closed — open Copilot from the menu to bring it back');
      return;
    }
    // Snap to the nearest left/right edge; keep the drop Y.
    const m = 8;
    const leftX = m;
    const rightX = Math.max(leftX, window.innerWidth - FAB - m);
    const np = { x: p.x + FAB / 2 < window.innerWidth / 2 ? leftX : rightX, y: p.y };
    posRef.current = np;
    setPos(np);
    try { localStorage.setItem(LS_POS_KEY, JSON.stringify(np)); } catch { /* ignore */ }
  };

  const t = closeCenter();

  return (
    <>
      {/* Drag-to-close target: bottom-center, visible only while dragging */}
      {dragging && (
        <div className="fixed z-40 pointer-events-none" style={{ left: t.x - 28, top: t.y - 28 }}>
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${
              nearClose ? 'bg-[var(--nb-danger)] border-white scale-110' : 'bg-[var(--nb-surface-3)] border-[var(--nb-border)]'
            }`}
          >
            <svg className="w-6 h-6 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-center text-[10px] font-bold text-white mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            Close
          </p>
        </div>
      )}
      <button
        type="button"
        aria-label="Open Copilot"
        title="Copilot"
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCopilot(); } }}
        className="fixed z-40 w-14 h-14 rounded-full bg-[var(--nb-accent)] shadow-lg flex items-center justify-center active:scale-[0.97] touch-none select-none"
        style={{
          left: pos.x,
          top: pos.y,
          transition: dragging ? 'none' : 'left 0.18s ease-out, top 0.18s ease-out',
        }}
      >
        <svg className="w-7 h-7 text-white pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4c.7 4.2 3.1 7.6 7.3 8.3-4.2.7-6.6 4.1-7.3 8.3-.7-4.2-3.1-7.6-7.3-8.3C8.9 11.6 11.3 8.2 12 4z" />
        </svg>
      </button>
    </>
  );
}
