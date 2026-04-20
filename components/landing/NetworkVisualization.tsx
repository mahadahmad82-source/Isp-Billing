
import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

const NetworkVisualization: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const particleCount = 40;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;

      constructor(w: number, h: number) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
      }

      update(w: number, h: number) {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
        ctx.fill();
      }
    }

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      particles = Array.from({ length: particleCount }, () => new Particle(canvas.width, canvas.height));
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.update(canvas.width, canvas.height);
        p.draw(ctx);

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${1 - dist / 150})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resize);
    resize();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-[400px] md:h-[600px] rounded-[3rem] overflow-hidden bg-slate-900/50 border border-white/5 shadow-2xl">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent pointer-events-none" />
      
      <div className="absolute bottom-12 left-12 right-12 z-10 flex flex-col md:flex-row justify-between items-end gap-8">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Network Node Active</span>
          </div>
          <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Global Infrastructure</h3>
          <p className="text-slate-400 text-sm font-medium max-w-sm">
            Real-time visualization of your ISP network nodes and data flow. 
            Monitor performance and connectivity with absolute precision.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
          <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Latency</p>
            <p className="text-2xl font-black text-white tracking-tight">12ms</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Uptime</p>
            <p className="text-2xl font-black text-white tracking-tight">99.9%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkVisualization;
