import React from 'react';

// ─────────────────────────────────────────────
// Water sidebar navigation — single source of truth (2026-10-08).
//
// Grouping follows the approved 2026-10-07 dashboard mockup:
// DAILY / MANAGE / SETUP. This file owns the tab definitions
// (id + label + icon) and the section grouping; Layout.tsx only
// renders them, so ISP navigation stays completely untouched.
//
// Bug history: PR #64 listed water-* ids in the sidebar sections
// but never added them to Layout's tabs array, so the byId filter
// silently dropped Customers / Billing / Reports / Analytics /
// Routes / Vehicles. Keeping defs + sections in one place makes
// that class of bug impossible — every section id must exist here.
// ─────────────────────────────────────────────

export interface WaterNavTabDef {
  id: string;
  label: string;
  icon: React.JSX.Element;
}

export interface WaterSidebarSection {
  title: 'Daily' | 'Manage' | 'Setup';
  items: { id: string; label: string }[];
}

const icon = (inner: React.ReactNode): React.JSX.Element => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{inner}</svg>
);

const p = (d: string): React.JSX.Element => (
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d} />
);

// Every water tab id that can appear in the sidebar. Layout pushes
// these into its tabs array for water-business accounts (managers
// only — App.tsx renders the water tabs for managers, water-hub for
// every role).
export const WATER_NAV_TAB_DEFS: WaterNavTabDef[] = [
  {
    id: 'water-hub',
    label: 'Deliveries',
    icon: icon(p('M12 2.7s6.5 7 6.5 11.3a6.5 6.5 0 1 1-13 0C5.5 9.7 12 2.7 12 2.7z')),
  },
  {
    id: 'water-customers',
    label: 'Customers',
    icon: icon(p('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z')),
  },
  {
    id: 'water-billing',
    label: 'Billing',
    icon: icon(p('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z')),
  },
  {
    id: 'water-reports',
    label: 'Reports',
    icon: icon(p('M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z')),
  },
  {
    id: 'water-analytics',
    label: 'Analytics',
    icon: icon(p('M3 17l6-6 4 4 8-8M15 7h6v6')),
  },
  {
    id: 'water-routes',
    label: 'Routes',
    icon: icon(p('M9 20l-5.5-2.5v-13L9 7l6-2.5L20.5 7v13L15 17.5 9 20zM9 7v13M15 4.5v13')),
  },
  {
    id: 'water-vehicles',
    label: 'Vehicles',
    icon: icon(p('M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14a2 2 0 0 1 2 2v4h-2.5m-13.5 0H3v-4a2 2 0 0 1 2-2zm2.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z')),
  },
];

// Sidebar grouping — approved dashboard mockup (2026-10-07).
// dashboard / expenses / team / settings reuse the shared tab icons
// from Layout's tabs array; water-* ids use WATER_NAV_TAB_DEFS above.
export const WATER_SIDEBAR_SECTIONS: WaterSidebarSection[] = [
  {
    title: 'Daily',
    items: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'water-hub', label: 'Deliveries' },
      { id: 'water-customers', label: 'Customers' },
      { id: 'water-billing', label: 'Billing' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'expenses', label: 'Expenses' },
      { id: 'water-reports', label: 'Reports' },
      { id: 'water-analytics', label: 'Analytics' },
    ],
  },
  {
    title: 'Setup',
    items: [
      { id: 'water-routes', label: 'Routes' },
      { id: 'water-vehicles', label: 'Vehicles' },
      { id: 'team', label: 'Riders' },
      { id: 'settings', label: 'Settings' },
    ],
  },
];

// Icon for a section item: water tabs use this config; shared tabs
// (dashboard/expenses/team/settings) keep their existing Layout icons
// via the fallback.
export function waterNavIcon(id: string, fallback?: React.ReactNode): React.ReactNode {
  return WATER_NAV_TAB_DEFS.find((d) => d.id === id)?.icon ?? fallback;
}
