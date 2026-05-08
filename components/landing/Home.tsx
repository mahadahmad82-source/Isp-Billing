
import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Zap, Smartphone, BarChart, Users, Lock, ChevronDown, Globe, Cpu, Server } from 'lucide-react';
import ThreeBackground from './ThreeBackground';

interface HomeProps {
  onGetStarted: () => void;
}

// 3D Tilt Feature Card
const FeatureCard3D: React.FC<{ feat: any; isDark: boolean }> = ({ feat, isDark }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    cardRef.current.style.transform = `perspective(600px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-6px) scale(1.02)`;
    cardRef.current.style.boxShadow = `${-x * 20}px ${-y * 20}px 60px ${feat.color}25`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) translateY(0) scale(1)';
    cardRef.current.style.boxShadow = 'none';
  };

  return (
    <motion.div
      ref={cardRef}
      className="relative p-8 rounded-3xl border overflow-hidden cursor-default"
      style={{
        background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: feat.delay, duration: 0.5 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
        style={{
          background: `linear-gradient(135deg, ${feat.color}20, ${feat.color}05)`,
          border: `1px solid ${feat.color}25`,
          color: feat.color,
        }}>
        {feat.icon}
      </div>
      <h3 className="text-lg font-black mb-3 uppercase tracking-tight"
        style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
        {feat.title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
        {feat.desc}
      </p>
      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${feat.color}40, transparent)` }} />
    </motion.div>
  );
};

const Home: React.FC<HomeProps> = ({ onGetStarted }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
  };
  const itemVariants = {
    hidden: { y: 40, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 80, damping: 15 } }
  };

  const features = [
    { title: 'Automated Billing', desc: 'Generate monthly invoices and receipts automatically. Zero manual entry required.', icon: <Zap className="w-7 h-7" />, color: '#6366f1', delay: 0 },
    { title: 'Recovery Alerts', desc: 'Smart overdue tracking with automated WhatsApp and SMS reminders.', icon: <Smartphone className="w-7 h-7" />, color: '#8b5cf6', delay: 0.1 },
    { title: 'Secure & Offline', desc: 'AES-256 encrypted local storage. Your data, your device, always private.', icon: <Lock className="w-7 h-7" />, color: '#06b6d4', delay: 0.2 },
    { title: 'AI Insights', desc: 'Business analytics and revenue forecasts powered by machine learning.', icon: <BarChart className="w-7 h-7" />, color: '#10b981', delay: 0.3 },
    { title: 'Multi-Manager', desc: 'Role-based access for admin and managers. Each operates independently.', icon: <Users className="w-7 h-7" />, color: '#f59e0b', delay: 0.4 },
    { title: 'Edge Computing', desc: 'Near-zero latency with Vercel edge network. 150+ global cities covered.', icon: <Globe className="w-7 h-7" />, color: '#ec4899', delay: 0.5 },
  ];

  return (
    <>
    <div className="pt-20">

      {/* ─── HERO ─── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center"
        style={{ background: isDark ? '#020617' : '#f8faff' }}>

        <ThreeBackground isDark={isDark} />

        {/* Radial gradient overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: isDark
            ? 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, #020617 70%)'
            : 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, #f8faff 70%)',
          zIndex: 1
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none" style={{
          background: isDark ? 'linear-gradient(to top, #020617, transparent)' : 'linear-gradient(to top, #f8faff, transparent)',
          zIndex: 1
        }} />

        <motion.div className="relative z-10 text-center px-6 max-w-6xl mx-auto"
          style={{ y: heroY, opacity: heroOpacity }}
          initial="hidden" animate="visible" variants={containerVariants}>

          {/* Badge */}
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 mb-8">
            <div className="px-4 py-1.5 rounded-full border backdrop-blur-sm"
              style={{ background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)' }}>
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Next-Gen ISP Infrastructure
              </span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={itemVariants} className="font-black tracking-tighter leading-none mb-8 select-none"
            style={{
              fontSize: 'clamp(3rem, 12vw, 9rem)',
              color: isDark ? '#f1f5f9' : '#0f172a',
              textShadow: isDark ? '0 0 80px rgba(99,102,241,0.3)' : '0 2px 20px rgba(99,102,241,0.1)',
            }}>
            THE FUTURE<br />
            <span style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 30px rgba(99,102,241,0.4))',
            }}>
              OF NETWORK
            </span><br />
            MANAGEMENT
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={itemVariants}
            className="max-w-2xl mx-auto text-lg md:text-xl font-medium leading-relaxed mb-12"
            style={{ color: isDark ? '#94a3b8' : '#475569' }}>
            MYISP is the ultimate management suite for local ISPs. Automated billing,
            real-time recovery tracking, and professional receipts in one secure node.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button onClick={onGetStarted}
              className="group relative px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] text-white overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <span className="relative z-10 flex items-center gap-3">
                Initialize Node <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute -inset-1 rounded-2xl blur-lg opacity-40 -z-10"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
            </motion.button>

            <motion.button onClick={() => setShowSpecs(true)}
              className="px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] backdrop-blur-sm border flex items-center gap-3"
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                color: isDark ? '#e2e8f0' : '#1e293b',
              }}
              whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Cpu className="w-4 h-4" /> System Specs
            </motion.button>
          </motion.div>

          {/* Scroll hint */}
          <motion.div variants={itemVariants} className="mt-16 flex flex-col items-center gap-2 opacity-40">
            <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>Scroll to explore</span>
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
              <ChevronDown className="w-4 h-4" style={{ color: isDark ? '#64748b' : '#94a3b8' }} />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ─── STATS ─── */}
      <section className="relative py-20 px-6" style={{ background: isDark ? '#020617' : '#f8faff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '233+', label: 'Active Users', icon: <Users className="w-5 h-5" />, color: '#6366f1' },
              { value: '99.9%', label: 'Uptime SLA', icon: <Server className="w-5 h-5" />, color: '#06b6d4' },
              { value: '<50ms', label: 'Latency', icon: <Zap className="w-5 h-5" />, color: '#8b5cf6' },
              { value: 'AES-256', label: 'Encryption', icon: <Lock className="w-5 h-5" />, color: '#10b981' },
            ].map((stat, i) => (
              <motion.div key={i}
                className="relative p-6 rounded-2xl border text-center overflow-hidden"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.8)',
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                }}
                initial={{ opacity: 0, y: 30, rotateX: 15 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -6, scale: 1.02 }}>
                <div className="flex justify-center mb-3" style={{ color: stat.color }}>{stat.icon}</div>
                <div className="text-2xl md:text-3xl font-black mb-1" style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>{stat.value}</div>
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#64748b' }}>{stat.label}</div>
                <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity rounded-2xl"
                  style={{ background: `radial-gradient(circle at center, ${stat.color}08, transparent)` }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="relative py-32 px-6 overflow-hidden" style={{ background: isDark ? '#030712' : '#ffffff' }}>
        {/* 3D perspective grid */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.4 }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: isDark
              ? 'linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)'
              : 'linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            transform: 'perspective(400px) rotateX(55deg) scale(2)',
            transformOrigin: 'center top',
            top: '-50%',
          }} />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-4">Core Modules</p>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight"
              style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
              Built for<br />
              <span style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Real ISPs</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feat, i) => <FeatureCard3D key={i} feat={feat} isDark={isDark} />)}
          </div>
        </div>
      </section>

      {/* ─── INFRASTRUCTURE ─── */}
      <section className="relative py-32 px-6" style={{ background: isDark ? '#020617' : '#f8faff' }}>
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500 mb-4">Technical Infrastructure</p>
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight"
              style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>
              Engineered for<br />
              <span style={{
                background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>100% Uptime</span>
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: 'Edge Computing', desc: 'Processing at the edge for near-zero latency in billing and recoveries.', icon: <Cpu className="w-8 h-8" />, color: '#6366f1' },
              { title: 'Secure Nodes', desc: 'Each ISP operates as an independent, encrypted node within MYISP ecosystem.', icon: <Server className="w-8 h-8" />, color: '#8b5cf6' },
              { title: 'Global Sync', desc: 'Real-time synchronization across all devices with offline-first support.', icon: <Globe className="w-8 h-8" />, color: '#06b6d4' },
            ].map((spec, i) => (
              <motion.div key={i}
                className="relative p-10 rounded-3xl border overflow-hidden"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.9)',
                  borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
                  transformStyle: 'preserve-3d',
                }}
                initial={{ opacity: 0, y: 40, rotateX: 10 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.7 }}
                whileHover={{ y: -8, rotateX: -3, rotateY: i === 0 ? 3 : i === 2 ? -3 : 0 }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
                  style={{
                    background: `linear-gradient(135deg, ${spec.color}20, ${spec.color}05)`,
                    border: `1px solid ${spec.color}30`,
                    color: spec.color,
                    boxShadow: `0 8px 32px ${spec.color}20`,
                  }}>
                  {spec.icon}
                </div>
                <h3 className="text-2xl font-black mb-4 uppercase tracking-tight"
                  style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>{spec.title}</h3>
                <p className="leading-relaxed font-medium" style={{ color: '#64748b' }}>{spec.desc}</p>
                <div className="absolute bottom-0 left-0 right-0 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${spec.color}50, transparent)` }} />
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10"
                  style={{ background: spec.color }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>

    {/* System Specs Modal */}
    {showSpecs && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
        onClick={() => setShowSpecs(false)}>
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border max-h-[90vh] overflow-y-auto"
          style={{
            background: isDark ? '#0f172a' : '#ffffff',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            boxShadow: '0 40px 120px rgba(99,102,241,0.2)',
          }}
          onClick={e => e.stopPropagation()}>
          <div className="p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-3xl -mr-32 -mt-32" />
            </div>
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">System Online</span>
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">MYISP System Specs</h2>
                <p className="text-indigo-300 text-sm mt-1">Complete platform overview</p>
              </div>
              <button onClick={() => setShowSpecs(false)} className="text-white/60 hover:text-white text-2xl">✕</button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="rounded-2xl p-5"
              style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#f8faff', border: '1px solid rgba(99,102,241,0.1)' }}>
              <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Core Features
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  '✅ Multi-Manager Accounts', '✅ Customer Management',
                  '✅ Digital Receipt Generator', '✅ Monthly Recovery Tracking',
                  '✅ Expiry Alerts (3/7/30 days)', '✅ AI Business Insights',
                  '✅ Cross-Device Cloud Sync', '✅ WhatsApp Share Integration',
                  '✅ Dark / Light Theme', '✅ Onboarding Tour Guide',
                  '✅ Feature Hint System', '✅ Role-Based Access (Admin/Manager)',
                ].map((f, i) => (
                  <div key={i} className="text-xs font-medium py-1"
                    style={{ color: isDark ? '#94a3b8' : '#475569' }}>{f}</div>
                ))}
              </div>
            </div>
            <motion.button
              onClick={() => { setShowSpecs(false); onGetStarted(); }}
              className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              Initialize Node — Start Free <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    )}
    </>
  );
};

export default Home;
