
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, ChevronDown, Zap, Smartphone, BarChart, Layout as LayoutIcon, Users, Lock, Activity, Database, ShieldCheck } from 'lucide-react';

interface FeaturesProps {
  onGetStarted: () => void;
}

const Features: React.FC<FeaturesProps> = ({ onGetStarted }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const faqs = [
    { q: "How secure is my ISP data?", a: "Your data is stored locally on your device using AES-256 encryption. We never see your customer records." },
    { q: "Can I import my existing Excel records?", a: "Yes! Our smart import engine supports .xlsx and .csv files with automatic field mapping." },
    { q: "Does it work without an internet connection?", a: "Absolutely. Ledgerzo is built as a Progressive Web App (PWA) that works 100% offline." },
    { q: "How do I send receipts to customers?", a: "You can share professional digital receipts directly via WhatsApp or SMS with one click." }
  ];

  return (
    <div className="pt-32 pb-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Features Grid */}
        <div className="text-center mb-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-8"
          >
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">System Architecture</span>
          </motion.div>
          <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter mb-8 leading-[0.9] text-slate-900 dark:text-white">Core <br /> Infrastructure</h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto text-lg font-medium">
            Engineered for high-performance ISP management. Every component is optimized 
            for speed, reliability, and absolute data privacy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-40">
          {[
            { title: 'Automated Billing', desc: 'Generate monthly invoices and receipts automatically with zero manual entry.', icon: <Zap className="w-8 h-8" /> },
            { title: 'Recovery Alerts', desc: 'Smart tracking for overdue payments with automated WhatsApp and SMS reminders.', icon: <Smartphone className="w-8 h-8" /> },
            { title: 'Deep Analytics', desc: 'Real-time insights into your revenue streams, growth trends, and recovery rates.', icon: <Activity className="w-8 h-8" /> },
            { title: 'Digital Receipts', desc: 'Professional, high-end receipt designs optimized for mobile and digital sharing.', icon: <LayoutIcon className="w-8 h-8" /> },
            { title: 'Bulk Engine', desc: 'Import and export thousands of subscribers via Excel with our high-speed processing engine.', icon: <Database className="w-8 h-8" /> },
            { title: 'Encrypted Storage', desc: 'AES-256 encrypted local storage ensures your data never leaves your device.', icon: <ShieldCheck className="w-8 h-8" /> },
          ].map((feature, idx) => (
            <motion.div 
              key={idx} 
              className="p-12 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl hover:border-indigo-500/50 transition-all group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-10 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-3xl font-black mb-6 uppercase tracking-tight text-slate-900 dark:text-white">{feature.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed font-medium">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Advanced Capabilities */}
        <div className="mb-40">
          <div className="text-center mb-24">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6 text-slate-900 dark:text-white">Advanced <br /> Capabilities</h2>
            <p className="text-indigo-500 font-bold uppercase text-[10px] tracking-[0.4em]">Enterprise-Grade Infrastructure</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div 
              className="p-12 bg-indigo-600 rounded-[4rem] text-white relative overflow-hidden group shadow-2xl"
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
                <p className="text-indigo-100 text-lg leading-relaxed font-medium mb-8">
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
              className="p-12 bg-slate-900 rounded-[4rem] text-white relative overflow-hidden group shadow-2xl border border-white/5"
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
                <p className="text-slate-400 text-lg leading-relaxed font-medium mb-8">
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
                className="p-10 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl hover:border-indigo-500/50 transition-all"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 mb-6">
                  {item.icon}
                </div>
                <h4 className="text-xl font-black mb-3 uppercase tracking-tight text-slate-900 dark:text-white">{item.title}</h4>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-5xl font-black uppercase tracking-tighter mb-6 text-slate-900 dark:text-white">System FAQ</h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em]">Technical Support</p>
          </div>
          <div className="space-y-6">
            {faqs.map((faq, idx) => (
              <motion.div 
                key={idx} 
                className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/5 overflow-hidden shadow-sm hover:border-indigo-500/30 transition-all"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <button 
                  className="w-full p-10 text-left flex justify-between items-center group"
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                >
                  <span className="text-xl font-black uppercase tracking-tight group-hover:text-indigo-500 transition-colors text-slate-900 dark:text-white">{faq.q}</span>
                  <div className={`w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center transition-all ${activeFaq === idx ? 'rotate-180 bg-indigo-500 text-white' : 'text-slate-400'}`}>
                    <ChevronDown className="w-6 h-6" />
                  </div>
                </button>
                {activeFaq === idx && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="px-10 pb-10 text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed"
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
