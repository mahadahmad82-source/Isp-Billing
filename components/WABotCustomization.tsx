import React from 'react';

export type ThemePref = 'dark' | 'light' | 'system';

interface WABotCustomizationProps {
  themePref: ThemePref;
  onThemePrefChange: (pref: ThemePref) => void;
  wallpaper: string;
  onWallpaperChange: (key: string) => void;
  wabotDark: boolean;
}

export interface WallpaperPreset {
  key: string;
  label: string;
  light: string;
  dark: string;
}

// Chat-background presets, mirroring Android's WALLPAPER_PRESETS concept.
// WABotInbox imports WALLPAPER_PRESETS to resolve the active swatch.
export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { key: 'default', label: 'Default', light: '#EFEAE2', dark: '#0B141A' },
  { key: 'sage', label: 'Sage', light: '#E7ECE5', dark: '#101D1B' },
  { key: 'sand', label: 'Sand', light: '#F2EAD9', dark: '#1A1610' },
  { key: 'mist', label: 'Mist', light: '#E8ECF1', dark: '#121A24' },
  { key: 'rose', label: 'Rose', light: '#F3E4E4', dark: '#1D1214' },
  { key: 'forest', label: 'Forest', light: '#DFE9DC', dark: '#0E1A12' },
];

export const DEFAULT_WALLPAPER = 'default';

const MODES: { key: ThemePref; label: string; hint: string }[] = [
  { key: 'dark', label: 'Dark', hint: 'Always dark' },
  { key: 'light', label: 'Light', hint: 'Always light' },
  { key: 'system', label: 'System', hint: 'Follow device' },
];

const modeIcon = (key: ThemePref) => {
  if (key === 'dark')
    return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>;
  if (key === 'light')
    return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg>;
  return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
};

// Appearance customization, mirroring Android's Customization screen:
// theme mode (dark / light / system) + chat wallpaper presets.
const WABotCustomization: React.FC<WABotCustomizationProps> = ({
  themePref,
  onThemePrefChange,
  wallpaper,
  onWallpaperChange,
  wabotDark,
}) => {
  return (
    <div className="flex-1 min-h-0 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-4 sm:p-6 space-y-8 custom-scrollbar">
      <section>
        <h4 className="text-sm font-black text-[var(--nb-text-1)]">Appearance</h4>
        <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-1 mb-3">
          Choose dark, light, or follow your device's system setting.
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {MODES.map(m => {
            const active = themePref === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onThemePrefChange(m.key)}
                className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border transition-all active:scale-[0.97] ${
                  active
                    ? 'bg-[var(--nb-accent)] border-[var(--nb-accent)] text-white'
                    : 'bg-[var(--nb-surface-2)] border-[var(--nb-border)] text-[var(--nb-text-2)] hover:border-[var(--nb-accent)]'
                }`}
              >
                {modeIcon(m.key)}
                <span className="text-xs font-black">{m.label}</span>
                <span className={`text-[10px] font-semibold ${active ? 'text-white/80' : 'opacity-70'}`}>{m.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h4 className="text-sm font-black text-[var(--nb-text-1)]">Chat wallpaper</h4>
        <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-1 mb-3">
          Pick a background color for your chat screens.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {WALLPAPER_PRESETS.map(w => {
            const active = wallpaper === w.key;
            const swatch = wabotDark ? w.dark : w.light;
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => onWallpaperChange(w.key)}
                className="flex flex-col items-center gap-1.5 active:scale-[0.97] transition-all"
              >
                <span
                  className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center ${
                    active ? 'border-[var(--nb-accent)]' : 'border-[var(--nb-border)]'
                  }`}
                  style={{ backgroundColor: swatch }}
                >
                  {active && (
                    <svg className="w-5 h-5 text-[var(--nb-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                  )}
                </span>
                <span className="text-[11px] font-bold text-[var(--nb-text-2)]">{w.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)]">
        <svg className="w-5 h-5 flex-shrink-0 text-[var(--nb-text-2)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-[11px] font-semibold text-[var(--nb-text-2)]">
          Appearance choices are saved in this browser and apply across NetBot Web.
        </p>
      </div>
    </div>
  );
};

export default WABotCustomization;
