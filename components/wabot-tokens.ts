// NetBot Silk design tokens — TypeScript mirror of the `--nb-*` CSS variables
// defined in index.css (the CSS is authoritative; this map is for reference
// and for any JS-driven styling that needs raw values).
//
// Structural decisions (recorded, Silk master report 2026-10-03):
//   D1: Silk = the `modern-silk` palette REVISION (no new variant).
//   D2: Copilot accent is #00A884 everywhere — one-accent rule. The
//       indigo/violet gradient is deleted in Silk P4.
//   D3: Web support contact is Business-Profile-driven; current values are
//       settings defaults (no hardcoded literals in UI).
//   D4: Web ⋮ menu gets an account row (username/plan) at the top.
//   D5: Haptics fire on send, toggle, sheet open/close, error, saved.

export const NB_TOKENS = {
  accent: '#00A884',
  accentPressed: '#008069',
  accentSoft: 'rgba(0, 168, 132, 0.14)',
  light: {
    bg: '#EFEAE2',
    bgSubtle: '#F7F5F2',
    surface1: '#FFFFFF',
    surface2: '#F7F5F2',
    surface3: '#FFFFFF',
    header: '#F0F2F5',
    bubbleIn: '#FFFFFF',
    bubbleOut: '#D9FDD3',
    text1: '#111B21',
    text2: '#54656F',
    text3: '#8696A0',
    divider: 'rgba(0, 0, 0, 0.08)',
    border: 'rgba(0, 0, 0, 0.12)',
    scrim: 'rgba(0, 0, 0, 0.55)',
    success: '#159A4A',
    info: '#006699',
    warning: '#C9820A',
    danger: '#D9364F',
    tickRead: '#53BDEB',
  },
  dark: {
    bg: '#0B141A',
    bgSubtle: '#0E151C',
    surface1: '#111B21',
    surface2: '#1F2C34',
    surface3: '#2A3942',
    header: '#202C33',
    bubbleIn: '#202C33',
    bubbleOut: '#005C4B',
    text1: '#E9EDEF',
    text2: '#AEBAC1',
    text3: '#8696A0',
    divider: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.12)',
    scrim: 'rgba(0, 0, 0, 0.55)',
    success: '#2EB872',
    info: '#53BDEB',
    warning: '#F5A623',
    danger: '#F15C6D',
    tickRead: '#53BDEB',
  },
} as const;

/** Returns the CSS variable reference for a Silk token, e.g. nbVar('surface-1') → 'var(--nb-surface-1)'. */
export function nbVar(token: string): string {
  return `var(--nb-${token})`;
}
