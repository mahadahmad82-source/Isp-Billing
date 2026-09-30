import React, { useState, useRef, useEffect } from 'react';
import type { CopilotLogEntry } from '../types';
import { useCopilot, type UseCopilotOptions } from '../hooks/useCopilot';
import { CopilotIcon, MicIcon, SendIcon, CloseIcon, SpeakerIcon, LoopIcon } from './CopilotIcons';

interface CopilotBarProps extends UseCopilotOptions {
  /** Persisted closed state (dual-saved by the parent like the rest of AppState). */
  widgetClosed?: boolean;
  onWidgetClosedChange?: (closed: boolean) => void;
}

const POS_KEY = 'copilot_pos_v1';
const FAB = 56;
// Release within this distance (px) of the close target's center closes the widget.
const CLOSE_DIST = 80;
// Highlight the close target slightly earlier so the user gets feedback.
const HIGHLIGHT_DIST = 110;

// UI preferences only (widget position / voice-reply toggle) — not business
// data, so the position intentionally lives in localStorage alone, not in
// AppState. The CLOSED state, however, is dual-saved via onWidgetClosedChange.
const panelSize = () => ({
  w: Math.min(384, window.innerWidth - 16),
  h: Math.min(Math.round(window.innerHeight * 0.7), 480),
});

// Reads the device safe-area insets once (cached) so the widget stays clear
// of notches / gesture bars when it is released.
let safeInsetsCache: { top: number; right: number; bottom: number; left: number } | null = null;
const getSafeInsets = () => {
  if (safeInsetsCache) return safeInsetsCache;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);visibility:hidden;pointer-events:none;width:0;height:0;';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    safeInsetsCache = {
      top: parseFloat(cs.top) || 0,
      right: parseFloat(cs.right) || 0,
      bottom: parseFloat(cs.bottom) || 0,
      left: parseFloat(cs.left) || 0,
    };
    probe.remove();
  } catch { safeInsetsCache = { top: 0, right: 0, bottom: 0, left: 0 }; }
  return safeInsetsCache;
};

const clampPos = (x: number, y: number, w: number, h: number) => {
  const s = getSafeInsets();
  const m = 8;
  return {
    x: Math.min(Math.max(m + s.left, x), Math.max(m + s.left, window.innerWidth - w - m - s.right)),
    y: Math.min(Math.max(m + s.top, y), Math.max(m + s.top, window.innerHeight - h - m - s.bottom)),
  };
};
const loadPos = () => {
  try {
    const r = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (r && typeof r.x === 'number' && typeof r.y === 'number') return clampPos(r.x, r.y, FAB, FAB);
  } catch { /* ignore */ }
  return clampPos(20, window.innerHeight - 24 - FAB, FAB, FAB);
};

// Center of the bottom-center close target (w-16 h-16, 24px above the
// safe-area bottom edge). Deterministic — matches the rendered target.
const closeTargetCenter = () => {
  const s = getSafeInsets();
  const r = 32;
  return { x: window.innerWidth / 2, y: window.innerHeight - (24 + s.bottom) - r };
};

