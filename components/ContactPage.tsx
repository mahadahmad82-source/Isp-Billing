import React from 'react';
import { Link } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import { ArrowLeft, Mail, MessageCircle, Clock, MapPin, Phone } from 'lucide-react';

interface Props {
  onBack?: () => void;
}

const ContactPage: React.FC<Props> = ({ onBack }) => {
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
                <Link to="/faq" className="text-slate-600 transition-colors hover:text-indigo-600">FAQ</Link>
                <span className="text-indigo-600">Contact</span>
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
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Get In Touch</span>
              </div>
              <h1 className="text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-6xl">
                Contact <span className="bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Us</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                Questions about billing, your account, or NetBot? Reach out — we typically respond within 24 hours.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <a href="mailto:support@billcollector.online" className="group rounded-[24px] border border-slate-900/10 bg-white/80 p-6 shadow-xl shadow-slate-300/30 backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-2xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="mb-1 text-[11px] font-black uppercase tracking-widest text-indigo-600">Email</h3>
                <p className="text-lg font-black text-slate-900">support@billcollector.online</p>
                <p className="mt-2 text-[13px] font-medium text-slate-600">Best for account issues, billing questions, and detailed requests.</p>
              </a>

              <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer" className="group rounded-[24px] border border-slate-900/10 bg-white/80 p-6 shadow-xl shadow-slate-300/30 backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-2xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <h3 className="mb-1 text-[11px] font-black uppercase tracking-widest text-emerald-600">WhatsApp</h3>
                <p className="text-lg font-black text-slate-900">+92 304 2773453</p>
                <p className="mt-2 text-[13px] font-medium text-slate-600">Fastest way to reach us for quick questions and support.</p>
              </a>

              <div className="rounded-[24px] border border-slate-900/10 bg-white/80 p-6 shadow-xl shadow-slate-300/30 backdrop-blur-xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="mb-1 text-[11px] font-black uppercase tracking-widest text-amber-600">Response Time</h3>
                <p className="text-lg font-black text-slate-900">Within 24 hours</p>
                <p className="mt-2 text-[13px] font-medium text-slate-600">WhatsApp messages are usually answered same-day.</p>
              </div>

              <div className="rounded-[24px] border border-slate-900/10 bg-white/80 p-6 shadow-xl shadow-slate-300/30 backdrop-blur-xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <h3 className="mb-1 text-[11px] font-black uppercase tracking-widest text-cyan-600">Based In</h3>
                <p className="text-lg font-black text-slate-900">Pakistan</p>
                <p className="mt-2 text-[13px] font-medium text-slate-600">Built for and operated within the Pakistani ISP market.</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-900/10 bg-white/70 p-5 text-center backdrop-blur-md">
              <p className="flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-700">
                <Phone className="h-4 w-4 text-slate-500" /> Prefer talking on the phone? WhatsApp is the quickest way to set up a call.
              </p>
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

export default ContactPage;
