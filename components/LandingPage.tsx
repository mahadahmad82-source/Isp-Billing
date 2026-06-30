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
              {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[100px] sm:w-[120px] h-auto object-contain" referrerPolicy="no-referrer" />}
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
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 hidden sm:inline-flex items-center gap-2">
                <span>👤</span> User Portal
              </a>
              <button onClick={onGetStarted}
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20">
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
            <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20MYISP"
              target="_blank" rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="px-6 py-4 text-sm font-bold text-emerald-400 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.172.199-.341.156-.534-.048-.193-.205-.76-.94-.922-1.133-.162-.193-.325-.21-.529-.01-.203.199-1.852 2.283-2.102 2.722-.23.441-.476.481-.741.481-.28 0-.58-.088-.888-.088-.309 0-.653.039-.943-.188-.29-.227-.976-.95-1.466-1.701-.372-.49-.743-1.095-1.052-1.691-.307-.596-.615-1.195-.935-1.727-.32-.532-.637-1.034-.922-1.378-.285-.344-.57-.511-.884-.511-.315 0-.63.168-.915.512zm9.973-9.855c-.263-1.232-.803-2.349-1.574-3.262-.77-.914-1.684-1.508-2.742-1.782-1.058-.274-2.268-.099-3.63.525-1.362.624-2.894 1.855-4.596 3.693-1.702 1.838-2.957 3.701-3.766 5.588-.809 1.887-1.214 3.8-1.214 5.738 0 1.938.405 3.851 1.214 5.738.809 1.887 2.064 3.75 3.766 5.588 1.702 1.838 3.234 3.069 4.596 3.693 1.362.624 2.572.799 3.63.525 1.058-.274 1.972-.868 2.742-1.782.771-.913 1.311-2.03 1.574-3.262.263-1.231.197-2.577-.197-4.037-.394-1.46-1.088-3.035-2.082-4.725-.994-1.69-2.288-3.485-3.882-5.385-1.594-1.9-3.188-3.295-4.782-4.185-1.594-.89-3.088-1.275-4.482-1.155-1.394.12-2.588.814-3.582 2.082-1.494 1.877-2.241 4.288-2.241 7.232 0 2.944.747 5.355 2.241 7.232.994 1.268 2.188 1.962 3.582 2.082 1.394.12 2.888-.265 4.482-1.155 1.594-.89 3.188-2.285 4.782-4.185 1.594-1.9 2.888-3.695 3.882-5.385.994-1.69 1.688-3.265 2.082-4.725.394-1.46.46-2.806.197-4.037z" fill="currentColor"/></svg>
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
                {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[76px] h-[76px] object-contain mb-6" referrerPolicy="no-referrer" />}
                <p className="text-slate-300 max-w-sm font-medium text-base leading-relaxed mb-6">
                  Pakistan's best ISP billing and management platform. From small to enterprise — built for every ISP.
                </p>
                {/* WhatsApp contact */}
                <div className="flex flex-col gap-2">
                <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20MYISP"
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600/20 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold hover:bg-green-600/30 transition-all">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.172.199-.341.156-.534-.048-.193-.205-.76-.94-.922-1.133-.162-.193-.325-.21-.529-.01-.203.199-1.852 2.283-2.102 2.722-.23.441-.476.481-.741.481-.28 0-.58-.088-.888-.088-.309 0-.653.039-.943-.188-.29-.227-.976-.95-1.466-1.701-.372-.49-.743-1.095-1.052-1.691-.307-.596-.615-1.195-.935-1.727-.32-.532-.637-1.034-.922-1.378-.285-.344-.57-.511-.884-.511-.315 0-.63.168-.915.512zm9.973-9.855c-.263-1.232-.803-2.349-1.574-3.262-.77-.914-1.684-1.508-2.742-1.782-1.058-.274-2.268-.099-3.63.525-1.362.624-2.894 1.855-4.596 3.693-1.702 1.838-2.957 3.701-3.766 5.588-.809 1.887-1.214 3.8-1.214 5.738 0 1.938.405 3.851 1.214 5.738.809 1.887 2.064 3.75 3.766 5.588 1.702 1.838 3.234 3.069 4.596 3.693 1.362.624 2.572.799 3.63.525 1.058-.274 1.972-.868 2.742-1.782.771-.913 1.311-2.03 1.574-3.262.263-1.231.197-2.577-.197-4.037-.394-1.46-1.088-3.035-2.082-4.725-.994-1.69-2.288-3.485-3.882-5.385-1.594-1.9-3.188-3.295-4.782-4.185-1.594-.89-3.088-1.275-4.482-1.155-1.394.12-2.588.814-3.582 2.082-1.494 1.877-2.241 4.288-2.241 7.232 0 2.944.747 5.355 2.241 7.232.994 1.268 2.188 1.962 3.582 2.082 1.394.12 2.888-.265 4.482-1.155 1.594-.89 3.188-2.285 4.782-4.185 1.594-1.9 2.888-3.695 3.882-5.385.994-1.69 1.688-3.265 2.082-4.725.394-1.46.46-2.806.197-4.037z" fill="currentColor"/></svg>
                  WhatsApp: 0304-2773453
                </a>
                <a href="mailto:myispnetwork@gmail.com"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-600/30 transition-all">
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
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 MYISP. Made for Pakistani ISPs.</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Powered by myispnetwork@gmail.com</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
