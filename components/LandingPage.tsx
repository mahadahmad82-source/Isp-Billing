
import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Shield, Sun, Moon } from 'lucide-react';
import Home from './landing/Home';
import About from './landing/About';
import Features from './landing/Features';

interface LandingPageProps {
  onGetStarted: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, theme, onToggleTheme }) => {
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/features', label: 'Features' },
    { path: '/about', label: 'About' },
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 ${theme === 'dark' ? 'bg-[#030712] text-white' : 'bg-white text-slate-900'}`}>
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-[100] backdrop-blur-md border-b border-slate-200/10 px-6 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Ledgerzo Logo" className="h-[40px] w-auto object-contain" referrerPolicy="no-referrer" />
          <span className="text-xl font-black tracking-tight uppercase text-slate-900 dark:text-white">Ledgerzo</span>
        </Link>
        
        <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {navLinks.map((link) => (
            <Link 
              key={link.path} 
              to={link.path} 
              className={`transition-colors ${location.pathname === link.path ? 'text-indigo-600' : 'hover:text-indigo-500'}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={onToggleTheme}
            className={`p-3 rounded-xl border transition-all shadow-sm flex items-center justify-center w-10 h-10 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-yellow-500 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={onGetStarted}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
          >
            Manager Login
          </button>
        </div>
      </nav>

      {/* Page Content */}
      <main className="relative z-10">
        <Routes>
          <Route path="/" element={<Home onGetStarted={onGetStarted} />} />
          <Route path="/features" element={<Features onGetStarted={onGetStarted} />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="pt-32 pb-10 px-6 border-t border-slate-200/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-24">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-8">
                <img src="/logo.png" alt="Ledgerzo Logo" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
                <span className="text-2xl font-black tracking-tight uppercase text-slate-900 dark:text-white">Ledgerzo</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm font-medium text-lg">
                The world's most advanced ISP management infrastructure. 
                Built for speed, reliability, and absolute privacy.
              </p>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-8">Platform</h4>
              <ul className="space-y-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                <li><Link to="/features" className="hover:text-indigo-500 transition-colors">Infrastructure</Link></li>
                <li><a href="#" className="hover:text-indigo-500 transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-indigo-500 transition-colors">Status</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-8">Company</h4>
              <ul className="space-y-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                <li><Link to="/about" className="hover:text-indigo-500 transition-colors">About Us</Link></li>
                <li><a href="#" className="hover:text-indigo-500 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-indigo-500 transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-12 border-t border-slate-200/10 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 Ledgerzo Infrastructure. All rights reserved.</p>
            <div className="flex gap-8">
              {['Twitter', 'GitHub', 'LinkedIn'].map(social => (
                <a key={social} href="#" className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-500 transition-colors">{social}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
