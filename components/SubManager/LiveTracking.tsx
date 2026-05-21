import React, { useState, useEffect, useRef } from 'react';
import { SubManagerAccount } from '../../types';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Define the component outside to prevent unmounting issues
const MapContent = ({ activeAgents }: { activeAgents: any[] }) => {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  
  return (
    <>
      <Map
        defaultCenter={{lat: 24.8607, lng: 67.0011}} // Karachi fallback
        defaultZoom={12}
        mapId="AGENT_TRACKER_MAP"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{width: '100%', height: '100%'}}
      >
        {activeAgents.map(agent => (
          <AdvancedMarker 
            key={agent.id} 
            position={agent.location} 
            onClick={() => setSelectedAgent(agent)}
          >
            <Pin background="#10b981" glyphColor="#fff" borderColor="#047857" />
          </AdvancedMarker>
        ))}
      </Map>
      {selectedAgent && (
        <InfoWindow 
          position={selectedAgent.location} 
          onCloseClick={() => setSelectedAgent(null)}
          className="rounded-2xl"
        >
          <div className="p-2 min-w-[200px]">
            <h4 className="font-bold text-gray-900 text-sm mb-1">{selectedAgent.name}</h4>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Active Duty</span>
            </div>
            <p className="text-xs text-gray-500 mb-1">
              Last Updated: {new Date(selectedAgent.location.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const LiveTracking: React.FC<{ subManagers: SubManagerAccount[] }> = ({ subManagers }) => {
  // Respecting Google Maps skill constitution for AI Studio
  const API_KEY = 
    process.env.GOOGLE_MAPS_PLATFORM_KEY || 
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    ''; 
  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';
  
  const activeAgents = subManagers
    .filter(sm => sm.dutyStatus === 'online' && (sm as any).lastLocation)
    .map(sm => ({
      id: sm.id,
      name: sm.name,
      location: (sm as any).lastLocation,
    }));

  return (
    <div className="bg-white dark:bg-[#12162a] rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-200 dark:border-[#1e2436] animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Live Agent Tracking</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Real-time GPS locations of checked-in field staff</p>
        </div>
      </div>
      
      <div className="w-full h-[500px] bg-slate-100 dark:bg-white/5 rounded-2xl overflow-hidden relative border border-slate-200 dark:border-white/5">
        {!hasValidKey ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-sm p-6 bg-white dark:bg-[#1a1f33] rounded-2xl shadow-xl">
              <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Maps Unavailable</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Set GOOGLE_MAPS_PLATFORM_KEY in AI Studio Settings to enable live tracking.</p>
              
              <div className="py-4 border-t border-slate-100 dark:border-white/10 mt-4">
                <p className="text-xs font-medium text-slate-500 mb-2">Fallback Tracking Data:</p>
                {activeAgents.length > 0 ? (
                  activeAgents.map(a => (
                    <div key={a.id} className="text-sm font-bold text-slate-700 dark:text-slate-300 flex justify-between">
                      <span>{a.name}</span>
                      <span className="text-emerald-500">Active</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-bold text-slate-400 uppercase">No active agents</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <APIProvider apiKey={API_KEY} version="weekly">
            <MapContent activeAgents={activeAgents} />
          </APIProvider>
        )}
      </div>
    </div>
  );
};

export default LiveTracking;
