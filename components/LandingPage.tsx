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
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/70 active:scale-95 whitespace-nowrap hidden sm:flex items-center gap-2">
                <span>👤</span> User Portal
              </a>
              <button onClick={onGetStarted}
                className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/70 active:scale-95 whitespace-nowrap hidden sm:block">
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.339.223-.606.027-.247-.181-.82-.609-1.034-.845-.215-.227-.451-.249-.659-.027-.206.179-.789.737-.989.921-.198.183-.389.204-.656.023-.267-.182-.893-.33-1.698-1.046-.628-.56-1.052-1.251-1.174-1.518-.12-.267.013-.411.095-.544.097-.134.216-.335.323-.502.107-.167.214-.278.322-.417.107-.139.053-.261-.026-.365-.079-.103-.629-1.513-.864-2.07-.229-.557-.458-.481-.629-.489-.163-.009-.35-.01-.537-.01-.187 0-.492.07-.75.35-.258.28-.987.964-.987 2.354 0 1.39.01 2.769.142 3.221.131.452.864 1.869 2.084 2.965 1.22 1.096 2.271 1.535 2.722 1.588.451.052.885-.017 1.226-.304.341-.287.489-.74.679-1.174.19-.434.372-.723.571-.735.2-.012.41.144.6.352.19.209.412.571.612.928.2.356.405.627.664.627.259 0 .51-.121.748-.364 1.204-1.207 1.738-2.933 1.738-4.604 0-.347-.033-1.052-.269-1.566z"/></svg>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.339.223-.606.027-.247-.181-.82-.609-1.034-.845-.215-.227-.451-.249-.659-.027-.206.179-.789.737-.989.921-.198.183-.389.204-.656.023-.267-.182-.893-.33-1.698-1.046-.628-.56-1.052-1.251-1.174-1.518-.12-.267.013-.411.095-.544.097-.134.216-.335.323-.502.107-.167.214-.278.322-.417.107-.139.053-.261-.026-.365-.079-.103-.629-1.513-.864-2.07-.229-.557-.458-.481-.629-.489-.163-.009-.35-.01-.537-.01-.187 0-.492.07-.75.35-.258.28-.987.964-.987 2.354 0 1.39.01 2.769.142 3.221.131.452.864 1.869 2.084 2.965 1.22 1.096 2.271 1.535 2.722 1.588.451.052.885-.017 1.226-.304.341-.287.489-.74.679-1.174.19-.434.372-.723.571-.735.2-.012.41.144.6.352.19.209.412.571.612.928.2.356.405.627.664.627.259 0 .51-.121.748-.364 1.204-1.207 1.738-2.933 1.738-4.604 0-.347-.033-1.052-.269-1.566z"/></svg>
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
                  <li><span className="text-slate-500 cursor-default">Privacy Policy</span></li>
                  <li><span className="text-slate-500 cursor-default">Terms of Use</span></li>
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
