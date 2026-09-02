import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import { ArrowLeft, Database, Server, Share2, Clock, UserCheck, Cookie, Baby, RefreshCcw, Mail, Users } from 'lucide-react';

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: { heading?: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'collect',
    icon: <Database className="w-4 h-4" />,
    title: 'Information We Collect',
    content: [
      { heading: 'Account Information', text: 'When you sign up as a Manager, we collect your username, password (stored hashed, never in plain text), and any contact details you provide, such as an email address for password recovery.' },
      { heading: 'Business & Customer Data', text: 'The customer records, receipts, balances, addresses, phone numbers, CNIC details, and other business information you enter into the Platform to run your ISP operation.' },
      { heading: 'WhatsApp Messages (NetBot)', text: 'If you enable NetBot, incoming WhatsApp messages and voice notes from your customers are stored in your account inbox and processed to generate replies. This only applies to Managers who connect their own WhatsApp Business number.' },
      { heading: 'Usage & Device Data', text: 'Basic technical data such as browser type, device type, and general usage patterns within the app, used only to diagnose issues and improve reliability.' },
    ],
  },
  {
    id: 'use',
    icon: <Server className="w-4 h-4" />,
    title: 'How We Use Information',
    content: [
      { heading: 'Providing the Service', text: 'To run the core billing, receipt, customer-management, reporting, and team features you and your sub-managers use every day.' },
      { heading: 'NetBot / WhatsApp Automation', text: 'To classify incoming customer messages, transcribe voice notes, generate AI replies, and send renewal or billing reminders on your behalf, if NetBot is enabled.' },
      { heading: 'Account Security', text: 'To detect suspicious login activity, enforce access controls, and protect your account and data from unauthorized access.' },
      { heading: 'Support & Communication', text: 'To respond to your support requests and send service-related notices, such as renewal or maintenance notifications.' },
      { heading: 'What We Do Not Do', text: 'We do not sell, rent, or trade your business or customer data to third parties for marketing purposes.' },
    ],
  },
  {
    id: 'storage',
    icon: <Share2 className="w-4 h-4" />,
    title: 'Storage & Third Parties',
    content: [
      { heading: 'Where Data Lives', text: 'Your account data is stored in Supabase (cloud database and storage) and cached locally in your browser via localStorage for offline resilience. Clearing browser data removes only the local cache, not the cloud copy.' },
      { heading: 'Hosting', text: 'The application and serverless functions run on Vercel. Vercel processes web traffic to serve the app and route API requests but does not have standing access to your database.' },
      { heading: 'AI Providers', text: 'If NetBot is enabled, message text and voice notes may be sent to AI providers (Groq for text/speech-to-text, Google Gemini for classification, vision, and text-to-speech) solely to generate a reply. These providers process the data under their own terms and do not use it to train models on your behalf.' },
      { heading: 'Meta / WhatsApp', text: 'NetBot connects to your own Meta WhatsApp Business API account. Meta processes message delivery under its own privacy policy, entirely separate from Bill Collector.' },
      { heading: 'Data Isolation', text: 'Each Manager\'s data is scoped to their own account through database-level access rules (Row Level Security). Other Managers cannot query or read your customer data.' },
    ],
  },
  {
    id: 'retention',
    icon: <Clock className="w-4 h-4" />,
    title: 'Data Retention',
    content: [
      { heading: 'Active Accounts', text: 'Data is retained for as long as your account is active, so you have continuous access to customer history, receipts, and reports.' },
      { heading: 'After Account Closure', text: 'If you close your account or stop paying, data may be retained for a limited period for backup, legal, dispute-resolution, or fraud-prevention purposes before deletion.' },
      { heading: 'Deletion Requests', text: 'You can request deletion of your account and associated data by contacting support@billcollector.online. We will confirm what can be deleted immediately versus what must be retained temporarily for legal or security reasons.' },
    ],
  },
  {
    id: 'rights',
    icon: <UserCheck className="w-4 h-4" />,
    title: 'Your Rights & Choices',
    content: [
      { heading: 'Access & Correction', text: 'You can view and edit most of your account and customer data directly within the dashboard at any time.' },
      { heading: 'Export', text: 'Reports and receipts can be exported from within the app. Contact support if you need a full data export in another format.' },
      { heading: 'Your Customers\' Data', text: 'As the Manager, you are the data controller for your customers\' information. You are responsible for honoring any requests your own customers make about their data, and for having a lawful basis to store it.' },
      { heading: 'Deletion', text: 'You may request deletion of your Manager account and data at any time, subject to the retention limits described above.' },
    ],
  },
  {
    id: 'cookies',
    icon: <Cookie className="w-4 h-4" />,
    title: 'Cookies & Local Storage',
    content: [
      { heading: 'No Advertising Cookies', text: 'Bill Collector does not use third-party advertising or tracking cookies.' },
      { heading: 'Functional Local Storage', text: 'The app uses browser localStorage and Supabase session tokens to keep you logged in and to cache data for a faster, more reliable experience — this is functional, not for tracking.' },
    ],
  },
  {
    id: 'children',
    icon: <Baby className="w-4 h-4" />,
    title: "Children's Privacy",
    content: [
      { text: 'Bill Collector is a business tool intended for ISP operators and their staff, not for use by children. We do not knowingly collect personal information directly from children under 13.' },
    ],
  },
  {
    id: 'changes',
    icon: <RefreshCcw className="w-4 h-4" />,
    title: 'Changes to This Policy',
    content: [
      { text: 'This Privacy Policy may be updated from time to time to reflect changes in our practices or for legal reasons. The updated version will be posted on this page with a revised effective date. Continued use of the Platform after an update means you accept the revised policy.' },
    ],
  },
];

