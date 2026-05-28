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

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/features', label: 'Features' },
    { path: '/about', label: 'About' },
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 relative overflow-hidden text-white bg-slate-950`}>

      {/* 3D Three.js Background */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <ThreeBackground isDark={isDark} />
        {/* Subtle overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/50 to-slate-950/70" />
      </div>

      {/* Main Container - Z-Index above background */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Navigation */}
        <nav className={`fixed top-0 w-full z-[100] border-b px-4 sm:px-6 py-4 flex justify-between items-center sm:grid sm:grid-cols-3 transition-colors border-white/5 bg-slate-950/20 backdrop-blur-md`}>
          <div className="justify-self-start">
            <Link to="/" className="flex items-center gap-3">
              {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[100px] sm:w-[120px] h-auto object-contain" referrerPolicy="no-referrer" />}
            </Link>
          </div>

          <div className="justify-self-center hidden sm:flex items-center gap-4 sm:gap-8 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-300">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`transition-colors whitespace-nowrap ${location.pathname === link.path ? 'text-indigo-400' : 'hover:text-white'}`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="justify-self-end flex items-center gap-4">
            <button
              onClick={onGetStarted}
              className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/50 transition-all active:scale-95 hover:shadow-indigo-500/70 hover:-translate-y-0.5"
            >
              Manager Login
            </button>
          </div>
        </nav>

        {/* Page Content */}
        <main className="flex-1 w-full pt-20">
          <Routes>
            <Route path="/" element={<Home onGetStarted={onGetStarted} />} />
            <Route path="/features" element={<Features onGetStarted={onGetStarted} />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="pt-32 pb-10 px-6 border-t border-white/10 mt-auto bg-slate-950/40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-24">
              <div className="col-span-2">
                <div className="flex items-center gap-3 mb-8">
                  {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[76px] h-[76px] object-contain" referrerPolicy="no-referrer" />}
                </div>
                <p className="text-slate-300 max-w-sm font-medium text-lg leading-relaxed">
                  The world's most advanced ISP management infrastructure.
                  Built for speed, reliability, and absolute privacy.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Platform</h4>
                <ul className="space-y-5 text-sm font-bold text-slate-300">
                  <li><Link to="/features" className="hover:text-indigo-400 transition-colors">Infrastructure</Link></li>
                  <li><a href="#" className="hover:text-indigo-400 transition-colors">Security</a></li>
                  <li><a href="#" className="hover:text-indigo-400 transition-colors">Status</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8">Company</h4>
                <ul className="space-y-5 text-sm font-bold text-slate-300">
                  <li><Link to="/about" className="hover:text-indigo-400 transition-colors">About Us</Link></li>
                  <li><a href="#" className="hover:text-indigo-400 transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-indigo-400 transition-colors">Contact</a></li>
                </ul>
              </div>
            </div>
            <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 MYISP Infrastructure. All rights reserved.</p>
              <div className="flex gap-8">
                {['Twitter', 'GitHub', 'LinkedIn'].map(social => (
                  <a key={social} href="#" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-colors">{social}</a>
                ))}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;