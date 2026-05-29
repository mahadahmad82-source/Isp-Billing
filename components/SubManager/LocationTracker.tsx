import React, { useState, useEffect, useRef } from 'react';

interface LocationTrackerProps {
  status: 'online' | 'offline';
  lastCheckIn?: string;
  onStatusChange: (newStatus: 'online' | 'offline', location?: { lat: number, lng: number }) => void;
  onLocationUpdate: (location: { lat: number, lng: number, accuracy: number, timestamp: number }) => void;
}

const LocationTracker: React.FC<LocationTrackerProps> = ({ status, lastCheckIn, onStatusChange, onLocationUpdate }) => {
  const watchId = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatTime = (iso?: string) => {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const todayDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    // Get initial position for check-in
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onStatusChange('online', loc);
        
        // Start watching for continuous updates
        watchId.current = navigator.geolocation.watchPosition(
          (watchPos) => {
            const newLoc = {
              lat: watchPos.coords.latitude,
              lng: watchPos.coords.longitude,
              accuracy: watchPos.coords.accuracy || 0,
              timestamp: watchPos.timestamp || Date.now()
            };
            onLocationUpdate(newLoc);
          },
          (err) => console.error("Watch error:", err),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
      },
      (err) => {
        setError("Permission denied or location unavailable");
        console.error(err);
      }
    );
  };

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    onStatusChange('offline');
  };

  const handleToggle = () => {
    if (status === 'offline') {
      startTracking();
    } else {
      stopTracking();
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            {status === 'online' && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse"></div>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Current Status</p>
            <h3 className={`text-lg font-bold ${status === 'online' ? 'text-emerald-500' : 'text-slate-500'}`}>
              {status === 'online' ? 'TRACKING LIVE' : 'Offline'}
            </h3>
          </div>
        </div>

        <button
          onClick={handleToggle}
          className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 ${
            status === 'online' 
              ? 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-rose-500/10 hover:text-rose-500' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/25'
          }`}
        >
          {status === 'online' ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
              Check Out
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Check In
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-500 text-xs font-medium">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Shift Start</p>
          <p className={`text-sm font-bold ${status === 'online' ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
            {formatTime(lastCheckIn)}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Today</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{todayDateStr}</p>
        </div>
      </div>
    </div>
  );
};

export default LocationTracker;