interface Props {
  onBack?: () => void;
}

const PrivacyPolicy: React.FC<Props> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('collect');
  const current = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  return (
    <div className="min-h-screen overflow-x-hidden text-slate-900">
      <VideoBackground variant="light" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4 md:px-8">
          <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-slate-900/10 bg-white/75 px-4 py-3 shadow-xl shadow-slate-300/50 backdrop-blur-xl sm:px-7">
            <div className="flex w-full items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-3 pl-1 sm:pl-2">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="h-auto w-[95px] object-contain sm:w-[130px]" />}
              </Link>

              <div className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-widest md:flex lg:gap-8">
                <Link to="/" className="text-slate-600 transition-colors hover:text-indigo-600">Home</Link>
                <Link to="/about" className="text-slate-600 transition-colors hover:text-indigo-600">About</Link>
                <span className="text-indigo-600">Privacy</span>
                <Link to="/terms" className="text-slate-600 transition-colors hover:text-indigo-600">Terms</Link>
                <Link to="/faq" className="text-slate-600 transition-colors hover:text-indigo-600">FAQ</Link>
              </div>

              <div className="flex items-center gap-2">
                <a href="/portal" className="hidden items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition-all hover:bg-indigo-100 sm:flex">
                  <Users className="h-3.5 w-3.5 text-indigo-500" /> User Portal
                </a>
                {onBack && (
                  <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 active:scale-95 sm:px-5">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                )}
              </div>
            </div>
          </nav>
        </header>

        <main className="flex-1 px-4 pb-16 pt-32 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Legal & Trust Center</span>
              </div>
              <h1 className="text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-6xl">
                Privacy <span className="bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Policy</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                What we collect, how we use it, and the choices you have — in plain language.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <span className="rounded-lg border border-slate-900/10 bg-white/70 px-3 py-1.5">Bill Collector Platform</span>
                <span className="rounded-lg border border-slate-900/10 bg-white/70 px-3 py-1.5">Effective September 3, 2026</span>
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-600">Version 1.0</span>
              </div>
            </div>

            <div className="grid items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="md:sticky md:top-28">
                <div className="rounded-3xl border border-slate-900/10 bg-white/75 p-3 shadow-xl shadow-slate-300/30 backdrop-blur-xl">
                  <p className="px-3 pb-3 pt-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">On this page</p>
                  <div className="space-y-1">
                    {SECTIONS.map(section => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider transition-all ${
                          activeSection === section.id
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm'
                            : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <span className={activeSection === section.id ? 'text-indigo-600' : 'text-slate-400'}>{section.icon}</span>
                        <span className="leading-tight">{section.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="min-w-0 rounded-[28px] border border-slate-900/10 bg-white/80 p-5 shadow-2xl shadow-slate-300/35 backdrop-blur-xl sm:p-8">
                <div className="mb-8 flex items-center gap-4 border-b border-slate-200/80 pb-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 via-indigo-50 to-purple-100 text-indigo-600 shadow-inner shadow-indigo-200/40">
                    {current.icon}
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600">Bill Collector Privacy</p>
                    <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{current.title}</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  {current.content.map((item, i) => (
                    <article key={i} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-lg hover:shadow-indigo-100/40 sm:p-6">
                      {item.heading && (
                        <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">{item.heading}</h3>
                      )}
                      <p className="text-[13px] font-medium leading-relaxed text-slate-600">{item.text}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-10 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-6">
                  {(() => {
                    const idx = SECTIONS.findIndex(s => s.id === activeSection);
                    const prev = SECTIONS[idx - 1];
                    const next = SECTIONS[idx + 1];
                    return (
                      <>
                        {prev ? (
                          <button onClick={() => setActiveSection(prev.id)} className="inline-flex max-w-[45%] items-center gap-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-indigo-600 sm:text-[11px]">
                            <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{prev.title}</span>
                          </button>
                        ) : <div />}
                        {next && (
                          <button onClick={() => setActiveSection(next.id)} className="inline-flex max-w-[45%] items-center gap-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-indigo-600 sm:text-[11px]">
                            <span className="truncate">{next.title}</span> <ArrowLeft className="h-3.5 w-3.5 shrink-0 rotate-180" />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </section>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-900/10 bg-white/60 px-6 pb-10 pt-14 backdrop-blur-md">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <div className="flex items-center gap-4">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="h-14 w-14 object-contain" />}
                <div>
                  <p className="text-sm font-black text-slate-900">Bill Collector</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Built for Pakistani ISPs</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Link to="/terms" className="transition-colors hover:text-indigo-600">Terms of Service</Link>
                <Link to="/contact" className="transition-colors hover:text-indigo-600">Contact</Link>
                <a href="mailto:support@billcollector.online" className="inline-flex items-center gap-2 transition-colors hover:text-cyan-600">
                  <Mail className="h-3.5 w-3.5" /> Support
                </a>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-900/10 pt-6 text-center sm:flex-row sm:text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">© 2026 Bill Collector. All rights reserved.</p>
              <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-emerald-600 transition-colors hover:text-emerald-700">Contact support on WhatsApp</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
