import React, { useState } from 'react';
import { ArrowLeft, Shield, FileText, CreditCard, Users, Lock, AlertTriangle, Globe, Mail } from 'lucide-react';

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: { heading?: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'acceptance',
    icon: <FileText className="w-4 h-4" />,
    title: 'Terms of Service',
    content: [
      { heading: 'Agreement', text: 'By registering and using myISP, you ("Manager/Operator") agree to these Terms. If you do not agree, do not use the platform.' },
      { heading: 'Service Description', text: 'myISP is a cloud-based ISP billing and management SaaS platform designed for Pakistani Internet Service Providers. It provides customer management, receipt generation, recovery ledger, agent management, and billing analytics tools.' },
      { heading: 'Account Registration', text: 'You must provide accurate information during signup. Each account represents one ISP operator/company. You are responsible for maintaining the confidentiality of your credentials.' },
      { heading: 'Permitted Use', text: 'You may use myISP solely for your own ISP business operations. Reselling, sublicensing, or providing the platform as a service to others without written permission is prohibited.' },
      { heading: 'Modifications', text: 'myISP reserves the right to modify these Terms at any time. Continued use after changes constitutes acceptance of the updated Terms.' },
    ],
  },
  {
    id: 'subscriptions',
    icon: <CreditCard className="w-4 h-4" />,
    title: 'Subscription & Payments',
    content: [
      { heading: 'Free Trial', text: 'New accounts receive a 30-day free trial with access to all Pro features. No credit card is required during the trial period. Trial may be extended or reset at admin discretion.' },
      { heading: 'Plan Tiers', text: 'Starter (up to 150 customers, 1 agent), Business (up to 500 customers, 3 agents), Pro (unlimited customers and agents). Feature access varies by plan as described in the app.' },
      { heading: 'Billing', text: 'Subscription fees are billed in Pakistani Rupees (PKR). Payment is currently processed manually via bank transfer or JazzCash/EasyPaisa as agreed with your account manager. Automated billing may be introduced in future updates.' },
      { heading: 'Refunds', text: 'Subscription payments are non-refundable. In case of service outage exceeding 48 hours caused by myISP infrastructure, a proportional credit may be applied to the next billing cycle.' },
      { heading: 'Suspension', text: 'Accounts with overdue payments may be locked. Locked accounts retain all data but lose access to the platform until payment is cleared. Data is retained for 90 days after account expiry before permanent deletion.' },
    ],
  },
  {
    id: 'data',
    icon: <Shield className="w-4 h-4" />,
    title: 'Data & Privacy',
    content: [
      { heading: 'Your Data', text: 'All customer data you enter into myISP remains your property. myISP does not sell, rent, or share your business data with third parties.' },
      { heading: 'Data Storage', text: 'Data is stored in Supabase PostgreSQL databases hosted on AWS infrastructure (ap-south-1 region). All data is encrypted at rest and in transit using industry-standard TLS/SSL.' },
      { heading: 'Local Storage', text: 'myISP uses browser localStorage as a local cache for faster performance. This data stays on your device. Clearing browser data may remove local cache, but cloud data remains intact.' },
      { heading: 'Customer Data Responsibility', text: 'You are responsible for obtaining appropriate consent from your customers before entering their personal information (name, CNIC, address, phone number) into myISP. You must comply with applicable Pakistani data protection laws and PECA regulations.' },
      { heading: 'Data Backup', text: 'myISP performs regular automated backups. However, you are advised to maintain your own backup copies of critical data. myISP is not liable for data loss resulting from user error.' },
      { heading: 'Analytics', text: 'myISP may collect anonymized usage analytics (feature usage, page views, performance metrics) to improve the platform. No personally identifiable customer data is used for analytics.' },
    ],
  },
  {
    id: 'agents',
    icon: <Users className="w-4 h-4" />,
    title: 'Agents & Sub-Managers',
    content: [
      { heading: 'Agent Accounts', text: 'You may create sub-manager (agent) accounts on your myISP account up to your plan limit. Each agent gets restricted access to selected features as configured by you.' },
      { heading: 'Responsibility', text: 'You are fully responsible for all actions taken by your agents within your myISP account. Ensure your agents are aware of and comply with these Terms.' },
      { heading: 'Agent Data', text: 'Agent attendance logs, activity records, and check-in/check-out data are stored under your account. You may delete agent accounts at any time.' },
      { heading: 'WhatsApp Integration', text: 'If you enable the WhatsApp bot (Ayesha) integration, you acknowledge that WhatsApp messages are subject to Meta\'s terms of service. myISP is not responsible for WhatsApp service availability or policy changes.' },
    ],
  },
  {
    id: 'security',
    icon: <Lock className="w-4 h-4" />,
    title: 'Security & Account',
    content: [
      { heading: 'Account Security', text: 'You are responsible for keeping your login credentials secure. Do not share your password. Use a strong, unique password for your myISP account.' },
      { heading: 'Unauthorized Access', text: 'Notify myISP immediately if you suspect unauthorized access to your account. myISP reserves the right to suspend accounts showing signs of compromise or abuse.' },
      { heading: 'Password Recovery', text: 'Password recovery is currently handled manually via WhatsApp support. Contact support at +92-304-2773453 to initiate a password reset.' },
      { heading: 'Session Management', text: 'Sessions are maintained per device. Logging in on a new device does not automatically log out other sessions. You can manage active sessions from your account settings.' },
    ],
  },
  {
    id: 'prohibited',
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Prohibited Activities',
    content: [
      { text: 'Using myISP for any unlawful purpose or in violation of Pakistani law, including PECA 2016.' },
      { text: 'Attempting to reverse-engineer, decompile, or extract source code from the myISP platform.' },
      { text: 'Uploading malicious code, viruses, or any content that could harm the platform or other users.' },
      { text: 'Creating fake customer records, falsifying receipts, or using myISP for fraudulent billing.' },
      { text: 'Using automated scripts or bots to access myISP APIs beyond normal usage without written permission.' },
      { text: 'Attempting to access another operator\'s data or circumvent access controls.' },
    ],
  },
  {
    id: 'liability',
    icon: <Globe className="w-4 h-4" />,
    title: 'Liability & Disclaimers',
    content: [
      { heading: 'Service Availability', text: 'myISP targets 99.5% uptime but does not guarantee uninterrupted service. Planned maintenance windows will be announced in advance.' },
      { heading: 'Limitation of Liability', text: 'myISP\'s total liability for any claim shall not exceed the amount paid by you for the service in the past 3 months. myISP is not liable for indirect, incidental, or consequential damages including lost profits or data loss.' },
      { heading: 'Third-Party Services', text: 'myISP integrates with Supabase, Vercel, and Meta WhatsApp Business API. myISP is not responsible for downtime or changes in these third-party services.' },
      { heading: 'Governing Law', text: 'These Terms are governed by the laws of Pakistan. Any disputes shall be subject to the exclusive jurisdiction of courts in Karachi, Pakistan.' },
    ],
  },
];

