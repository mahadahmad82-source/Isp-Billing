import React from 'react';

// Shared inline-SVG icons for the Copilot surfaces (floating widget +
// full-screen Copilot tab). No emoji, no icon fonts — per project rules.

export const CopilotIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2c.3 2.7 1 4.6 2.1 5.9C15.4 9 17.3 9.7 20 10c-2.7.3-4.6 1-5.9 2.1C12.7 13.4 12 15.3 12 18c-.3-2.7-1-4.6-2.1-5.9C8.6 11 6.7 10.3 4 10c2.7-.3 4.6-1 5.9-2.1C11 6.6 11.7 4.7 12 2z" />
    <path d="M19 14c.15 1.1.5 1.9 1.05 2.45.55.55 1.35.9 2.45 1.05-1.1.15-1.9.5-2.45 1.05-.55.55-.9 1.35-1.05 2.45-.15-1.1-.5-1.9-1.05-2.45C17.4 18 16.6 17.65 15.5 17.5c1.1-.15 1.9-.5 2.45-1.05.55-.55.9-1.35 1.05-2.45z" />
  </svg>
);

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'w-5 h-5' };

export const MicIcon = () => (<svg {...svgProps}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>);
export const SendIcon = () => (<svg {...svgProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
export const CloseIcon = () => (<svg {...svgProps}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
export const SpeakerIcon = ({ off }: { off?: boolean }) => (<svg {...svgProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />{off ? (<><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>) : (<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />)}</svg>);
export const LoopIcon = () => (<svg {...svgProps}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>);