export default function CopilotBar({ widgetClosed, onWidgetClosedChange, ...copilotOpts }: CopilotBarProps) {
  const c = useCopilot(copilotOpts);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const [dragging, setDragging] = useState(false);
  const [nearClose, setNearClose] = useState(false);
  const [highlightClose, setHighlightClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const posRef = useRef(pos);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<number | null>(null);

  posRef.current = pos;

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }); }, [c.log, c.pending, open]);

  useEffect(() => {
    const onResize = () => {
      safeInsetsCache = null;
      const s = open ? panelSize() : { w: FAB, h: FAB };
      setPos(p => clampPos(p.x, p.y, s.w, s.h));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [open]);

  useEffect(() => () => {
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
  }, []);

  if (widgetClosed) return null;

  // ── Drag-to-close + edge snap (FAB only) ──
  const dragStart = (e: React.PointerEvent) => {
    if (closing) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (snapTimer.current) { window.clearTimeout(snapTimer.current); snapTimer.current = null; }
    setSnapping(false);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false };
    setDragging(true);
    setNearClose(false);
    setHighlightClose(false);
  };
  const dragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || closing) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    // Free move anywhere on screen — clamped only to the screen bounds +
    // safe-area insets (never blocked from the footer / bottom area).
    const np = clampPos(d.ox + dx, d.oy + dy, FAB, FAB);
    posRef.current = np;
    setPos(np);
    const t = closeTargetCenter();
    const dist = Math.hypot(np.x + FAB / 2 - t.x, np.y + FAB / 2 - t.y);
    setNearClose(dist < CLOSE_DIST);
    setHighlightClose(dist < HIGHLIGHT_DIST);
  };
  const dragEnd = (): boolean => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setNearClose(false);
    setHighlightClose(false);
    if (!d?.moved || closing) return !!d?.moved;
    const t = closeTargetCenter();
    const p = posRef.current;
    const dist = Math.hypot(p.x + FAB / 2 - t.x, p.y + FAB / 2 - t.y);
    if (dist < CLOSE_DIST) {
      doClose();
    } else {
      snapToEdge();
    }
    try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ }
    return true;
  };

  // Soft snap to the nearest left/right edge on release; the vertical
  // position stays where the user dropped the widget.
  const snapToEdge = () => {
    const s = getSafeInsets();
    const m = 8;
    const leftX = m + s.left;
    const rightX = Math.max(leftX, window.innerWidth - FAB - m - s.right);
    const targetX = (posRef.current.x + FAB / 2 < window.innerWidth / 2) ? leftX : rightX;
    const np = clampPos(targetX, posRef.current.y, FAB, FAB);
    posRef.current = np;
    setSnapping(true);
    setPos(np);
    try { localStorage.setItem(POS_KEY, JSON.stringify(np)); } catch { /* ignore */ }
    if (snapTimer.current) window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => { setSnapping(false); snapTimer.current = null; }, 260);
  };

  // Drop on the close target: shrink into it and fade out, then hide the
  // widget. The closed state is dual-saved by the parent.
  const doClose = () => {
    c.stopVoice();
    setClosing(true);
    const t = closeTargetCenter();
    const np = { x: t.x - FAB / 2, y: t.y - FAB / 2 };
    posRef.current = np;
    setPos(np);
    window.setTimeout(() => {
      setClosing(false);
      setOpen(false);
      onWidgetClosedChange?.(true);
    }, 300);
  };

  // ── Drag (panel header keeps the original free-drag behavior) ──
  const panelDragStart = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y, moved: false };
  };
  const panelDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const s = panelSize();
    const np = clampPos(d.ox + dx, d.oy + dy, s.w, 56);
    posRef.current = np;
    setPos(np);
  };
  const panelDragEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)); } catch { /* ignore */ } }
  };

  const openPanel = () => {
    const s = panelSize();
    const np = clampPos(posRef.current.x, posRef.current.y, s.w, s.h);
    posRef.current = np;
    setPos(np);
    try { localStorage.setItem(POS_KEY, JSON.stringify(np)); } catch { /* ignore */ }
    setOpen(true);
  };
  const closePanel = () => {
    c.stopVoice();
    const np = clampPos(posRef.current.x, posRef.current.y, FAB, FAB);
    posRef.current = np;
    setPos(np);
    setOpen(false);
  };

  if (!open) {
    const fabStyle: React.CSSProperties = {
      left: pos.x,
      top: pos.y,
      touchAction: 'none',
      ...(snapping ? { transition: 'left 0.22s ease-out, top 0.22s ease-out' } : {}),
      ...(closing ? { transition: 'left 0.28s ease-in, top 0.28s ease-in, transform 0.28s ease-in, opacity 0.28s ease-in', transform: 'scale(0.1)', opacity: 0 } : {}),
    };
    return (
      <>
        {/* Close target — visible ONLY while the widget is being dragged. */}
        {dragging && (
          <div
            aria-hidden
            className={`fixed z-[9998] w-16 h-16 rounded-full flex items-center justify-center text-white transition-all duration-150 ${highlightClose ? 'bg-red-600 scale-125 shadow-2xl shadow-red-600/40' : 'bg-slate-900/90 scale-100 shadow-xl'}`}
            style={{ left: 'calc(50% - 32px)', bottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-7 h-7">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}
        <button
          onPointerDown={dragStart}
          onPointerMove={dragMove}
          onPointerUp={() => { if (!closing && !dragEnd()) openPanel(); }}
          onPointerCancel={() => { dragEnd(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPanel(); }}
          aria-label="Copilot"
          style={fabStyle}
          className="fixed z-[9999] flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-2xl shadow-indigo-600/30 cursor-grab active:cursor-grabbing select-none"
        >
          <CopilotIcon />
        </button>
      </>
    );
  }

  const ps = panelSize();
  return (
    <div
      className="fixed z-[9999] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: ps.w, height: ps.h }}
    >
      <div
        onPointerDown={panelDragStart}
        onPointerMove={panelDragMove}
        onPointerUp={() => { panelDragEnd(); }}
        onPointerCancel={() => { panelDragEnd(); }}
        style={{ touchAction: 'none' }}
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <CopilotIcon /> Copilot
        </div>
        <div className="flex items-center gap-3" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={c.toggleHandsFree} aria-label="Hands-free mode" title="Hands-free" className={c.handsFree ? 'text-yellow-300' : 'text-white/80'}><LoopIcon /></button>
          <button onClick={c.toggleVoiceReply} aria-label="Voice reply" title="Voice reply" className={c.voiceReply ? 'text-yellow-300' : 'text-white/80'}><SpeakerIcon off={!c.voiceReply} /></button>
          <button onClick={closePanel} aria-label="Close"><CloseIcon /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm" style={{ minHeight: '80px' }}>
        {c.log.length === 0 && (
          <p className="text-gray-400 text-xs">
            e.g. "open customer list", "Ali ka balance batao", "Sara ki receipt 1500 ki banao", "Ali ko disable karo". Tap the mic to speak in Urdu, Roman Urdu or English.
          </p>
        )}
        {c.log.map((entry, i) => (
          <div key={i} className={entry.from === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block px-3 py-2 rounded-xl max-w-[85%] text-left ${entry.from === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 dark:text-gray-100'}`}>
              {entry.text}
            </span>
          </div>
        ))}
        {c.pending && (
          <div className="flex gap-2">
            <button onClick={c.confirmPending} className="px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-bold">Confirm</button>
            <button onClick={c.cancelPending} className="px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 dark:text-gray-100 text-xs font-bold">Cancel</button>
          </div>
        )}
        {c.busy && <p className="text-gray-400 text-xs">Thinking...</p>}
        {c.listening && <p className="text-red-500 text-xs animate-pulse">Listening...</p>}
        {c.transcribing && <p className="text-gray-400 text-xs">Transcribing...</p>}
        <div ref={logEndRef} />
      </div>
      <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <input
          value={c.input}
          onChange={(e) => c.setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') c.runCommand(c.input); }}
          placeholder="Type a command..."
          className="flex-1 min-w-0 px-3 py-2 rounded-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={c.toggleMic}
          disabled={c.transcribing}
          aria-label="Voice"
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors shrink-0 disabled:opacity-40 ${c.listening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
        >
          <MicIcon />
        </button>
        <button
          onClick={() => c.runCommand(c.input)}
          disabled={c.busy || !c.input.trim()}
          aria-label="Send"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40 shrink-0"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
