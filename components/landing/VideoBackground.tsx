import React, { useEffect, useRef } from 'react';

// Fiber/network themed animated background — replaces the old globe video.
// Mesh gradient + grid overlay + floating orbs + an interactive canvas
// particle network, faithfully styled after Mahadnet's landing page with its
// exact midnight (#040814/#0a1228) tones and cyan/indigo/purple palette.
const BRAND_COLORS_DARK = ['#22d3ee', '#6366f1', '#a855f7', '#3b82f6'];
const BRAND_COLORS_LIGHT = ['#0891b2', '#4f46e5', '#9333ea', '#2563eb'];

interface VideoBackgroundProps {
  variant?: 'dark' | 'light';
}

interface FiberNode {
  x: number; y: number; vx: number; vy: number;
  radius: number; color: string;
  pulsePhase: number; pulseSpeed: number;
  connected: FiberNode[];
}

interface DataPacket {
  fromX: number; fromY: number; toX: number; toY: number;
  progress: number; speed: number; color: string;
}

const VideoBackground: React.FC<VideoBackgroundProps> = ({ variant = 'dark' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isLight = variant === 'light';
  const BRAND_COLORS = isLight ? BRAND_COLORS_LIGHT : BRAND_COLORS_DARK;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const speedFactor = prefersReducedMotion ? 0.3 : 1;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const maxNodes = Math.min(45, Math.floor((width * height) / 26000) + 14);
    const nodes: FiberNode[] = Array.from({ length: maxNodes }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35 * speedFactor,
      vy: (Math.random() - 0.5) * 0.35 * speedFactor,
      radius: Math.random() * 1.8 + 1,
      color: BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)],
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.008 + Math.random() * 0.015,
      connected: [],
    }));

    let packets: DataPacket[] = [];

    const pointer = { x: -9999, y: -9999, active: false };
    const onMouseMove = (e: MouseEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) { pointer.x = e.touches[0].clientX; pointer.y = e.touches[0].clientY; pointer.active = true; } };
    const onLeave = () => { pointer.active = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('touchend', onLeave);

    let rafId = 0;
    let paused = document.hidden;
    const connectDistance = 130;

    const draw = () => {
      if (paused) { rafId = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, width, height);

      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = width + 20; if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20; if (n.y > height + 20) n.y = -20;
        n.pulsePhase += n.pulseSpeed;
        n.connected = [];
      });

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectDistance) {
            a.connected.push(b); b.connected.push(a);
            const alpha = (1 - dist / connectDistance) * 0.28;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
        if (pointer.active) {
          const dx = a.x - pointer.x, dy = a.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y);
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }

      nodes.forEach((n) => {
        const glow = Math.sin(n.pulsePhase) * 0.4 + 0.6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + glow * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowBlur = 8 * glow;
        ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      if (!prefersReducedMotion && Math.random() < 0.035 && packets.length < 14) {
        const source = nodes[Math.floor(Math.random() * nodes.length)];
        if (source.connected.length > 0) {
          const target = source.connected[Math.floor(Math.random() * source.connected.length)];
          packets.push({ fromX: source.x, fromY: source.y, toX: target.x, toY: target.y, progress: 0, speed: 0.015 + Math.random() * 0.015, color: source.color });
        }
      }
      packets = packets.filter((p) => {
        p.progress += p.speed;
        if (p.progress >= 1) return false;
        const px = p.fromX + (p.toX - p.fromX) * p.progress;
        const py = p.fromY + (p.toY - p.fromY) * p.progress;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        return true;
      });

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    const onVisibility = () => { paused = document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('touchend', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className={`fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 ${isLight ? 'bg-[#eef3fb]' : 'bg-[#040814]'}`}>
      {/* Animated mesh gradient */}
      <div
        className="absolute inset-0"
        style={
          isLight
            ? {
                background:
                  'radial-gradient(circle at 15% 20%, rgba(99,102,241,0.16), transparent 40%),' +
                  'radial-gradient(circle at 85% 15%, rgba(34,211,238,0.18), transparent 45%),' +
                  'radial-gradient(circle at 50% 85%, rgba(168,85,247,0.14), transparent 45%),' +
                  'radial-gradient(circle at 90% 90%, rgba(59,130,246,0.12), transparent 40%),' +
                  'linear-gradient(135deg, #eef3fb 0%, #e8eef8 50%, #e2ebf6 100%)',
                animation: 'bcMeshShift 18s ease-in-out infinite alternate',
              }
            : {
                background:
                  'radial-gradient(circle at 15% 20%, rgba(99,102,241,0.35), transparent 40%),' +
                  'radial-gradient(circle at 85% 15%, rgba(34,211,238,0.28), transparent 45%),' +
                  'radial-gradient(circle at 50% 85%, rgba(168,85,247,0.30), transparent 45%),' +
                  'radial-gradient(circle at 90% 90%, rgba(59,130,246,0.25), transparent 40%),' +
                  'linear-gradient(135deg, #040814 0%, #0a1228 50%, #050a1a 100%)',
                animation: 'bcMeshShift 18s ease-in-out infinite alternate',
              }
        }
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: isLight
            ? 'linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)'
            : 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      {/* Floating blurred orbs */}
      <div className="absolute rounded-full" style={{ width: 360, height: 360, top: '6%', left: '-6%', background: isLight ? 'radial-gradient(circle, rgba(99,102,241,0.16), transparent 70%)' : 'radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatA 16s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ width: 300, height: 300, top: '38%', right: '-5%', background: isLight ? 'radial-gradient(circle, rgba(168,85,247,0.14), transparent 70%)' : 'radial-gradient(circle, rgba(168,85,247,0.30), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatB 20s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ width: 260, height: 260, bottom: '8%', left: '18%', background: isLight ? 'radial-gradient(circle, rgba(34,211,238,0.16), transparent 70%)' : 'radial-gradient(circle, rgba(34,211,238,0.28), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatC 14s ease-in-out infinite' }} />

      {/* Interactive fiber network */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: isLight ? 0.65 : 0.7 }} />

      {/* Vignette so foreground content stays readable */}
      {!isLight && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 40%, rgba(4,8,20,0.55) 100%)', opacity: 0.55 }} />
      )}

      <style>{`
        @keyframes bcMeshShift { 0% { filter: hue-rotate(0deg) brightness(1); } 100% { filter: hue-rotate(18deg) brightness(1.08); } }
        @keyframes bcFloatA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(24px,-30px) scale(1.05); } }
        @keyframes bcFloatB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px,22px) scale(0.95); } }
        @keyframes bcFloatC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(18px,22px) scale(1.06); } }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default VideoBackground;
