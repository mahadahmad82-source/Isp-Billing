import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './landing/Home';
import About from './landing/About';
import Features from './landing/Features';
import ThreeBackground from './landing/ThreeBackground';
import { logoBase64 } from '../utils/logoBase64';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const location = useLocation();
  const [isDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/features', label: 'Features' },
    { path: '/about', label: 'About' },
  ];

  return (
    <div className="min-h-screen font-sans transition-colors duration-500 relative overflow-hidden text-white bg-slate-950">

      {/* 3D Background */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <ThreeBackground isDark={isDark} />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/50 to-slate-950/70" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── NAVBAR ── */}
        <nav className="fixed top-0 w-full z-[100] border-b px-4 sm:px-6 py-4 border-white/5 bg-slate-950/20 backdrop-blur-md">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
              {logoBase64 && <img src={logoBase64} alt="Bill Collector Logo" className="w-[150px] sm:w-[180px] h-auto object-contain" referrerPolicy="no-referrer" />}
            </Link>

            {/* Desktop nav links - Center */}
            <div className="hidden sm:flex items-center gap-8 text-[10px] font-bold uppercase tracking-widest text-slate-300 absolute left-1/2 transform -translate-x-1/2">
              {navLinks.map(link => (
                <Link key={link.path} to={link.path}
                  className={`transition-colors whitespace-nowrap ${location.pathname === link.path ? 'text-indigo-400' : 'hover:text-white'}`}>
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <a href="/portal"
                className="backdrop-blur-md border border-white/20 bg-white/10 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-white/20 transition-all"
              >
                <span>👤</span> User Portal
              </a>
              <button onClick={onGetStarted}
                className="backdrop-blur-md border border-white/20 bg-white/10 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-white/20 transition-all"
              >
                Manager Login
              </button>
              {/* Mobile hamburger */}
              <button onClick={() => setMenuOpen(o => !o)}
                className="sm:hidden flex flex-col gap-1.5 p-2 rounded-xl bg-white/5 border border-white/10 active:scale-95 transition-all">
                <span className={`block w-5 h-0.5 bg-white transition-all ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}/>
                <span className={`block w-5 h-0.5 bg-white transition-all ${menuOpen ? 'opacity-0' : ''}`}/>
                <span className={`block w-5 h-0.5 bg-white transition-all ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}/>
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile slide-down menu */}
        {menuOpen && (
          <div className="fixed top-[72px] left-0 right-0 z-[99] bg-slate-950/95 backdrop-blur-xl border-b border-white/10 flex flex-col sm:hidden">
            {navLinks.map(link => (
              <Link key={link.path} to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`px-6 py-4 text-sm font-bold uppercase tracking-widest border-b border-white/5 transition-colors ${
                  location.pathname === link.path ? 'text-indigo-400 bg-indigo-500/5' : 'text-white/70 hover:text-white'
                }`}>
                {link.label}
              </Link>
            ))}
            <a href="/portal"
              onClick={() => setMenuOpen(false)}
              className="px-6 py-4 text-sm font-bold text-cyan-400 flex items-center gap-2 border-b border-white/5">
              <span>👤</span> User Portal
            </a>
            <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector"
              target="_blank" rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="px-6 py-4 text-sm font-bold text-emerald-400 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.172.199-.341.223-.569.027-.228-.196-.755-.739-1.24-1.81-.309-.529-.618-1.487-.674-1.68-.034-.118-.11-.203-.229-.271-.112-.062-.294-.17-.442-.256-.149-.087-.298-.191-.323-.229-.032-.052-.011-.239.021-.375.032-.136.159-.822.242-1.242.082-.42.144-.72.144-.72s.019-.203.105-.35c.086-.147.261-.18.36-.18h.264c.117 0 .294.009.359.121.1.176.342.915.414 1.05.031.058.053.1.053.152 0 .051.039.119.088.206.049.087.212.335.459.574.247.239.509.497.559.56.05.063.1.15.064.241-.036.091-.167.406-.212.545-.045.14-.09.165-.206.11-.116-.054-.377-.139-.732-.431-.355-.292-.668-.77-.734-.868-.034-.049-.083-.131-.145-.229-.062-.098-.124-.117-.204-.117-.08 0-.237.029-.361.203-.124.174-.475 1.063-.567 1.348-.092.285-.092.498-.092.498s0 .239.088.501c.088.262.321.632.492.848.171.216.559.559.973.856.414.297.736.447.921.498.185.051.333.034.437-.114.104-.148.45-.93.568-1.24.118-.31.177-.364.295-.364.117 0 .24.088.363.088.123 0 .294-.018.478-.055zm-7.35-14.318c5.422 0 9.821 4.398 9.821 9.821 0 5.422-4.398 9.821-9.821 9.821-1.81 0-3.516-.491-4.984-1.347l-.356.024-1.46.479.479-1.46.024-.356c-.856-1.468-1.347-3.174-1.347-4.984 0-5.422 4.398-9.821 9.821-9.821z"/></svg>
              WhatsApp Now
            </a>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 w-full pt-20">
          <Routes>
            <Route path="/" element={<Home onGetStarted={onGetStarted} />} />
            <Route path="/features" element={<Features onGetStarted={onGetStarted} />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        {/* ── FOOTER ── */}
        <footer className="pt-20 pb-10 px-6 border-t border-white/10 mt-auto bg-slate-950/40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              <div className="col-span-2">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector Logo" className="w-[110px] h-[110px] object-contain mb-6" referrerPolicy="no-referrer" />}
                <p className="text-slate-300 max-w-sm font-medium text-base leading-relaxed mb-6">
                  Pakistan's best ISP billing and management platform. From small to enterprise — built for every ISP.
                </p>
                {/* WhatsApp contact */}
                <div className="flex flex-col gap-2">
                <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector"
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600/20 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold hover:bg-green-600/30 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.16[...]"/></svg>
                  WhatsApp: 0304-2773453
                </a>
                <a href="mailto:myispnetwork@gmail.com"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-600/30 transition[...]"
                >
                  ✉️ myispnetwork@gmail.com
                </a>
              </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Platform</h4>
                <ul className="space-y-4 text-sm font-bold text-slate-300">
                  <li><Link to="/features" className="hover:text-indigo-400 transition-colors">Features</Link></li>
                  <li><Link to="/about" className="hover:text-indigo-400 transition-colors">About</Link></li>
                  <li><a href="https://wa.me/923042773453" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">Contact</a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-bold text-slate-300">
                  <li><Link to="/terms" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link></li>
                  <li><Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Use</Link></li>
                  <li>
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                      All Systems Operational
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 Bill Collector. Made for Pakistani ISPs.</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Powered by myispnetwork@gmail.com</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
