
import React from 'react';
import { motion } from 'motion/react';
import { Shield, ArrowRight, Zap, Smartphone, BarChart, Layout as LayoutIcon, Users, Lock, ChevronDown, Globe, Cpu, Server } from 'lucide-react';
import NetworkVisualization from './NetworkVisualization';

interface HomeProps {
  onGetStarted: () => void;
}

const Home: React.FC<HomeProps> = ({ onGetStarted }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 100 }
    }
  };

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative pt-20 pb-20 md:pt-32 md:pb-32 px-6 overflow-hidden min-h-[80vh] flex items-center">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=2000" 
            alt="Data Center" 
            className="w-full h-full object-cover opacity-10 dark:opacity-20 grayscale"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white/90 to-white dark:from-slate-950 dark:via-slate-950/90 dark:to-slate-950"></div>
        </div>

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none">
          <div className="absolute top-20 left-0 w-64 md:w-96 h-64 md:h-96 bg-indigo-500/10 rounded-full blur-[80px] md:blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-violet-500/10 rounded-full blur-[80px] md:blur-[120px] animate-pulse delay-700"></div>
        </div>

        <motion.div 
          className="max-w-7xl mx-auto text-center relative z-10"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className="inline-block px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-6 md:mb-8">
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Next-Gen ISP Infrastructure</span>
          </motion.div>
          
          <motion.h1 variants={itemVariants} className="text-4xl sm:text-6xl md:text-[10rem] font-black tracking-tighter leading-[1.1] md:leading-[0.8] mb-8 md:mb-12 text-slate-900 dark:text-white">
            THE FUTURE OF <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 animate-gradient-x">NETWORK</span> <br className="hidden md:block" />
            MANAGEMENT
          </motion.h1>
          
          <motion.p variants={itemVariants} className="max-w-3xl mx-auto text-base md:text-2xl text-slate-500 dark:text-slate-400 font-medium mb-10 md:mb-16 leading-relaxed px-4">
            Ledgerzo is the ultimate management suite for local ISPs. Automated billing, 
            real-time recovery tracking, and professional digital receipts in one secure node.
          </motion.p>
          
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 px-4">
            <button 
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 md:px-12 py-4 md:py-6 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-indigo-500/30 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
            >
              Initialize Node <ArrowRight className="w-4 h-4" />
            </button>
            <button className="w-full sm:w-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-8 md:px-12 py-4 md:py-6 rounded-2xl font-black text-xs uppercase tracking-[0.3em] border border-slate-200 dark:border-white/10 shadow-xl transition-all hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95">
              System Specs
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Network Visualization Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <NetworkVisualization />
          </motion.div>
        </div>
      </section>

      {/* Technical Specs Grid */}
      <section className="py-32 px-6 bg-slate-50 dark:bg-slate-950/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full opacity-[0.03] pointer-events-none">
          <img 
            src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=2000" 
            alt="Circuit Board" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-6 text-slate-900 dark:text-white">Technical Infrastructure</h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em]">Engineered for 100% Uptime</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: 'Edge Computing', desc: 'Processing data at the edge for near-zero latency in billing and recoveries.', icon: <Cpu className="w-8 h-8" /> },
              { title: 'Secure Nodes', desc: 'Each ISP operates as an independent, encrypted node within the Ledgerzo ecosystem.', icon: <Server className="w-8 h-8" /> },
              { title: 'Global Sync', desc: 'Real-time synchronization across all your management devices with offline-first support.', icon: <Globe className="w-8 h-8" /> },
            ].map((spec, idx) => (
              <motion.div 
                key={idx} 
                className="p-12 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl hover:border-indigo-500/50 transition-all group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-10 group-hover:scale-110 transition-transform">
                  {spec.icon}
                </div>
                <h3 className="text-3xl font-black mb-6 uppercase tracking-tight text-slate-900 dark:text-white">{spec.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed font-medium">{spec.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Features */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: 'Automated Billing', desc: 'Generate monthly invoices and receipts automatically with zero manual entry.', icon: <Zap className="w-6 h-6" /> },
              { title: 'Recovery Alerts', desc: 'Smart tracking for overdue payments with automated WhatsApp and SMS reminders.', icon: <Smartphone className="w-6 h-6" /> },
              { title: 'Secure Offline', desc: 'Your data stays on your device. AES-256 encrypted local storage for maximum privacy.', icon: <Lock className="w-6 h-6" /> },
            ].map((feature, idx) => (
              <motion.div 
                key={idx} 
                className="p-10 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl hover:border-indigo-500/50 transition-all group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <div className="w-16 h-16 bg-indigo-500/10 rounded-[1.5rem] flex items-center justify-center text-indigo-600 mb-8 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-black mb-4 uppercase tracking-tight text-slate-900 dark:text-white">{feature.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
