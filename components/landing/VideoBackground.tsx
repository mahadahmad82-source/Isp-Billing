import React, { useEffect, useRef } from 'react';

// Fiber/network themed animated background — replaces the old globe video.
// Mesh gradient + grid overlay + floating orbs + an interactive canvas
// particle network, styled after Mahadnet's landing page but recoloured to
// match Bill Collector's existing indigo/purple/cyan palette.
const BRAND_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#818cf8'];

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

const VideoBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return; // keep the static gradient/grid layers, skip the canvas animation

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
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
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
            const alpha = (1 - dist / connectDistance) * 0.22;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
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

      if (Math.random() < 0.035 && packets.length < 14) {
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
    <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 bg-[#020617]">
      {/* Animated mesh gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, rgba(99,102,241,0.30), transparent 40%),' +
            'radial-gradient(circle at 85% 15%, rgba(6,182,212,0.24), transparent 45%),' +
            'radial-gradient(circle at 50% 85%, rgba(139,92,246,0.26), transparent 45%),' +
            'radial-gradient(circle at 90% 90%, rgba(59,130,246,0.20), transparent 40%),' +
            'linear-gradient(135deg, #020617 0%, #070b19 50%, #020617 100%)',
          animation: 'bcMeshShift 20s ease-in-out infinite alternate',
        }}
      />
      {/* Grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      {/* Floating blurred orbs */}
      <div className="absolute rounded-full" style={{ width: 360, height: 360, top: '6%', left: '-6%', background: 'radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatA 16s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ width: 300, height: 300, top: '38%', right: '-5%', background: 'radial-gradient(circle, rgba(139,92,246,0.30), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatB 20s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ width: 260, height: 260, bottom: '8%', left: '18%', background: 'radial-gradient(circle, rgba(6,182,212,0.28), transparent 70%)', filter: 'blur(50px)', animation: 'bcFloatC 14s ease-in-out infinite' }} />

      {/* Interactive fiber network */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.55 }} />

      {/* Vignette so foreground content stays readable */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 25%, #020617 88%)', opacity: 0.85 }} />

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
