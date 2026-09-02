import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import { ArrowLeft, Mail, ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  { q: 'What is Bill Collector?', a: 'Bill Collector is a cloud-based billing and management platform for internet service providers. It handles customer records, receipts, expiry/renewal tracking, recovery ledgers, team access, and optional WhatsApp customer support (NetBot) — all from one dashboard.' },
  { q: 'Is there a free plan?', a: 'Yes. The Free tier lets you manage up to 50 customers with core features so you can try the platform before upgrading. Paid tiers (Starter, Growth, Business, Enterprise, Custom) raise the customer limit and unlock more features.' },
  { q: 'How do I pay for a subscription?', a: 'Payments are made through bank transfer, EasyPaisa, or JazzCash. There is no automated card gateway — you submit payment proof during signup or upgrade, and it is verified manually, usually within the same day.' },
  { q: 'What is NetBot and is it included in my plan?', a: 'NetBot is our AI-powered WhatsApp support bot that answers billing questions and sends renewal reminders automatically to your customers. It is a separate, optional product with its own pricing (Text-Only, Basic, Pro tiers) and is not bundled into any ISP plan — you can add it whenever you\'re ready.' },
  { q: 'Do I need my own WhatsApp Business account for NetBot?', a: 'Yes. You connect your own Meta WhatsApp Business API credentials. Bill Collector does not provide or bill for WhatsApp messaging itself — Meta charges for message usage separately, directly to your Meta Business account.' },
  { q: 'Is my customer data safe and private?', a: 'Yes. Your data is isolated to your own account through database-level access rules, so other Managers cannot see your customer records. See our Privacy Policy for full detail on what is collected and how it\'s used.' },
  { q: 'What happens if I stop paying?', a: 'Your account may be suspended, which restricts access to the dashboard. Your data is retained for a period afterward in case you want to reactivate — it isn\'t deleted immediately.' },
  { q: 'Can I add my team or field agents?', a: 'Yes. You can create sub-manager and field-agent accounts, each with their own login and configurable permissions, up to the limit of your plan.' },
  { q: 'What if I lose my password?', a: 'Use the account-recovery flow on the login page, or contact support at support@billcollector.online or on WhatsApp and we\'ll help you regain access.' },
  { q: 'Can I cancel or downgrade anytime?', a: 'Yes. Contact support to downgrade, cancel, or ask about your current plan — requests are reviewed and confirmed manually since billing isn\'t automated.' },
];

interface Props {
  onBack?: () => void;
}

const FAQPage: React.FC<Props> = ({ onBack }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

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
                <Link to="/privacy" className="text-slate-600 transition-colors hover:text-indigo-600">Privacy</Link>
                <Link to="/terms" className="text-slate-600 transition-colors hover:text-indigo-600">Terms</Link>
                <span className="text-indigo-600">FAQ</span>
              </div>

              <div className="flex items-center gap-2">
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
          <div className="mx-auto max-w-3xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Frequently Asked Questions</span>
              </div>
              <h1 className="text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-6xl">
                Got <span className="bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Questions?</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                Everything you need to know before getting started with Bill Collector.
              </p>
            </div>

            <div className="space-y-3">
              {FAQS.map((item, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-slate-900/10 bg-white/80 shadow-lg shadow-slate-300/20 backdrop-blur-xl">
                  <button
                    onClick={() => setOpenIndex(openIndex === i ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
                  >
                    <span className="flex items-start gap-3 text-sm font-black text-slate-900 sm:text-base">
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      {item.q}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openIndex === i && (
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                      <p className="pl-7 text-[13px] font-medium leading-relaxed text-slate-600 sm:text-sm">{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 text-center">
              <p className="text-[13px] font-semibold text-slate-700">Still have a question?</p>
              <Link to="/contact" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:-translate-y-0.5">
                <Mail className="h-3.5 w-3.5" /> Contact Support
              </Link>
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
                <Link to="/privacy" className="transition-colors hover:text-indigo-600">Privacy Policy</Link>
                <Link to="/terms" className="transition-colors hover:text-indigo-600">Terms</Link>
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

export default FAQPage;
