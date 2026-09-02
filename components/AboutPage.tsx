import React from 'react';
import { Link } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import { ArrowLeft, Mail, Users, Target, MapPin, MessageCircle, ShieldCheck, Zap } from 'lucide-react';

interface Props {
  onBack?: () => void;
}

const AboutPage: React.FC<Props> = ({ onBack }) => {
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
                <span className="text-indigo-600">About</span>
                <Link to="/privacy" className="text-slate-600 transition-colors hover:text-indigo-600">Privacy</Link>
                <Link to="/terms" className="text-slate-600 transition-colors hover:text-indigo-600">Terms</Link>
                <Link to="/faq" className="text-slate-600 transition-colors hover:text-indigo-600">FAQ</Link>
                <Link to="/contact" className="text-slate-600 transition-colors hover:text-indigo-600">Contact</Link>
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
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Legal & Trust Center</span>
              </div>
              <h1 className="text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-6xl">
                About <span className="bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Bill Collector</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                Billing and WhatsApp support software built by an ISP operator, for ISP operators.
              </p>
            </div>

            <section className="rounded-[28px] border border-slate-900/10 bg-white/80 p-6 shadow-2xl shadow-slate-300/35 backdrop-blur-xl sm:p-10">
              <div className="mb-8 flex items-center gap-4 border-b border-slate-200/80 pb-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 via-indigo-50 to-purple-100 text-indigo-600 shadow-inner shadow-indigo-200/40">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600">Our Mission</p>
                  <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Take the ISP billing headache off your plate</h2>
                </div>
              </div>
              <p className="text-[13px] font-medium leading-relaxed text-slate-600 sm:text-sm">
                Small and mid-sized internet service providers in Pakistan still run billing on notebooks, WhatsApp chats, and memory. That means missed renewals, lost customer history, and hours spent every month chasing payments manually. Bill Collector exists to replace that with a single dashboard — customer records, receipts, expiry tracking, recovery ledgers, and automated WhatsApp reminders — so an ISP operator can run their business instead of running after their own records.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">Who's Behind It</h3>
                  <p className="text-[13px] font-medium leading-relaxed text-slate-600">
                    Bill Collector is built and operated by Mahad, an ISP owner-operator running his own network (MahadNet) in Pakistan. It's a solo-built platform — every feature comes from a real, day-to-day problem faced while billing and supporting real subscribers, not a guess at what ISPs might need.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">Where We Operate</h3>
                  <p className="text-[13px] font-medium leading-relaxed text-slate-600">
                    Based in Pakistan and built specifically for the Pakistani ISP market — PKR pricing, local payment methods (bank transfer, EasyPaisa, JazzCash), and WhatsApp-first customer communication, since that's how ISPs here actually talk to subscribers.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">What Makes It Different</h3>
                  <p className="text-[13px] font-medium leading-relaxed text-slate-600">
                    NetBot, our WhatsApp support bot, answers billing questions and sends renewal reminders automatically — built directly on top of the same customer records your team already manages, not a bolt-on chatbot.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">Our Commitment</h3>
                  <p className="text-[13px] font-medium leading-relaxed text-slate-600">
                    Your customer data stays scoped to your account. See our <Link to="/privacy" className="text-indigo-600 underline">Privacy Policy</Link> for exactly what's collected and how it's used.
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 text-center">
                <p className="text-[13px] font-semibold text-slate-700">Questions before you sign up?</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                  <a href="mailto:support@billcollector.online" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-indigo-600 shadow-sm transition-all hover:-translate-y-0.5">
                    <Mail className="h-3.5 w-3.5" /> Email Us
                  </a>
                  <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:-translate-y-0.5">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Us
                  </a>
                </div>
              </div>
            </section>
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

export default AboutPage;
