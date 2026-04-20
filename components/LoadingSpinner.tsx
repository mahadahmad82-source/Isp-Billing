
import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  theme?: 'light' | 'dark';
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = "Initializing Secure Environment...", 
  theme = 'light',
  fullScreen = true 
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${fullScreen ? 'fixed inset-0 z-[500] bg-slate-50 dark:bg-[#030712]' : ''}`}>
      <div className="relative">
        {/* Outer Ring */}
        <div className="w-24 h-24 rounded-full border-4 border-indigo-500/10 border-t-indigo-500 animate-spin"></div>
        
        {/* Inner Ring (Reverse) */}
        <div className="absolute top-2 left-2 w-20 h-20 rounded-full border-4 border-violet-500/10 border-b-violet-500 animate-[spin_1.5s_linear_infinite_reverse]"></div>
        
        {/* Core Dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_15px_#6366f1]"></div>
      </div>
      
      <div className="mt-10 space-y-3">
        <h3 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' || fullScreen ? 'text-slate-800 dark:text-white' : 'text-slate-800'}`}>
          {message}
        </h3>
        <p className="text-[10px] text-indigo-500 font-black uppercase tracking-[0.4em] animate-pulse">
          Verified Ledger Sync Active
        </p>
      </div>

      {/* Decorative Blobs for FullScreen */}
      {fullScreen && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/5 rounded-full blur-[120px]"></div>
        </>
      )}
    </div>
  );
};

export default LoadingSpinner;
