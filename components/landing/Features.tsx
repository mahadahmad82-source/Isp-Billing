
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, ChevronDown, Zap, Smartphone, BarChart, Layout as LayoutIcon, Users, Lock, Activity, Database, ShieldCheck } from 'lucide-react';

interface FeaturesProps {
  onGetStarted: () => void;
}

const Features: React.FC<FeaturesProps> = ({ onGetStarted }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const faqs = [
    { q: "Is MYISP suitable for Pakistani ISPs?", a: "Absolutely! MYISP is built specifically for local Pakistani ISPs — with PKR billing, WhatsApp reminders, and support for Pakistan's common devices (TP-Link, Huawei ONU)." },
    { q: "Can I import my Excel records?", a: "Yes! MYISP supports .xlsx and .csv files — your existing data imports directly." },
    { q: "How many customers can one account have?", a: "Unlimited customers on the Business plan. Up to 50 customers free on the Starter plan." },
    { q: "Can my agents use it too?", a: "Yes! Create sub-manager accounts for your field agents — they can collect receipts and log attendance." },
    { q: "Is my data safe? Will it get lost?", a: "Completely safe. Real-time sync happens on Supabase cloud. Break your phone, your data stays safe — log in on another device, everything comes back." },
    { q: "How do I get a demo or trial?", a: "Start free right now — no credit card needed. WhatsApp us at 0304-2773453 if you need any help." }
  ];

  return (
    <div className="pt-32 pb-32 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Features Grid */}
        <div className="text-center mb-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-8"
          >
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-[0.2em]">System Architecture</span>
          </motion.div>
          <h1 className="font-bold tracking-tight leading-none mb-4 select-none"
            style={{
              fontSize: 'clamp(2.5rem, 7vw, 6rem)',
              color: '#f1f5f9',
              textShadow: '0 0 80px rgba(99,102,241,0.5)',
            }}>Core <br /> Infrastructure</h1>
          <p className="max-w-2xl mx-auto text-base md:text-lg font-medium leading-relaxed mb-8 drop-shadow-md text-slate-300">
            Engineered for high-performance ISP management. Every component is optimized 
            for speed, reliability, and absolute data privacy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32">
          {[
            { title: 'Customer Management', desc: 'Add and edit customers, assign plans, track expiry — all in one place.', icon: <Users className="w-8 h-8" /> },
            { title: 'Digital Receipts', desc: 'Generate professional invoices, share on WhatsApp — in one tap.', icon: <LayoutIcon className="w-8 h-8" /> },
            { title: 'Recovery Ledger', desc: 'A complete record of monthly collections — who paid, who hasn\'t, who expired — all clear.', icon: <Activity className="w-8 h-8" /> },
            { title: 'Equipment Tracker', desc: 'Routers, ONUs, switches — assign to customers, take back, manage inventory.', icon: <Database className="w-8 h-8" /> },
            { title: 'Leads Pipeline', desc: 'Track new inquiries — from contacted to install pending, see your conversion rate.', icon: <Zap className="w-8 h-8" /> },
            { title: 'Aging Report', desc: 'How much money has been pending for how long — 0-30, 30-60, 60-90, 90+ day breakdown.', icon: <Smartphone className="w-8 h-8" /> },
            { title: 'Area Dashboard', desc: 'Active/expired breakdown for each area, revenue and pending amounts separated.', icon: <ShieldCheck className="w-8 h-8" /> },
            { title: 'Suspension Log', desc: 'Suspend and restore connections with reason and full history log.', icon: <Lock className="w-8 h-8" /> },
            { title: 'Outage Tracker', desc: 'Log network downtime — affected areas, severity, duration — all tracked.', icon: <CheckCircle className="w-8 h-8" /> },
          ].map((feature, idx) => (
            <motion.div 
              key={idx} 
              className="p-12 bg-white/10 backdrop-blur-md rounded-[3rem] border border-white/20 shadow-xl hover:border-indigo-500/50 transition-all group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-10 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-3xl font-black mb-6 uppercase tracking-tight text-white">{feature.title}</h3>
              <p className="text-slate-300 text-lg leading-relaxed font-medium">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Advanced Capabilities */}
        <div className="mb-40">
          <div className="text-center mb-24">
            <h2 className="text-5xl md:text-7xl font-bold uppercase tracking-tighter mb-6 text-white">Advanced <br /> Capabilities</h2>
            <p className="text-indigo-300 font-bold uppercase text-[10px] tracking-[0.4em]">Enterprise-Grade Infrastructure</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div 
              className="p-12 bg-white/10 backdrop-blur-md rounded-[4rem] text-white relative overflow-hidden group shadow-2xl border border-white/20"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
                  <Activity className="w-8 h-8" />
                </div>
                <h3 className="text-4xl font-black mb-6 uppercase tracking-tight">AI Recovery Engine</h3>
                <p className="text-slate-100 text-lg leading-relaxed font-medium mb-8">
                  Our proprietary AI analyzes payment patterns to predict potential defaults before they happen, 
                  allowing you to take proactive measures.
                </p>
                <div className="flex gap-4">
                  <div className="px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">Predictive Analytics</div>
                  <div className="px-4 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">Smart Alerts</div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              className="p-12 bg-white/10 backdrop-blur-md rounded-[4rem] text-white relative overflow-hidden group shadow-2xl border border-white/20"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -ml-32 -mb-32 group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-8 text-indigo-400">
                  <Database className="w-8 h-8" />
                </div>
                <h3 className="text-4xl font-black mb-6 uppercase tracking-tight">Multi-Node Sync</h3>
                <p className="text-slate-200 text-lg leading-relaxed font-medium mb-8">
                  Manage multiple ISP branches with real-time data synchronization. 
                  Every node stays updated across all your devices instantly.
                </p>
                <div className="flex gap-4">
                  <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest">Cloud Relay</div>
                  <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest">Conflict Resolution</div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            {[
              { title: 'WhatsApp API', desc: 'Direct integration for automated receipt delivery.', icon: <Smartphone className="w-6 h-6" /> },
              { title: 'Excel Engine', desc: 'High-speed bulk import/export for thousands of records.', icon: <Database className="w-6 h-6" /> },
              { title: 'Offline First', desc: 'Full functionality even without an active internet connection.', icon: <ShieldCheck className="w-6 h-6" /> },
            ].map((item, idx) => (
              <motion.div 
                key={idx}
                className="p-10 bg-white/10 backdrop-blur-md rounded-[3rem] border border-white/20 shadow-xl hover:border-indigo-500/50 transition-all"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 mb-6">
                  {item.icon}
                </div>
                <h4 className="text-xl font-black mb-3 uppercase tracking-tight text-white">{item.title}</h4>
                <p className="text-slate-200 text-sm font-medium leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-5xl font-black uppercase tracking-tighter mb-6 text-white">System FAQ</h2>
            <p className="text-slate-200 font-bold uppercase text-[10px] tracking-[0.4em]">Technical Support</p>
          </div>
          <div className="space-y-6">
            {faqs.map((faq, idx) => (
              <motion.div 
                key={idx} 
                className="bg-white/10 backdrop-blur-md rounded-[2.5rem] border border-white/20 overflow-hidden shadow-sm hover:border-indigo-500/30 transition-all"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <button 
                  className="w-full p-10 text-left flex justify-between items-center group"
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                >
                  <span className="text-xl font-black uppercase tracking-tight group-hover:text-indigo-400 transition-colors text-white">{faq.q}</span>
                  <div className={`w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center transition-all ${activeFaq === idx ? 'rotate-180 bg-indigo-500 text-white' : 'text-slate-400'}`}>
                    <ChevronDown className="w-6 h-6" />
                  </div>
                </button>
                {activeFaq === idx && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-10 pb-10 text-slate-300 text-lg font-medium leading-relaxed"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;
