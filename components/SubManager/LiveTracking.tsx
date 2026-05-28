import React, { useState, useEffect, useRef } from 'react';
import { SubManagerAccount } from '../../types';

interface LiveTrackingProps {
  subManagers: SubManagerAccount[];
}

declare global {
  interface Window {
    L: any;
  }
}

const LiveTracking: React.FC<LiveTrackingProps> = ({ subManagers }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SubManagerAccount | null>(null);

  const activeAgents = subManagers.filter(sm =>
    sm.dutyStatus === 'online' && sm.lastLocation?.lat && sm.lastLocation?.lng
  );

  // Load Leaflet CSS + JS dynamically
  useEffect(() => {
    if (window.L) { setMapReady(true); return; }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return;

    const L = window.L;
    const defaultCenter: [number, number] = activeAgents.length > 0
      ? [activeAgents[0].lastLocation!.lat, activeAgents[0].lastLocation!.lng]
      : [30.3753, 69.3451]; // Pakistan center

    const map = L.map(mapRef.current).setView(defaultCenter, 13);

    // OpenStreetMap tiles — FREE, no API key needed
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
  }, [mapReady]);

  // Update markers when agents change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    activeAgents.forEach(agent => {
      const lat = agent.lastLocation!.lat;
      const lng = agent.lastLocation!.lng;

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            background: #4f46e5;
            color: white;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            width: 36px; height: 36px;
            display: flex; align-items: center; justify-content: center;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-weight: 900; font-size: 14px;
          ">
            <span style="transform: rotate(45deg)">${agent.name.charAt(0).toUpperCase()}</span>
          </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:160px">
            <p style="font-weight:900;font-size:13px;margin:0 0 4px">${agent.name}</p>
            <p style="color:#6366f1;font-size:11px;margin:0 0 2px">@${agent.username}</p>
            <p style="color:#10b981;font-size:10px;font-weight:700;margin:0">● Active Duty</p>
            ${agent.lastLocation?.timestamp ? `<p style="color:#94a3b8;font-size:10px;margin:4px 0 0">Last: ${new Date(agent.lastLocation.timestamp).toLocaleTimeString()}</p>` : ''}
          </div>
        `);

      markersRef.current.push(marker);
    });

    // Fit map to all markers
    if (activeAgents.length > 1) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.2));
    } else if (activeAgents.length === 1) {
      map.setView([activeAgents[0].lastLocation!.lat, activeAgents[0].lastLocation!.lng], 15);
    }
  }, [mapReady, activeAgents]);

  return (
    <div className="bg-white dark:bg-[#12162a] rounded-[2.5rem] p-6 border border-slate-200 dark:border-[#1e2436] shadow-sm animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Live Field Tracking</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            OpenStreetMap · {activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-emerald-500">Live</span>
        </div>
      </div>

      {/* Agent chips */}
      {activeAgents.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeAgents.map(agent => (
            <button key={agent.id}
              onClick={() => {
                setSelectedAgent(agent);
                if (mapInstanceRef.current && agent.lastLocation) {
                  mapInstanceRef.current.setView([agent.lastLocation.lat, agent.lastLocation.lng], 16);
                  const marker = markersRef.current[activeAgents.indexOf(agent)];
                  if (marker) marker.openPopup();
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5"
        style={{ height: '420px' }}>
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-white/5 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Map...</p>
            </div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full z-0" />
      </div>

      {/* No agents message */}
      {activeAgents.length === 0 && (
        <div className="mt-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest opacity-50">
            No agents currently on duty
          </p>
          <p className="text-xs text-slate-400 mt-1">Agents appear here when they check in</p>
        </div>
      )}
    </div>
  );
};

export default LiveTracking;
