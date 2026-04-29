
import React from 'react';
import { motion } from 'motion/react';
import { Shield, Target, Zap, Users, Globe, Cpu, Star } from 'lucide-react';

const About: React.FC = () => {
  return (
    <div className="pt-32 pb-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Mission Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center mb-40">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-block px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20 mb-8">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Our Mission</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-10 leading-[0.9] text-slate-900 dark:text-white">Architecting <br /> Digital Trust</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xl mb-10 leading-relaxed font-medium">
              MYISP was born out of the need for a robust, offline-first management system 
              that doesn't compromise on speed or security. We understand the challenges of 
              managing a growing subscriber base, and we've built the tools to help you scale 
              with absolute precision.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="text-3xl font-black text-indigo-600 mb-2">10k+</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nodes Deployed</p>
              </div>
              <div>
                <h4 className="text-3xl font-black text-indigo-600 mb-2">99.9%</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Uptime</p>
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            className="relative"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="aspect-square bg-slate-900 rounded-[4rem] border border-white/5 shadow-2xl overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-40 h-40 text-indigo-500/20" />
              </div>
              <div className="absolute top-12 left-12 right-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <Shield className="w-6 h-6" />
                  </div>
                  <span className="text-xl font-black tracking-tight uppercase text-white">MYISP Core</span>
                </div>
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-2 bg-white/5 rounded-full w-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-500"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${Math.random() * 60 + 40}%` }}
                        transition={{ duration: 1.5, delay: i * 0.2 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl -z-10"></div>
          </motion.div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-40">
          {[
            { title: 'Privacy First', desc: 'Your data never leaves your device. We use industry-standard AES-256 encryption.', icon: <Shield className="w-6 h-6" /> },
            { title: 'High Performance', desc: 'Built with a high-speed processing engine to handle thousands of records instantly.', icon: <Zap className="w-6 h-6" /> },
            { title: 'User Centric', desc: 'Designed for ISP managers, by people who understand the network business.', icon: <Users className="w-6 h-6" /> },
          ].map((v, idx) => (
            <div key={idx} className="p-12 bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-white/5 shadow-xl">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 mb-8">
                {v.icon}
              </div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tight text-slate-900 dark:text-white">{v.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-20 text-slate-900 dark:text-white">Trusted by <br /> Network Engineers</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: "Ahmad Khan", role: "ISP Owner", quote: "MYISP transformed how we handle recoveries. The precision is unmatched." },
                { name: "Sarah Malik", role: "Network Manager", quote: "The offline capability is a lifesaver for our field operations." },
                { name: "Bilal Sheikh", role: "Operations Lead", quote: "Professional receipts have made us look credible and trustworthy." }
              ].map((t, idx) => (
                <div key={idx} className="p-10 bg-slate-50 dark:bg-slate-950/50 rounded-[3rem] text-left border border-slate-100 dark:border-white/5">
                  <div className="flex gap-1 mb-6">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />)}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 font-medium mb-8 italic leading-relaxed">"{t.quote}"</p>
                  <div>
                    <p className="font-black uppercase tracking-tight text-sm text-slate-900 dark:text-white">{t.name}</p>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default About;