interface Props {
  onBack?: () => void;
}

const TermsAndPolicy: React.FC<Props> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('acceptance');

  const current = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  return (
    <div className="min-h-screen" style={{ background: '#020617' }}>
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl border border-white/8 text-slate-400 hover:text-white hover:border-white/20 transition-all active:scale-95">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white">Terms & Policies</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">myISP Platform — Effective June 2025</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">v2.0</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="md:w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all font-bold text-[11px] uppercase tracking-wider border ${
                  activeSection === section.id
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`}
              >
                <span className={activeSection === section.id ? 'text-indigo-400' : 'text-slate-600'}>{section.icon}</span>
                {section.title}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Section Header */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-white/5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              {current.icon}
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">{current.title}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">myISP Platform Agreement</p>
            </div>
          </div>

          {/* Content Blocks */}
          <div className="space-y-5">
            {current.id === 'prohibited' ? (
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> The following activities are strictly prohibited on myISP:
                </p>
                <ul className="space-y-3">
                  {current.content.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                      <p className="text-[12px] text-slate-400 font-medium leading-relaxed">{item.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              current.content.map((item, i) => (
                <div key={i} className="rounded-2xl border border-white/5 bg-white/2 p-5 hover:border-white/10 transition-colors">
                  {item.heading && (
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-400 mb-2">{item.heading}</h3>
                  )}
                  <p className="text-[12px] text-slate-400 font-medium leading-relaxed">{item.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Section Nav Arrows */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
            {(() => {
              const idx = SECTIONS.findIndex(s => s.id === activeSection);
              const prev = SECTIONS[idx - 1];
              const next = SECTIONS[idx + 1];
              return (
                <>
                  {prev ? (
                    <button onClick={() => setActiveSection(prev.id)} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">
                      <ArrowLeft className="w-3.5 h-3.5" /> {prev.title}
                    </button>
                  ) : <div />}
                  {next && (
                    <button onClick={() => setActiveSection(next.id)} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">
                      {next.title} <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
            © 2025 myISP — All rights reserved. Operated in Pakistan.
          </p>
          <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-400 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Contact Support
          </a>
        </div>
      </div>
    </div>
  );
};

export default TermsAndPolicy;
