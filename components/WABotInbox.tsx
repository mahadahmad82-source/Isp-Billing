import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserRecord, RouterCatalog, RouterCatalogItem, BotTemplate, WABotAgent, WABotBehaviorRule, OutageLog } from '../types';
import OutageTracker from './OutageTracker';
import WABotRecovery from './WABotRecovery';
import WABotCustomization, { WALLPAPER_PRESETS, DEFAULT_WALLPAPER, ThemePref } from './WABotCustomization';
import WABotContacts from './WABotContacts';
import WABotLinkedDevices from './WABotLinkedDevices';
import WABotCopilotBubble from './WABotCopilotBubble';
import CopilotTab from './CopilotTab';
import type { CopilotLogEntry } from '../types';
import { DEFAULT_BOT_TEMPLATES } from '../utils/botTemplateDefaults';
import { supabase } from '../lib/supabase';
import { getWabotAuthHeaders, uploadMediaToR2 } from '../utils/whatsapp';
import * as lamejs from '@breezystack/lamejs';

// WhatsApp's own text formatting (*bold*, _italic_, ~strikethrough~) is stored
// verbatim in message content (that's what actually gets sent to the customer's
// WhatsApp app, which renders it). The inbox view was showing that raw markdown
// as literal asterisks/underscores instead of rendering it, so this parses the
// same subset WhatsApp supports into React nodes for display here too.
function renderWhatsAppText(text: string): React.ReactNode[] {
  if (!text) return [text];
  const pattern = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~\n]+~$/.test(part)) return <span key={i} style={{ textDecoration: 'line-through' }}>{part.slice(1, -1)}</span>;
    return part;
  });
}

// Small usage bar for the Topup tab — used for both Text and Voice quotas.
// Anything at/above Number.MAX_SAFE_INTEGER (how unlimited/enterprise plans
// store their quota server-side, see api/admin-maintenance.ts QUOTA_MAP) is
// rendered as "Unlimited" instead of a 0%-full bar.
const QuotaBar: React.FC<{ label: string; used: number; limit: number }> = ({ label, used, limit }) => {
  const unlimited = limit >= 999999999;
  const pct = unlimited ? 0 : Math.min(100, limit > 0 ? Math.round((used / limit) * 100) : 100);
  const barColor = pct >= 100 ? 'var(--nb-danger)' : pct >= 80 ? 'var(--nb-warning)' : 'var(--nb-accent)';
  return (
    <div className="rounded-2xl border border-[var(--nb-border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)]">{label}</span>
        <span className="text-xs font-black text-[var(--nb-text-1)]">
          {unlimited ? 'Unlimited' : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-full bg-[var(--nb-surface-3)] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
};

interface WAMessage {
  id: string;
  manager_id: string;
  customer_phone: string;
  direction: 'in' | 'out';
  type: 'text' | 'image' | 'audio' | 'voice' | 'video' | 'document';
  content: string | null;
  media_url?: string | null;
  translated_content?: string | null;
  flagged_payment_proof: boolean;
  is_read: boolean;
  status: 'uploading' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender?: string | null;
}

interface Conversation {
  phone: string;
  name: string;
  username?: string;
  userId?: string;
  lastMessage: string;
  lastType: string;
  lastTime: string;
  unreadCount: number;
  paused: boolean;
}

interface KnowledgeItem {
  id: string;
  manager_id: string;
  topic: string | null;
  question: string;
  answer: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface WABotInboxProps {
  managerId: string;
  customers: UserRecord[];
  copilotHistory?: CopilotLogEntry[];
  onCopilotHistoryChange?: (log: CopilotLogEntry[]) => void;
  botName?: string;
  onUpdateBotName?: (name: string) => void;
  businessProfile?: Partial<BusinessIdentity>;
  onUpdateBusinessProfile?: (patch: Partial<BusinessIdentity>) => void;
  routerCatalog?: RouterCatalog;
  onUpdateRouterCatalog?: (catalog: RouterCatalog) => void;
  botTemplates?: Record<string, BotTemplate>;
  onUpdateBotTemplates?: (templates: Record<string, BotTemplate>) => void;
  ttsVoice?: string;
  onUpdateTtsVoice?: (voice: string) => void;
  wabotAgents?: WABotAgent[];
  onUpdateWabotAgents?: (agents: WABotAgent[]) => void;
  botPersonaNotes?: string;
  onUpdateBotPersonaNotes?: (notes: string) => void;
  botBehaviorRules?: WABotBehaviorRule[];
  onUpdateBotBehaviorRules?: (rules: WABotBehaviorRule[]) => void;
  outageLogs?: OutageLog[];
  onUpdateOutageLogs?: (logs: OutageLog[]) => void;
  totalUsers?: number;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  themePref?: ThemePref;
  onThemePrefChange?: (pref: ThemePref) => void;
  onLogout?: () => void;
}

// All 30 Gemini TTS prebuilt voices, with their official one-word style descriptor —
// shown in the picker so mahadnet can choose by vibe, not just by name.
const GEMINI_VOICES: { name: string; style: string }[] = [
  { name: 'Zephyr', style: 'Bright' }, { name: 'Puck', style: 'Upbeat' }, { name: 'Charon', style: 'Informative' },
  { name: 'Kore', style: 'Firm' }, { name: 'Fenrir', style: 'Excitable' }, { name: 'Leda', style: 'Youthful' },
  { name: 'Orus', style: 'Firm' }, { name: 'Aoede', style: 'Breezy' }, { name: 'Callirrhoe', style: 'Easy-going' },
  { name: 'Autonoe', style: 'Bright' }, { name: 'Enceladus', style: 'Breathy' }, { name: 'Iapetus', style: 'Clear' },
  { name: 'Umbriel', style: 'Easy-going' }, { name: 'Algieba', style: 'Smooth' }, { name: 'Despina', style: 'Smooth' },
  { name: 'Erinome', style: 'Clear' }, { name: 'Algenib', style: 'Gravelly' }, { name: 'Rasalgethi', style: 'Informative' },
  { name: 'Laomedeia', style: 'Upbeat' }, { name: 'Achernar', style: 'Soft' }, { name: 'Alnilam', style: 'Firm' },
  { name: 'Schedar', style: 'Even' }, { name: 'Gacrux', style: 'Mature' }, { name: 'Pulcherrima', style: 'Forward' },
  { name: 'Achird', style: 'Friendly' }, { name: 'Zubenelgenubi', style: 'Casual' }, { name: 'Vindemiatrix', style: 'Gentle' },
  { name: 'Sadachbia', style: 'Lively' }, { name: 'Sadaltager', style: 'Knowledgeable' }, { name: 'Sulafat', style: 'Warm' },
];

const POLL_MS = 60000; // fallback poll only — realtime channel + instant reconnect-refresh is the primary path (see subscribe() below)

// Seed defaults — mirrors the built-in catalog the WhatsApp bot falls back to until
// these are customized here. Editing/saving below overrides this for the live bot.
const IMG_BASE = 'https://raw.githubusercontent.com/mahadahmad82-source/Isp-Billing/main/public/whatsapp-images';
const DEFAULT_ROUTER_CATALOG: RouterCatalog = {
  '2.4g': [
    {
      id: 'default-gs3101',
      model: 'GS3101',
      company: 'China Mobile',
      band: '2.4GHz Single Band',
      price: 3000,
      image: `${IMG_BASE}/gs3101.jpg`,
      specs: `📡 *GS3101 — China Mobile*\n💰 Price: Rs. 3,000\n\n🔧 *Specs:*\n• Chipset: EcoNet EN7526F @ 900MHz\n• Memory: 256MB RAM + 256MB Flash\n• Ports: 1x Gigabit + 3x Fast Ethernet\n• Fiber: GPON/EPON auto-detect\n• WiFi: 2.4GHz (802.11 b/g/n)\n• Extra: 1x VoIP port + 1x USB 2.0\n\n📶 *Range:* 1-2 rooms (30-40 feet), crosses 1 wall easily\n✅ *Best for:* Budget-friendly, single room/small space use, stable connection`,
    },
    {
      id: 'default-hg8546m',
      model: 'HG8546M',
      company: 'Huawei EchoLife',
      band: '2.4GHz Single Band',
      price: 3500,
      image: `${IMG_BASE}/huawei-hg8546m.jpg`,
      specs: `📡 *Huawei EchoLife HG8546M*\n💰 Price: Rs. 3,500\n\n🔧 *Specs:*\n• PON: XPON (GPON/EPON adaptive)\n• Ports: 1x Gigabit + 3x Fast Ethernet\n• WiFi: 2.4GHz only (802.11 b/g/n, 2x2 MIMO)\n• Antennas: 2x External (5dBi)\n• Extra: 1x Telephone port + 1x USB 2.0\n\n📶 *Range:* 60-80 feet in open space, easily through 1 indoor wall, weak after 2+ walls\n✅ *Best for:* 1 floor of a 10-marla house (place it in the center)`,
    },
  ],
  '5g': [
    {
      id: 'default-q2',
      model: 'Q2 Dual Band',
      company: 'Huawei',
      band: '5GHz + 2.4GHz Dual Band',
      price: 6000,
      image: `${IMG_BASE}/huawei-q2.jpg`,
      specs: `📡 *Huawei Q2 — Dual Band 5G*\n💰 Price: Rs. 6,000 _(Refurbished)_\n📦 In the box: Router + Original Power Adapter\n\n🔧 *Specs:*\n• Dedicated Gigabit WAN — full speed, no drop\n• 5GHz Ultra-Speed WiFi — low ping, 4K streaming\n• Heavy bandwidth handling, 24/7 use\n• 64 devices can connect at the same time\n\n📶 *Range:* 50-80 feet even through thick walls — perfect for 2-3 rooms or a full medium flat\n✅ *Best for:* Gaming, multiple devices, large house/flat`,
    },
  ],
};

function hasCatalogContent(c?: RouterCatalog | null): boolean {
  if (!c) return false;
  return (c['2.4g']?.length || 0) + (c['5g']?.length || 0) > 0;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function typePreview(type: string): string {
  if (type === 'image') return 'Photo';
  if (type === 'audio' || type === 'voice') return 'Voice note';
  if (type === 'video') return 'Video';
  if (type === 'document') return 'Document';
  return '';
}

// Deterministic avatar color from phone digits, so each contact keeps the
// same color every time — mirrors the exact same trick used in the Android
// app's ChatRow.tsx (AVATAR_COLORS + avatarColor()) so a contact's avatar
// color matches across both platforms instead of every avatar being one
// flat brand color.
const AVATAR_COLORS = ['#7C4A3A', '#3A4A7C', '#4A7C4E', '#7C3A6B', '#7C6A3A', '#3A6B7C'];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function DeliveryTicks({ status }: { status: string }) {
  if (status === 'uploading') return null;
  if (status === 'read') {
    return (
      <svg className="w-4 h-3 inline-block text-sky-300" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5.5L8.5 9L15 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
  }
  if (status === 'delivered') {
    return (
      <svg className="w-4 h-3 inline-block text-white/70" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5.5L8.5 9L15 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
  }
  if (status === 'failed') {
    return <svg className="w-3.5 h-3.5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>;
  }
  // sent (single tick)
  return (
    <svg className="w-4 h-3 inline-block text-white/70" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}

// WhatsApp-style circular spinner shown over a media thumbnail while it's
// still uploading/sending — matches the platform's familiar loading affordance.
function UploadSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
      <svg className="w-7 h-7 animate-spin text-white" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ── Canned quick replies for the /slash command palette ──
interface CannedReply {
  cmd: string;
  title: string;
  desc: string;
  text: string;
}

// Business identity for customer-facing quick replies — driven by the manager's
// Business Profile settings (no hardcoded business data). Values are inserted
// into the editable composer, so the operator always reviews before sending.
interface BusinessIdentity {
  businessName: string;
  supportNumber: string;
  bankName: string;
  bankAccountNo: string;
  bankIban: string;
  jazzcashNo: string;
  easypaisaNo: string;
  // ── Silk D3: NetBot support contact — Business-Profile-driven. Optional so
  //    older settings blobs stay valid; Help falls back to the current defaults.
  supportEmail?: string;
  supportPhone?: string;
  supportWhatsApp?: string;
}

function buildCannedReplies(id: BusinessIdentity): CannedReply[] {
  return [
  {
    cmd: '/bank',
    title: 'Bank Account Details',
    desc: 'Bank account number, title and IBAN',
    text: `🏦 *Bank Account Details:*\nBank: ${id.bankName}\nAccount Title: ${id.businessName}\nAccount No: ${id.bankAccountNo}\nIBAN: ${id.bankIban}\n\n_Please share the payment screenshot here so we can update your account right away._`,
  },
  {
    cmd: '/jazzcash',
    title: 'JazzCash Account Details',
    desc: 'JazzCash mobile account details',
    text: `📱 *JazzCash Payment Details:*\nAccount Title: ${id.businessName}\nJazzCash No: ${id.jazzcashNo}\n\n_Please always send the TID or screenshot after payment._`,
  },
  {
    cmd: '/easypaisa',
    title: 'EasyPaisa Account Details',
    desc: 'EasyPaisa mobile account details',
    text: `💳 *EasyPaisa Payment Details:*\nAccount Title: ${id.businessName}\nEasyPaisa No: ${id.easypaisaNo}\n\n_Send the screenshot and your connection will be activated right away._`,
  },
  {
    cmd: '/reboot',
    title: 'Router Restart Guide',
    desc: 'How to power-cycle the router',
    text: '🔌 *Router Restart Guidance:*\n1. Unplug the router\'s power adapter from the switch.\n2. Wait 2 minutes so the session resets.\n3. Plug it back in and wait 3 minutes until the Internet light is stable.\n\nIf the issue still persists, let us know and we will schedule a team visit.',
  },
  {
    cmd: '/los',
    title: 'Red LOS Light / Fiber Cut',
    desc: 'Red blinking light guide for routers',
    text: '🔴 *Red LOS Light on Router:*\nThis means the fiber optic wire has a signal drop or cut. Please do not pull the wire forcefully. Our field team has been alerted and is checking as soon as possible.',
  },
  {
    cmd: '/dns',
    title: 'Speed / DNS Troubleshooting',
    desc: 'Google DNS 8.8.8.8 setting guide',
    text: '🌐 *Internet Speed / Browsing Check:*\nPlease go to your device\'s Wi-Fi settings and set the DNS to *8.8.8.8* and secondary to *8.8.4.4*, then test directly.',
  },
  {
    cmd: '/grace',
    title: '24-Hour Grace Period',
    desc: '24-hour window for bill payment',
    text: '⏳ *Grace Period Extended:*\nYour connection has been temporarily restored for 24 hours. Please clear your bill before tomorrow evening so your service is not suspended. Thank you!',
  },
  ];
}

interface MetaTemplateField {
  key: string;
  label: string;
  placeholder: string;
  inputType?: 'text' | 'number';
}

interface MetaTemplateDef {
  name: string;
  title: string;
  description: string;
  fields: MetaTemplateField[];
  bodyTemplate: string;
}

const META_OFFICIAL_TEMPLATES: MetaTemplateDef[] = [
  {
    name: 'customer_support_activation',
    title: 'Customer Support Activation',
    description: 'Welcomes a customer to the official WhatsApp support channel.',
    fields: [
      { key: 'name', label: 'Customer name', placeholder: 'e.g. Ali Khan' },
      { key: 'supportNumber', label: 'Support number', placeholder: 'e.g. 0300-1234567' },
      { key: 'businessName', label: 'Business name', placeholder: 'e.g. your business name' },
    ],
    bodyTemplate:
      'This is an official announcement regarding our customer support and network services. We have successfully integrated our network complaint registration, technical support, and billing updates for {{1}} on this official WhatsApp channel.\n\nYou can now use this active chat to report internet issues, check billing status, or get instant assistance. For urgent help call {{2}}. Thank you for your cooperation. Regards, Team {{3}} network support.',
  },
  {
    name: 'recharge_pending_payment',
    title: 'Recharge — Pending Payment',
    description: 'Confirms a credit recharge and reminds about outstanding dues.',
    fields: [
      { key: 'name', label: 'Customer name', placeholder: 'e.g. Ali Khan' },
      { key: 'rechargeAmount', label: 'Recharge amount (PKR)', placeholder: 'e.g. 1500', inputType: 'number' },
      { key: 'duesAmount', label: 'Outstanding dues (PKR)', placeholder: 'e.g. 1500', inputType: 'number' },
      { key: 'package', label: 'Package', placeholder: 'e.g. Alpha (15MB)' },
      { key: 'businessName', label: 'Business name', placeholder: 'e.g. your business name' },
    ],
    bodyTemplate:
      'Important account update: Your internet package has been successfully recharged as requested.\n\nAssalam-o-Alaikum {{1}}, your {{4}} connection has been renewed on credit for PKR {{2}}.\n\nPlease clear your outstanding dues of PKR {{3}} as soon as possible to ensure uninterrupted high-speed internet service.\n\nTap the button below to view our official payment details. Thank you, Team {{5}} support.',
  },
  {
    name: 'package_expiry_official',
    title: 'Package Expiry Notice',
    description: 'Official notice that the internet package is about to expire.',
    fields: [
      { key: 'name', label: 'Customer name', placeholder: 'e.g. Ali Khan' },
      { key: 'expiryDate', label: 'Expiry date', placeholder: 'e.g. 15-Aug-2026' },
      { key: 'package', label: 'Package', placeholder: 'e.g. Alpha (15MB)' },
      { key: 'businessName', label: 'Business name', placeholder: 'e.g. your business name' },
    ],
    bodyTemplate:
      '[Alert] Internet service billing update and expiry notification. Assalam-o-Alaikum {{1}}, your internet package {{3}} is expiring on {{2}}.\n\nPlease pay your bill on time so your internet service continues without interruption. Thank you, Team {{4}}.',
  },
  {
    name: 'payment_success_official',
    title: 'Payment Success',
    description: 'Official payment confirmation with updated account details.',
    fields: [
      { key: 'name', label: 'Customer name', placeholder: 'e.g. Ali Khan' },
      { key: 'paymentAmount', label: 'Payment amount (PKR)', placeholder: 'e.g. 1500', inputType: 'number' },
      { key: 'package', label: 'Package', placeholder: 'e.g. 10 Mbps' },
      { key: 'remainingBalance', label: 'Remaining balance (PKR)', placeholder: 'e.g. 0', inputType: 'number' },
      { key: 'advancePaid', label: 'Advance paid (PKR)', placeholder: 'e.g. 0', inputType: 'number' },
      { key: 'newExpiryDate', label: 'New expiry date', placeholder: 'e.g. 15-Aug-2026' },
      { key: 'businessName', label: 'Business name', placeholder: 'e.g. your business name' },
    ],
    bodyTemplate:
      '[Official] Assalam-o-Alaikum, your payment has been received and updated in the system. Dear {{1}}, your total payment of PKR {{2}} has been recorded successfully.\n\nDetails:\n- Package: {{3}}\n- Remaining Balance: PKR {{4}}\n- Advance Paid: PKR {{5}}\n- New Expiry Date: {{6}}\n\nGreat service is our responsibility. Regards, Team {{7}}.'
  },
];

function renderOfficialTemplateBody(bodyTemplate: string, params: string[]): string {
  return params.reduce((text, val, i) => text.split(`{{${i + 1}}}`).join(val ?? ''), bodyTemplate);
}

function formatExpiryDate(d: string | undefined | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', { month: 'short' });
  return `${day}-${month}-${dt.getFullYear()}`;
}

function formatHoursLeft(hours: number): string {
  if (hours >= 1) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  return `${Math.round(hours * 60)}m`;
}

function buildOfficialTemplatePrefill(c?: UserRecord | null, nameFallback?: string, id?: BusinessIdentity): Record<string, string> {
  const netFee = c ? Math.max(0, (c.monthlyFee || 0) - (c.persistentDiscount || 0)) : 0;
  const balance = c?.balance || 0;
  return {
    name: c?.name || nameFallback || '',
    supportNumber: id?.supportNumber || '',
    rechargeAmount: c ? String(c.creditAmount || netFee || '') : '',
    duesAmount: c ? String(balance) : '',
    expiryDate: formatExpiryDate(c?.expiryDate),
    paymentAmount: c ? String(c.creditAmount || netFee || '') : '',
    package: c?.plan || '',
    remainingBalance: c ? String(balance > 0 ? balance : 0) : '',
    advancePaid: c ? String(balance < 0 ? Math.abs(balance) : 0) : '',
    newExpiryDate: formatExpiryDate(c?.expiryDate),
    businessName: id?.businessName || '',
  };
}

// ── System Updates & Changelog for NetBot Settings ──
interface ChangelogFeature {
  tag: string;
  title: string;
  desc: string;
}

interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  badge: string;
  badgeColor: string;
  features: ChangelogFeature[];
}

const CHANGELOG_ITEMS: ChangelogRelease[] = [
  {
    version: 'v2.6',
    date: '2 October 2026',
    title: 'Web-Android Parity: Shared Chat Features',
    badge: 'Latest',
    badgeColor: 'bg-[var(--nb-accent)]',
    features: [
      {
        tag: 'Parity',
        title: 'Date Separators in Chat Threads',
        desc: 'Messages are now grouped under Today / Yesterday / date pills, matching the Android app.',
      },
      {
        tag: 'Parity',
        title: 'Offline Banner',
        desc: 'A banner appears at the top of the inbox when your connection drops, so you always know the chat list may be stale.',
      },
      {
        tag: 'Parity',
        title: 'Forward Messages',
        desc: 'Right-click any message and choose Forward to send it to another chat - text goes as text, photos/videos/documents are re-sent from their existing link.',
      },
      {
        tag: 'Parity',
        title: 'NetBot Typing Indicator',
        desc: 'When a customer writes on a chat where the bot is active, you now see an animated "NetBot is typing..." bubble before its reply lands.',
      },
    ],
  },
  {
    version: 'v2.5',
    date: '2 October 2026',
    title: 'Web-Android Parity: New Views & Settings Alignment',
    badge: 'Parity',
    badgeColor: 'bg-[var(--nb-accent)]',
    features: [
      {
        tag: 'Parity',
        title: 'Pending Recoveries, Customization, Contacts & Linked Devices',
        desc: 'Four new views matching the Android app: a pending-payment recovery ledger with tap-to-call and WhatsApp reminders, Dark/Light/System theme plus chat wallpaper picker, a searchable customer directory, and linked web-session management.',
      },
      {
        tag: 'Parity',
        title: 'Chat Thread Upgrades (Load Older, Retry, Reply, Long-press)',
        desc: 'Load older messages in batches without losing scroll position, retry failed messages, reply with quoted previews, and long-press (right-click) any message for Reply / Copy / Delete.',
      },
      {
        tag: 'Cleanup',
        title: 'Standalone Receipt Buttons Removed',
        desc: 'The standalone NetBot receipt buttons were dead stubs and have been removed. Receipts remain available in the BillCollector manager dashboard.',
      },
      {
        tag: 'Settings',
        title: 'Settings Aligned with Android',
        desc: 'Persona notes and behavior rules now live only under Teach NetBot (no more duplication). Settings adds Linked Devices management and shows the logged-in manager account, like the Android app.',
      },
    ],
  },
  {
    version: 'v2.4',
    date: '17 September 2026',
    title: 'WhatsApp Web Redesign & Workflow Speedup',
    badge: 'Redesign',
    badgeColor: 'bg-[var(--nb-accent)]',
    features: [
      {
        tag: 'UI/UX',
        title: 'Desktop Viewport Lock & Pinned Composer',
        desc: 'Opening a chat no longer scrolls the browser page; the left chat directory and the right conversation thread scroll independently, and the message input bar stays pinned to the bottom of the screen.',
      },
      {
        tag: 'Theme',
        title: 'Official WhatsApp Web Color Palette & Unified Sync',
        desc: 'Applied the original WhatsApp Web hex colors (#efeae2 canvas, #d9fdd3 outgoing, #00a884 accent) and synced dark/light mode with the Manager Dashboard.',
      },
      {
        tag: 'Speed',
        title: 'Smart Filter Tabs (All / Unread / Payment Slips / Paused)',
        desc: 'One-click filters for unread messages or payment slips, without scrolling.',
      },
      {
        tag: 'Shortcuts',
        title: 'Canned Quick Replies (/slash commands)',
        desc: 'Typing / in the input box opens a palette with /bank, /jazzcash, /reboot, /los, /dns, /grace — no need to type bank details over and over.',
      },
      {
        tag: 'Verification',
        title: 'In-App Media Lightbox & Screenshot Zoom Viewer',
        desc: 'Zoom and rotate the customer payment screenshot inside the chat (no new tab) and generate a receipt in one click.',
      },
    ],
  },
  {
    version: 'v2.3',
    date: '16 September 2026',
    title: 'Outage Management & Realtime Reliability',
    badge: 'Performance',
    badgeColor: 'bg-[var(--nb-accent)]',
    features: [
      {
        tag: 'Automation',
        title: 'Unregistered Number Outage Scoping',
        desc: 'Even if a customer number is not registered in the system, NetBot immediately sends an automatic outage alert on an area/backend outage.',
      },
      {
        tag: 'Database',
        title: 'Aggregated Conversation Summaries RPC',
        desc: 'Removed the chat-list row cap; chats load via a database-level aggregate RPC so no contact is missed under high traffic.',
      },
      {
        tag: 'Egress',
        title: 'Network Egress Optimization',
        desc: 'Implemented fast sync, cutting the unnecessary heavy payload from the background 60s poll.',
      },
    ],
  },
  {
    version: 'v2.2',
    date: '14 September 2026',
    title: 'NetBot AI Persona & Training Studio',
    badge: 'AI Engine',
    badgeColor: 'bg-[var(--nb-accent)]',
    features: [
      {
        tag: 'AI',
        title: 'Teach NetBot & Situation Handling Rules',
        desc: 'A visual manager panel for teaching the bot custom rules and preferred handling for specific customer situations.',
      },
      {
        tag: 'Voice',
        title: 'Gemini TTS Voice Studio',
        desc: '30 prebuilt Gemini AI natural voices aur custom style descriptors ke sath live voice preview.',
      },
      {
        tag: 'Inventory',
        title: 'Interactive Router Catalog',
        desc: 'A managed catalog with images, specifications and live pricing for single-band and dual-band routers.',
      },
    ],
  },
];

// WhatsApp-style date label for thread separators (Phase 4 parity with Android).
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// Inline text-field editor for one Business Profile value — mirrors the
// bot-name edit pattern in Settings (view value + edit affordance, Save on confirm).
function BusinessProfileField({ label, value, placeholder, onSave }: {
  label: string; value: string; placeholder: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  const save = () => { onSave(draft.trim()); setEditing(false); };
  return (
    <div className="py-2 border-b border-[var(--nb-border)] last:border-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-1">{label}</div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
          />
          <button onClick={save} className="px-4 py-2 min-h-[44px] bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--nb-text-1)] min-h-[44px]">
          {value || <span className="text-[var(--nb-text-3)] font-semibold">Not set — tap to add</span>}
          <svg className="w-3.5 h-3.5 text-[var(--nb-text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
      )}
    </div>
  );
}

// ── Customizable tool rail: all 16 NetBot views with rail icons (inline SVGs
// reused from the ⋮ menu). WABotViewKey mirrors the view union in useState. ──
type WABotViewKey = 'inbox' | 'teach' | 'training' | 'catalog' | 'templates' | 'agents' | 'topup' | 'updates' | 'contacts' | 'settings' | 'help' | 'outages' | 'copilot' | 'recovery' | 'customization' | 'devices';

const ALL_RAIL_VIEWS: { key: WABotViewKey; label: string; icon: string }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'teach', label: 'Teach NetBot', icon: 'M12 20h9M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z' },
  { key: 'training', label: 'Training', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 21 12.083 12.083 0 015.84 10.578L12 14zm0 0v7' },
  { key: 'copilot', label: 'Copilot', icon: 'M12 4c.7 4.2 3.1 7.6 7.3 8.3-4.2.7-6.6 4.1-7.3 8.3-.7-4.2-3.1-7.6-7.3-8.3C8.9 11.6 11.3 8.2 12 4z' },
  { key: 'catalog', label: 'Router Catalog', icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9' },
  { key: 'templates', label: 'Bot Templates', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'agents', label: 'Voice & Agents', icon: 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z' },
  { key: 'topup', label: 'Topup', icon: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 100 6h3.75A2.25 2.25 0 0021 13.5v-1.5zM18 9.75V7.5a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 7.5v9a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0018 16.5v-2.25' },
  { key: 'updates', label: 'Updates & Changelog', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'outages', label: 'Network Outages', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'help', label: 'Help & Support', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'recovery', label: 'Pending Recoveries', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'customization', label: 'Customization', icon: 'M7 21a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
  { key: 'contacts', label: 'Contacts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'devices', label: 'Linked Devices', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
];

const RAIL_PINS_KEY = 'wabot_rail_pins';
const DEFAULT_RAIL_PINS: WABotViewKey[] = ['inbox', 'copilot', 'training', 'catalog', 'templates', 'settings'];

// Pinned rail views, persisted in localStorage. Unknown keys are dropped;
// Inbox is always pinned (it's home).
const loadRailPins = (): WABotViewKey[] => {
  try {
    const raw = localStorage.getItem(RAIL_PINS_KEY);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const valid = arr.filter((k): k is WABotViewKey =>
          typeof k === 'string' && ALL_RAIL_VIEWS.some(v => v.key === k));
        if (!valid.includes('inbox')) valid.unshift('inbox');
        if (valid.length > 0) return valid;
      }
    }
  } catch { /* ignore */ }
  return [...DEFAULT_RAIL_PINS];
};

const WABotInbox: React.FC<WABotInboxProps> = ({ managerId, customers, copilotHistory, onCopilotHistoryChange, botName, onUpdateBotName, businessProfile, onUpdateBusinessProfile, routerCatalog, onUpdateRouterCatalog, botTemplates, onUpdateBotTemplates, ttsVoice, onUpdateTtsVoice, wabotAgents, onUpdateWabotAgents, botPersonaNotes, onUpdateBotPersonaNotes, botBehaviorRules, onUpdateBotBehaviorRules, theme, onToggleTheme, themePref, onThemePrefChange, onLogout, outageLogs, onUpdateOutageLogs, totalUsers }) => {
  // Synchronized theme: uses manager/app theme prop if provided, or listens to document.documentElement / localStorage
  const isDarkControlled = typeof theme !== 'undefined';
  const [internalDark, setInternalDark] = useState<boolean>(() => {
    try {
      return document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark' || localStorage.getItem('wabot_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const wabotDark = isDarkControlled ? theme === 'dark' : internalDark;

  const toggleWabotTheme = () => {
    if (onToggleTheme) {
      onToggleTheme();
    } else {
      setInternalDark(prev => {
        const next = !prev;
        document.documentElement.classList.toggle('dark', next);
        try {
          localStorage.setItem('theme', next ? 'dark' : 'light');
          localStorage.setItem('wabot_theme', next ? 'dark' : 'light');
        } catch {}
        return next;
      });
    }
  };

  const [allMessages, setAllMessages] = useState<WAMessage[]>([]);
  const [conversationSummaries, setConversationSummaries] = useState<{
    customer_phone: string;
    last_content: string | null;
    last_type: string;
    last_time: string;
    unread_count: number;
  }[]>([]);
  const [pausedPhones, setPausedPhones] = useState<string[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [editingContactName, setEditingContactName] = useState(false);
  const [contactNameInput, setContactNameInput] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [thread, setThread] = useState<WAMessage[]>([]);
  // ── UI/UX P1 (W13): visible thread-load error + retry ──
  const [threadError, setThreadError] = useState('');
  // ── Thread parity (Phase 2a): older-message pagination, reply quote, bubble context menu ──
  const [threadHasMore, setThreadHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<WAMessage | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msg: WAMessage } | null>(null);
  // ── Phase 4: offline banner ──
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  // ── UI/UX P1 (W15): success confirmation for save actions ──
  const [saveToast, setSaveToast] = useState('');
  const saveToastTimer = useRef<number | null>(null);
  const showSaveToast = (msg: string) => {
    setSaveToast(msg);
    if (saveToastTimer.current) window.clearTimeout(saveToastTimer.current);
    saveToastTimer.current = window.setTimeout(() => setSaveToast(''), 2500);
  };
  // ── UI/UX P1 (W3): visible "Reconnecting" state when the realtime channel drops ──
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  // ── Phase 4: forward picker ──
  const [forwardMsg, setForwardMsg] = useState<WAMessage | null>(null);
  const [forwardQuery, setForwardQuery] = useState('');
  // ── Phase 4: bot typing indicator ──
  const [botTypingPhone, setBotTypingPhone] = useState<string | null>(null);
  const botTypingTimer = useRef<number | null>(null);
  const botTypingPhoneRef = useRef<string | null>(null);
  useEffect(() => { botTypingPhoneRef.current = botTypingPhone; }, [botTypingPhone]);
  const pausedPhonesRef = useRef<string[]>([]);
  useEffect(() => { pausedPhonesRef.current = pausedPhones; }, [pausedPhones]);
  const showBotTyping = useCallback((phone: string) => {
    setBotTypingPhone(phone);
    if (botTypingTimer.current) window.clearTimeout(botTypingTimer.current);
    botTypingTimer.current = window.setTimeout(() => setBotTypingPhone(null), 30000);
  }, []);
  const clearBotTyping = useCallback(() => {
    if (botTypingTimer.current) { window.clearTimeout(botTypingTimer.current); botTypingTimer.current = null; }
    setBotTypingPhone(null);
  }, []);
  useEffect(() => () => { if (botTypingTimer.current) window.clearTimeout(botTypingTimer.current); }, []);
  // ── Phase 4: thread with date separators ──
  const threadWithDates = useMemo(() => {
    const items: Array<{ kind: 'date'; key: string; label: string } | { kind: 'msg'; key: string; message: WAMessage }> = [];
    let lastLabel = '';
    for (const m of thread) {
      const label = formatDateLabel(m.created_at);
      if (label !== lastLabel) {
        lastLabel = label;
        items.push({ kind: 'date', key: `date-${label}-${m.id}`, label });
      }
      items.push({ kind: 'msg', key: m.id, message: m });
    }
    return items;
  }, [thread]);
  const suppressThreadScrollRef = useRef(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);
  const selectedPhoneRef = useRef<string | null>(null);
  useEffect(() => { selectedPhoneRef.current = selectedPhone; }, [selectedPhone]);

  // ── Voice note recording (mic) ──
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<number | null>(null);

  // ── Gallery / document attach ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── Translate toggle per message (Hindi/Urdu-script voice transcripts) ──
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({});

  // ── Bot Name setting ──
  const [editingBotName, setEditingBotName] = useState(false);
  const [botNameInput, setBotNameInput] = useState(botName || 'NetBot');
  useEffect(() => { setBotNameInput(botName || 'NetBot'); }, [botName]);

  // ── Business Profile (settings-driven identity for templates & quick replies) ──
  // Read from the manager's settings blob (same source as botName). Empty when
  // unset — template fields force the operator to fill them per send, and quick
  // replies land in the editable composer, so there is never a silent default.
  const identity: BusinessIdentity = {
    businessName: businessProfile?.businessName || '',
    supportNumber: businessProfile?.supportNumber || '',
    bankName: businessProfile?.bankName || '',
    bankAccountNo: businessProfile?.bankAccountNo || '',
    bankIban: businessProfile?.bankIban || '',
    jazzcashNo: businessProfile?.jazzcashNo || '',
    easypaisaNo: businessProfile?.easypaisaNo || '',
    supportEmail: businessProfile?.supportEmail || '',
    supportPhone: businessProfile?.supportPhone || '',
    supportWhatsApp: businessProfile?.supportWhatsApp || '',
  };

  // ── Silk D3: NetBot support contact — Business-Profile-driven. The rendered
  //    Help UI reads these variables (never hardcoded literals); the defaults
  //    keep today's values for profiles that never set them. ──
  const supportEmail = identity.supportEmail || 'support@billcollector.online';
  const supportPhone = identity.supportPhone || '+92 304 2773453';
  const supportWhatsApp = identity.supportWhatsApp || '923042773453';

  // ── Copilot tab adapters ───────────────────────────────────────────────
  // NetBot Web reuses the shared CopilotTab with its own Supabase session
  // (the shared useCopilot hook reads the JWT itself — no managerId prop
  // needed). Smallest possible adapters for what NetBot Web doesn't have:
  // - open_tab: map manager tabs onto the closest NetBot Web views
  //   ('users'/'customers' → Contacts); anything else stays on Copilot.
  // - generate_receipt: standalone NetBot has no receipt flow (removed Phase 3),
  //   so a no-op is passed — the shared useCopilot hook requires the prop.
  //   The manager dashboard keeps its real ReceiptGenerator wiring untouched.
  // - set_status: no manager-only status-change path exists here, so it is
  //   intentionally left unwired (the hook says "needs manager access").
  const handleCopilotOpenTab = (tab: string) => {
    if (tab === 'users' || tab === 'customers') setView('contacts');
    else if (tab === 'receipts') setView('inbox');
  };

  // ── Tab views & settings navigation ──
  const [view, setView] = useState<'inbox' | 'teach' | 'training' | 'catalog' | 'templates' | 'agents' | 'topup' | 'updates' | 'contacts' | 'settings' | 'help' | 'outages' | 'copilot' | 'recovery' | 'customization' | 'devices'>('inbox');
  const [menuOpen, setMenuOpen] = useState(false);
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  // Closes both the top-right ⋮ menu and the desktop rail's More dropdown.
  const closeMenus = () => { setMenuOpen(false); setRailMenuOpen(false); };

  // ── Customizable tool rail: pinned views (persisted), "+" opens the pin sheet.
  // Inbox is always pinned — it can't be unpinned. ──
  const [railPins, setRailPins] = useState<WABotViewKey[]>(() => loadRailPins());
  const [pinSheetOpen, setPinSheetOpen] = useState(false);

  const toggleRailPin = (key: WABotViewKey) => {
    if (key === 'inbox') return; // home is always pinned
    setRailPins(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      try { localStorage.setItem(RAIL_PINS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Escape dismisses the pin sheet
  useEffect(() => {
    if (!pinSheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinSheetOpen]);
  // ── Chat wallpaper (Phase 2b parity with Android Customization) ──
  const [wallpaper, setWallpaper] = useState<string>(() => {
    try { return localStorage.getItem('wabot_wallpaper') || DEFAULT_WALLPAPER; } catch { return DEFAULT_WALLPAPER; }
  });
  const changeWallpaper = (key: string) => {
    setWallpaper(key);
    try { localStorage.setItem('wabot_wallpaper', key); } catch {}
  };
  const wallpaperPreset = WALLPAPER_PRESETS.find(w => w.key === wallpaper) || WALLPAPER_PRESETS[0];
  const [helpFaqOpen, setHelpFaqOpen] = useState<number | null>(0);

  // ── Smart filter tabs (All / Unread / Payment Slips / Paused) ──
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'proofs' | 'paused'>('all');

  // ── In-App Media Lightbox state (Payment proof zoom & verification) ──
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video'; timestamp?: string; sender?: string } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxRotate, setLightboxRotate] = useState(0);

  // ── Canned quick replies (/slash commands) palette state ──
  const [showSlashPalette, setShowSlashPalette] = useState(false);
  // ── UI/UX P3 (W23): keyboard highlight index for the slash palette ──
  const [slashHi, setSlashHi] = useState(0);
  const slashMatches = inputText.startsWith('/')
    ? buildCannedReplies(identity).filter(cr => !inputText.slice(1) || cr.cmd.includes(inputText.toLowerCase()) || cr.title.toLowerCase().includes(inputText.toLowerCase()))
    : [];

  // ── Official Meta templates (Android OfficialTemplateModal parity) ──
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedOfficialTpl, setSelectedOfficialTpl] = useState<MetaTemplateDef | null>(null);
  const [officialTplValues, setOfficialTplValues] = useState<Record<string, string>>({});
  const [sendingOfficialTpl, setSendingOfficialTpl] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState('');
  const [lookupPrefill, setLookupPrefill] = useState<Record<string, string> | null>(null);
  const [usernameLookupState, setUsernameLookupState] = useState<'idle' | 'notfound'>('idle');

  // ── Agents & Voice tab state ──
  const [selectedVoice, setSelectedVoice] = useState<string>(ttsVoice || 'Kore');
  useEffect(() => { setSelectedVoice(ttsVoice || 'Kore'); }, [ttsVoice]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewConfirm, setPreviewConfirm] = useState<string | null>(null);
  const agentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<WABotAgent | null>(null);

  const playVoicePreview = async (voice: string, sampleText?: string, provider?: string, gender?: string) => {
    setPreviewingVoice(voice);
    setPreviewError(null);
    setPreviewConfirm(null);
    try {
      const resp = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ action: 'previewVoice', voice, sampleText, provider, gender }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.url) throw new Error(data.error || 'Preview failed');
      if (agentAudioRef.current) { agentAudioRef.current.pause(); }
      const audio = new Audio(data.url);
      agentAudioRef.current = audio;
      await audio.play();
      const providerLabel: Record<string, string> = { gemini: 'Gemini', azure: 'Azure', edge: 'Edge-TTS' };
      // Azure was requested but silently fell back to Edge-TTS — audio still played,
      // so this isn't a hard error, but mahadnet needs to see WHY Azure itself failed.
      if (provider === 'azure' && data.providerUsed === 'edge') {
        setPreviewError(`This is an Edge-TTS voice, not Azure — Azure failed: ${data.azureError || 'unknown reason'}`);
      } else if (data.providerUsed) {
        setPreviewConfirm(`✓ This voice was generated by ${providerLabel[data.providerUsed] || data.providerUsed}`);
      }
    } catch (e: any) {
      setPreviewError(e?.message || 'Could not generate a preview. Please try again.');
    } finally {
      setPreviewingVoice(null);
    }
  };

  const saveDefaultVoice = (voice: string) => {
    setSelectedVoice(voice);
    onUpdateTtsVoice?.(voice);
    showSaveToast('Voice saved');
  };

  const startNewAgent = () => {
    const draft: WABotAgent = { id: `agent-${Date.now()}`, name: '', scope: '', keywords: [], voice: 'Kore', active: true, purpose: 'general', ttsProvider: 'gemini', gender: 'female' };
    setAgentDraft(draft);
    setEditingAgentId(draft.id);
  };

  const editAgent = (agent: WABotAgent) => {
    setAgentDraft({ ...agent });
    setEditingAgentId(agent.id);
  };

  const saveAgentDraft = () => {
    if (!agentDraft || !agentDraft.name.trim()) return;
    const list = wabotAgents || [];
    const exists = list.some(a => a.id === agentDraft.id);
    const updated = exists ? list.map(a => a.id === agentDraft.id ? agentDraft : a) : [...list, agentDraft];
    onUpdateWabotAgents?.(updated);
    setEditingAgentId(null);
    setAgentDraft(null);
    showSaveToast('Agent saved');
  };

  const deleteAgent = (id: string) => {
    onUpdateWabotAgents?.((wabotAgents || []).filter(a => a.id !== id));
    if (editingAgentId === id) { setEditingAgentId(null); setAgentDraft(null); }
  };

  const toggleAgentActive = (id: string) => {
    onUpdateWabotAgents?.((wabotAgents || []).map(a => a.id === id ? { ...a, active: !a.active } : a));
  };
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  // ── Topup tab state — message quota usage from whatsapp_configs (same table
  // api/webhook.ts checkQuota() reads from, so this always matches what the
  // bot itself is enforcing) ──
  const [quota, setQuota] = useState<{
    textUsed: number; textQuota: number;
    voiceUsed: number; voiceQuota: number;
    planType: string | null; serviceStatus: string | null; cycleEndDate: string | null;
  } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    setQuotaError(null);
    try {
      const { data, error } = await supabase
        .from('whatsapp_configs')
        .select('text_used_this_cycle,text_quota,voice_used_this_cycle,voice_quota,plan_type,service_status,cycle_end_date')
        .eq('manager_id', managerId)
        .maybeSingle();
      if (error) throw error;
      setQuota({
        textUsed: data?.text_used_this_cycle ?? 0,
        textQuota: data?.text_quota ?? 0,
        voiceUsed: data?.voice_used_this_cycle ?? 0,
        voiceQuota: data?.voice_quota ?? 0,
        planType: data?.plan_type ?? null,
        serviceStatus: data?.service_status ?? null,
        cycleEndDate: data?.cycle_end_date ?? null,
      });
    } catch (e: any) {
      console.error('[WABotInbox] loadQuota', e);
      setQuotaError('Could not load quota. Please try again.');
    } finally {
      setQuotaLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    if (view === 'topup') loadQuota();
  }, [view, loadQuota]);
  const [personaDraft, setPersonaDraft] = useState(botPersonaNotes || '');
  const [ruleDraft, setRuleDraft] = useState({ trigger: '', response: '' });
  useEffect(() => { setPersonaDraft(botPersonaNotes || ''); }, [botPersonaNotes]);

  const savePersonaNotes = () => {
    onUpdateBotPersonaNotes?.(personaDraft.trim());
    showSaveToast('Persona saved');
  };

  const addBehaviorRule = () => {
    const trigger = ruleDraft.trigger.trim();
    const response = ruleDraft.response.trim();
    if (!trigger || !response) {
      alert('Both situation and preferred handling are required');
      return;
    }
    const rule: WABotBehaviorRule = { id: `rule-${Date.now()}`, trigger, response, active: true };
    onUpdateBotBehaviorRules?.([...(botBehaviorRules || []), rule]);
    setRuleDraft({ trigger: '', response: '' });
    showSaveToast('Rule saved');
  };

  const toggleBehaviorRule = (id: string) => {
    onUpdateBotBehaviorRules?.((botBehaviorRules || []).map(rule => rule.id === id ? { ...rule, active: !rule.active } : rule));
  };

  const deleteBehaviorRule = (id: string) => {
    if (!confirm('Delete this Teach NetBot rule?')) return;
    onUpdateBotBehaviorRules?.((botBehaviorRules || []).filter(rule => rule.id !== id));
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // ── Router Catalog tab state (admin-editable, drives what NetBot shows on WhatsApp) ──
  const [catalogState, setCatalogState] = useState<RouterCatalog>(
    hasCatalogContent(routerCatalog) ? (routerCatalog as RouterCatalog) : DEFAULT_ROUTER_CATALOG
  );
  const [catalogModal, setCatalogModal] = useState<{ band: '2.4g' | '5g'; item: RouterCatalogItem | null } | null>(null);
  const [catalogForm, setCatalogForm] = useState({ model: '', company: '', band: '', price: '', image: '', specs: '' });

  useEffect(() => {
    if (hasCatalogContent(routerCatalog)) setCatalogState(routerCatalog as RouterCatalog);
  }, [routerCatalog]);

  const openAddRouter = (band: '2.4g' | '5g') => {
    setCatalogForm({ model: '', company: '', band: band === '2.4g' ? '2.4GHz Single Band' : '5GHz + 2.4GHz Dual Band', price: '', image: '', specs: '' });
    setCatalogModal({ band, item: null });
  };

  const openEditRouter = (band: '2.4g' | '5g', item: RouterCatalogItem) => {
    setCatalogForm({ model: item.model, company: item.company, band: item.band, price: String(item.price), image: item.image, specs: item.specs });
    setCatalogModal({ band, item });
  };

  const saveCatalogModal = () => {
    if (!catalogModal) return;
    const { band, item } = catalogModal;
    const newItem: RouterCatalogItem = {
      id: item?.id || `r-${Date.now()}`,
      model: catalogForm.model.trim() || 'Untitled',
      company: catalogForm.company.trim(),
      band: catalogForm.band.trim(),
      price: Number(catalogForm.price) || 0,
      image: catalogForm.image.trim(),
      specs: catalogForm.specs,
    };
    const next: RouterCatalog = { '2.4g': [...catalogState['2.4g']], '5g': [...catalogState['5g']] };
    next[band] = item ? next[band].map(r => (r.id === item.id ? newItem : r)) : [...next[band], newItem];
    setCatalogState(next);
    onUpdateRouterCatalog?.(next);
    setCatalogModal(null);
    showSaveToast('Catalog saved');
  };

  const deleteRouter = (band: '2.4g' | '5g', id: string) => {
    const next: RouterCatalog = { ...catalogState, [band]: catalogState[band].filter(r => r.id !== id) };
    setCatalogState(next);
    onUpdateRouterCatalog?.(next);
  };

  // ── Templates tab state (every canned WhatsApp bot reply, grouped by category) ──
  // `botTemplates` (the prop) is the RAW admin overrides only — exactly what's stored in
  // Supabase settings.botTemplates. Previously this tab displayed that raw prop directly,
  // so it started completely empty (nothing seeded client-side) and just showed a permanent
  // "Templates load ho rahe hain" placeholder with no way to edit or add anything. Now it's
  // merged over DEFAULT_BOT_TEMPLATES for display, same pattern as MessageTemplatesTab, while
  // saving still only writes the specific touched key back — not a full duplicate copy of
  // every default template.
  const effectiveTemplates: Record<string, BotTemplate> = useMemo(() => {
    return { ...DEFAULT_BOT_TEMPLATES, ...(botTemplates || {}) };
  }, [botTemplates]);
  const isCustomBotTemplate = (key: string) => !DEFAULT_BOT_TEMPLATES[key];
  const isEditedBotTemplate = (key: string) => !!(botTemplates && botTemplates[key]);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState('');
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newBotTemplate, setNewBotTemplate] = useState({ key: '', label: '', category: 'General', text: '' });

  const templatesByCategory = useMemo(() => {
    const groups: Record<string, Array<[string, BotTemplate]>> = {};
    for (const [key, item] of Object.entries(effectiveTemplates) as [string, BotTemplate][]) {
      const cat = item.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push([key, item]);
    }
    for (const cat of Object.keys(groups)) groups[cat].sort((a, b) => a[1].label.localeCompare(b[1].label));
    return groups;
  }, [effectiveTemplates]);

  const templateCategoryOrder = [
    'Greetings & Identity', 'Thanks & Closing', 'Billing & Payments',
    'New Connection & Coverage', 'Router & Fiber', 'Troubleshooting & Complaints',
  ];
  const orderedCategories = Object.keys(templatesByCategory).sort((a, b) => {
    const ia = templateCategoryOrder.indexOf(a), ib = templateCategoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const openTemplateEdit = (key: string) => {
    if (editingTemplateKey === key) { setEditingTemplateKey(null); return; }
    setEditingTemplateKey(key);
    setTemplateDraft(effectiveTemplates[key]?.text || '');
  };

  const saveTemplateEdit = (key: string) => {
    const existing = effectiveTemplates[key];
    const updated = { ...(botTemplates || {}), [key]: { ...existing, text: templateDraft } };
    onUpdateBotTemplates?.(updated);
    setEditingTemplateKey(null);
    showSaveToast('Template saved');
  };

  const resetBotTemplateToDefault = (key: string) => {
    if (!botTemplates || !botTemplates[key]) return;
    if (!confirm('Reset this template to the default wording?')) return;
    const updated = { ...botTemplates };
    delete updated[key];
    onUpdateBotTemplates?.(updated);
  };

  const deleteCustomBotTemplate = (key: string) => {
    if (!confirm('Permanently delete this custom template?')) return;
    const updated = { ...(botTemplates || {}) };
    delete updated[key];
    onUpdateBotTemplates?.(updated);
  };

  const handleAddBotTemplate = () => {
    if (!newBotTemplate.key.trim() || !newBotTemplate.label.trim() || !newBotTemplate.text.trim()) {
      alert('Key, label and text are all required');
      return;
    }
    const safeKey = newBotTemplate.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (effectiveTemplates[safeKey]) {
      alert('This key already exists — try a different name');
      return;
    }
    const updated = {
      ...(botTemplates || {}),
      [safeKey]: { category: newBotTemplate.category, label: newBotTemplate.label, text: newBotTemplate.text },
    };
    onUpdateBotTemplates?.(updated);
    setNewBotTemplate({ key: '', label: '', category: 'General', text: '' });
    setShowAddTemplateModal(false);
  };

  const loadKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const { data } = await supabase
        .from('netbot_knowledge')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false })
        .limit(200);
      setKnowledge(data || []);
    } catch (e) {
      console.error('[WABotInbox] loadKnowledge', e);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    if (view === 'training') loadKnowledge();
  }, [view, loadKnowledge]);

  const unreviewedCount = useMemo(() => knowledge.filter(k => k.tags?.includes('unreviewed')).length, [knowledge]);

  const approveKnowledge = async (item: KnowledgeItem, finalAnswer: string) => {
    try {
      await supabase
        .from('netbot_knowledge')
        .update({ answer: finalAnswer, tags: ['approved'], updated_at: new Date().toISOString() })
        .eq('id', item.id);
      setKnowledge(prev => prev.map(k => (k.id === item.id ? { ...k, answer: finalAnswer, tags: ['approved'] } : k)));
      setEditingId(null);
    } catch (e) {
      console.error('[WABotInbox] approveKnowledge', e);
    }
  };

  const deleteKnowledge = async (id: string) => {
    try {
      await supabase.from('netbot_knowledge').delete().eq('id', id);
      setKnowledge(prev => prev.filter(k => k.id !== id));
    } catch (e) {
      console.error('[WABotInbox] deleteKnowledge', e);
    }
  };

  const revertKnowledge = async (id: string) => {
    try {
      await supabase.from('netbot_knowledge').update({ tags: ['unreviewed'] }).eq('id', id);
      setKnowledge(prev => prev.map(k => (k.id === id ? { ...k, tags: ['unreviewed'] } : k)));
    } catch (e) {
      console.error('[WABotInbox] revertKnowledge', e);
    }
  };

  const customerByPhone = useMemo(() => {
    const map = new Map<string, UserRecord>();
    for (const c of customers) {
      if (!c) continue;
      const p1 = (c.phone || '').replace(/\D/g, '').slice(-10);
      const p2 = (c.phone2 || '').replace(/\D/g, '').slice(-10);
      if (p1) map.set(p1, c);
      if (p2) map.set(p2, c);
    }
    return map;
  }, [customers]);

  const loadOverview = useCallback(async () => {
    try {
      // Egress fix: this used to also pull the latest 500 whatsapp_messages
      // rows (full columns) on every 15s tick just to populate `allMessages` —
      // but that state is never read anywhere in this file (dead since
      // conversationSummaries RPC took over driving the chat list below).
      // Removing it cuts this poll's payload to near-zero.

      // The chat LIST must never depend on a row-count cap — once daily
      // message volume passes 500 (very easy with cron reminders + bot replies),
      // any customer who hadn't messaged very recently silently vanished from
      // the list entirely. This RPC aggregates per-phone directly in Postgres
      // with no row limit, so every conversation always shows up (same fix
      // already applied on the Android app side).
      const { data: summaries, error: summErr } = await supabase.rpc('get_conversation_summaries', {
        p_manager_id: managerId,
      });
      if (summErr) console.error('[WABotInbox] summaries fetch failed', summErr);
      setConversationSummaries(summaries || []);

      const { data: cfg } = await supabase
        .from('whatsapp_configs')
        .select('paused_phones, contact_names')
        .eq('manager_id', managerId)
        .maybeSingle();
      setPausedPhones(cfg?.paused_phones || []);
      setContactNames(cfg?.contact_names || {});
    } catch (e) {
      console.error('[WABotInbox] loadOverview', e);
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    loadOverview();
    // Realtime is the primary update path now; this poll just covers the rare
    // case where a websocket event is missed (network blip, tab backgrounded).
    const interval = setInterval(loadOverview, POLL_MS);
    return () => clearInterval(interval);
  }, [loadOverview]);

  const conversations: Conversation[] = useMemo(() => {
    const list: Conversation[] = conversationSummaries.map((s) => {
      const phone = s.customer_phone;
      const cust = customerByPhone.get(phone);
      return {
        phone,
        name: contactNames[phone] || cust?.name || `+92${phone}`,
        username: cust?.username,
        userId: cust?.id,
        lastMessage: s.last_type === 'text' ? s.last_content || '' : s.last_type,
        lastType: s.last_type,
        lastTime: s.last_time || '',
        unreadCount: s.unread_count,
        paused: pausedPhones.includes(phone),
      };
    });
    return list
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
      .sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  }, [conversationSummaries, customerByPhone, pausedPhones, contactNames, search]);

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (chatFilter === 'unread') return c.unreadCount > 0;
      if (chatFilter === 'paused') return c.paused;
      if (chatFilter === 'proofs') {
        const isImgOrDoc = c.lastType === 'image' || c.lastType === 'document';
        // UI/UX P1 (W20): bare "ada" matched unrelated text — require a payment verb next to it.
        const textHasProof = /proof|slip|payment|paid|screen\s*shot|receipt|bhej\s*di|ada\s*(kar|ho|kiya?|kya|gay[ai]|diy?a?)\b/i.test(c.lastMessage);
        return isImgOrDoc || textHasProof;
      }
      return true;
    });
  }, [conversations, chatFilter]);

  const filterCounts = useMemo(() => {
    return {
      all: conversations.length,
      unread: conversations.filter(c => c.unreadCount > 0).length,
      proofs: conversations.filter(c => (c.lastType === 'image' || c.lastType === 'document') || /proof|slip|payment|paid|receipt/i.test(c.lastMessage)).length,
      paused: conversations.filter(c => c.paused).length,
    };
  }, [conversations]);

  const openConversation = useCallback(async (phone: string) => {
    setSelectedPhone(phone);
    setThreadError('');
    // BUG FIX: thread wasn't cleared here, so switching contacts briefly rendered
    // the PREVIOUS conversation's messages (at whatever scroll position it was
    // left at) before the async fetch below resolved — this is exactly what
    // looked like "opens to the first message, then scrolls, then flashes and
    // resets". Clearing immediately means the new thread only ever shows once
    // its own real data has arrived.
    setThread([]);
    setEditingContactName(false);
    try {
      // BUG FIX: ascending order + limit(150) was keeping the OLDEST 150 messages
      // and silently dropping everything after — so any conversation with more than
      // 150 messages total looked like it was "missing" everything except whatever
      // arrived live via realtime after the screen was opened. Fetch the most RECENT
      // window (descending + limit) instead, then reverse for correct display order.
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('manager_id', managerId)
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false })
        .limit(300);
      setThread((data || []).slice().reverse());
      setThreadHasMore((data?.length || 0) >= 300);
      setReplyTo(null);
      setCtxMenu(null);

      // Mark unread inbound messages as read
      await supabase
        .from('whatsapp_messages')
        .update({ is_read: true })
        .eq('manager_id', managerId)
        .eq('customer_phone', phone)
        .eq('direction', 'in')
        .eq('is_read', false);
      setAllMessages(prev => prev.map(m => (m.customer_phone === phone && m.direction === 'in' ? { ...m, is_read: true } : m)));
      // Zero the badge in the summary-driven list immediately too, instead of
      // waiting for the next poll — same instant-clear UX as before.
      setConversationSummaries(prev => prev.map(s => (s.customer_phone === phone ? { ...s, unread_count: 0 } : s)));
    } catch (e) {
      console.error('[WABotInbox] openConversation', e);
      setThreadError('Could not load this conversation. Check your connection and try again.');
    }
  }, [managerId]);

  // Live updates — new messages (and ticks/status changes) appear instantly in
  // both the chat list and an open thread, the same way WhatsApp itself behaves,
  // instead of only refreshing when a conversation is re-opened.
  useEffect(() => {
    const channel = supabase
      .channel(`wabot-inbox-${managerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `manager_id=eq.${managerId}` },
        (payload: any) => {
          const m = payload.new as WAMessage;
          setAllMessages(prev => (prev.some(x => x.id === m.id) ? prev : [m, ...prev]));
          // Patch the summary-driven list live too, so a brand-new conversation
          // (or a new message on an existing one) shows up / jumps to top
          // instantly instead of waiting for the next 15s poll.
          setConversationSummaries(prev => {
            const idx = prev.findIndex(s => s.customer_phone === m.customer_phone);
            const bumpUnread = m.direction === 'in' && !m.is_read ? 1 : 0;
            if (idx === -1) {
              return [
                ...prev,
                {
                  customer_phone: m.customer_phone,
                  last_content: m.content,
                  last_type: m.type,
                  last_time: m.created_at,
                  unread_count: bumpUnread,
                },
              ];
            }
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              last_content: m.content,
              last_type: m.type,
              last_time: m.created_at,
              unread_count: updated[idx].unread_count + bumpUnread,
            };
            return updated;
          });
          if (selectedPhoneRef.current === m.customer_phone) {
            setThread(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
            if (m.direction === 'in' && !m.is_read) {
              supabase.from('whatsapp_messages').update({ is_read: true }).eq('id', m.id).then(() => {});
            }
          }
          // Bot typing indicator (Phase 4): a customer message on an unpaused
          // chat means the bot is about to reply - show "typing..." until its
          // reply lands or 30s pass.
          if (m.direction === 'in' && !pausedPhonesRef.current.includes(m.customer_phone)) {
            showBotTyping(m.customer_phone);
          } else if (m.direction === 'out' && botTypingPhoneRef.current === m.customer_phone) {
            clearBotTyping();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages', filter: `manager_id=eq.${managerId}` },
        (payload: any) => {
          const m = payload.new as WAMessage;
          setAllMessages(prev => prev.map(x => (x.id === m.id ? m : x)));
          if (selectedPhoneRef.current === m.customer_phone) {
            setThread(prev => prev.map(x => (x.id === m.id ? m : x)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_configs', filter: `manager_id=eq.${managerId}` },
        (payload: any) => {
          setPausedPhones(payload.new?.paused_phones || []);
          setContactNames(payload.new?.contact_names || {});
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') setReconnecting(false);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setReconnecting(true);
          console.error('[WABotInbox] realtime channel', status, err?.message);
          // Websocket dropped — pull a fresh copy immediately instead of waiting for
          // the next poll tick, so a flaky connection never looks like "messages gone".
          loadOverview();
          if (selectedPhoneRef.current) openConversation(selectedPhoneRef.current);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [managerId, loadOverview, openConversation]);

  // BUG FIX: this always used `behavior: 'smooth'`, including the very first
  // time a conversation's messages arrive — so opening a chat animated a slow
  // scroll from top to bottom instead of just landing at the bottom instantly
  // (WhatsApp-style). Now: instant jump the first time a conversation is
  // opened, smooth animation only for new messages that arrive while already
  // viewing the thread.
  const isInitialThreadPaintRef = useRef(true);
  const threadContainerRef = useRef<HTMLDivElement>(null);
  // BUG FIX: images/voice-notes/videos inside messages finish loading AFTER
  // the DOM first paints, so a single scrollIntoView on `thread` change lands
  // short — the container keeps growing as attachments load in, leaving the
  // newest message below the fold until the user scrolls down manually. A
  // ResizeObserver re-anchors to the bottom every time the container's height
  // changes (i.e. an attachment just finished loading), but only while the
  // user hasn't manually scrolled away from the bottom — same "stick to
  // bottom unless reading history" behavior WhatsApp itself uses.
  const isPinnedToBottomRef = useRef(true);
  useEffect(() => {
    isInitialThreadPaintRef.current = true;
    isPinnedToBottomRef.current = true;
  }, [selectedPhone]);
  useEffect(() => {
    if (suppressThreadScrollRef.current) { suppressThreadScrollRef.current = false; return; }
    threadEndRef.current?.scrollIntoView({ behavior: isInitialThreadPaintRef.current ? 'auto' : 'smooth' });
    isInitialThreadPaintRef.current = false;
  }, [thread]);
  useEffect(() => {
    const container = threadContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      isPinnedToBottomRef.current = distanceFromBottom < 120;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      if (isPinnedToBottomRef.current) {
        threadEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    });
    observer.observe(container);
    return () => {
      container.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [selectedPhone]);

  const selectedConv = conversations.find(c => c.phone === selectedPhone);
  const selectedCustomer = selectedPhone ? customerByPhone.get(selectedPhone) : undefined;

  const windowStatus = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].direction === 'in') {
        const hoursSince = (Date.now() - new Date(thread[i].created_at).getTime()) / 3600000;
        return hoursSince < 24
          ? { open: true, hoursLeft: Math.max(0, 24 - hoursSince) }
          : { open: false, hoursLeft: 0 };
      }
    }
    return null;
  }, [thread]);

  const persistPauseAfterSend = async (phone: string) => {
    if (!pausedPhones.includes(phone)) {
      const nextPaused = [...pausedPhones, phone];
      setPausedPhones(nextPaused);
      try {
        await supabase.from('whatsapp_configs').update({ paused_phones: nextPaused }).eq('manager_id', managerId);
      } catch (e) { console.error('[WABotInbox] pause persist', e); }
    }
    try {
      await supabase.rpc('bump_paused_at', { p_manager_id: managerId, p_phone: phone });
    } catch (e) { console.error('[WABotInbox] bump_paused_at', e); }
  };

  const closeOfficialTemplateModal = () => {
    setTemplateModalOpen(false);
    setSelectedOfficialTpl(null);
    setOfficialTplValues({});
    setSendingOfficialTpl(false);
    setUsernameQuery('');
    setLookupPrefill(null);
    setUsernameLookupState('idle');
  };

  const openOfficialTemplateModal = () => {
    setSelectedOfficialTpl(null);
    setOfficialTplValues({});
    setUsernameQuery('');
    setLookupPrefill(null);
    setUsernameLookupState('idle');
    setTemplateModalOpen(true);
  };

  const lookupOfficialTplByUsername = () => {
    const uname = usernameQuery.trim().replace(/^@/, '').toLowerCase();
    if (!uname) return;
    const match = customers.find(c => (c.username || '').toLowerCase() === uname);
    if (match) {
      setLookupPrefill(buildOfficialTemplatePrefill(match, match.name, identity));
      setUsernameLookupState('idle');
    } else {
      setLookupPrefill(null);
      setUsernameLookupState('notfound');
    }
  };

  const pickOfficialTpl = (tpl: MetaTemplateDef) => {
    setSelectedOfficialTpl(tpl);
    const source = lookupPrefill || buildOfficialTemplatePrefill(selectedCustomer, selectedConv?.name, identity);
    const initial: Record<string, string> = {};
    for (const f of tpl.fields) {
      if (source[f.key] !== undefined && source[f.key] !== '') initial[f.key] = source[f.key];
    }
    setOfficialTplValues(initial);
  };

  const sendOfficialTemplate = async () => {
    if (!selectedPhone || !selectedOfficialTpl || sendingOfficialTpl) return;
    const allFilled = selectedOfficialTpl.fields.every(f => (officialTplValues[f.key] || '').trim());
    if (!allFilled) return;
    const params = selectedOfficialTpl.fields.map(f => officialTplValues[f.key].trim());
    const preview = renderOfficialTemplateBody(selectedOfficialTpl.bodyTemplate, params);
    setSendingOfficialTpl(true);
    const optimistic: WAMessage = {
      id: `temp-${Date.now()}`,
      manager_id: managerId,
      customer_phone: selectedPhone,
      direction: 'out',
      type: 'text',
      content: preview,
      flagged_payment_proof: false,
      is_read: true,
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setThread(prev => [...prev, optimistic]);
    try {
      const res = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({
          to: `92${selectedPhone}`,
          managerId,
          type: 'template',
          templateName: selectedOfficialTpl.name,
          templateParams: params,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setThread(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m));
        alert(`Template was not sent: ${err?.error || 'unknown error'}`);
        return;
      }
      await persistPauseAfterSend(selectedPhone);
      closeOfficialTemplateModal();
    } catch (e) {
      setThread(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m));
      alert('Network error — template was not sent.');
    } finally {
      setSendingOfficialTpl(false);
      loadOverview();
    }
  };

  // Short label for a quoted message (reply strip + quote block), mirroring Android's replySnippet.
  const replySnippet = (m: WAMessage): string => {
    if (m.type === 'text' && m.content) return m.content.length > 120 ? m.content.slice(0, 120) + '\u2026' : m.content;
    if (m.type === 'image') return 'Photo';
    if (m.type === 'video') return 'Video';
    if (m.type === 'document') return 'Document';
    return 'Voice note';
  };

  // ── Load older messages: fetch the next 300 older than the oldest loaded ──
  const loadOlderMessages = async () => {
    if (!selectedPhone || loadingOlder || !threadHasMore || thread.length === 0) return;
    setLoadingOlder(true);
    const container = threadContainerRef.current;
    const prevHeight = container ? container.scrollHeight : 0;
    try {
      const oldest = thread[0].created_at;
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('manager_id', managerId)
        .eq('customer_phone', selectedPhone)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(300);
      const older = (data || []).slice().reverse();
      suppressThreadScrollRef.current = true;
      setThread(prev => [...older, ...prev]);
      setThreadHasMore((data?.length || 0) >= 300);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = Math.max(0, container.scrollHeight - prevHeight);
      });
    } catch (e) {
      console.error('[WABotInbox] loadOlderMessages', e);
    } finally {
      setLoadingOlder(false);
    }
  };

  // -- Forward a message to another chat (Phase 4). Text goes as a text
  // message; media is re-sent from its existing URL (already on R2/CDN, no
  // re-upload). The realtime channel picks the sent message up, so the target
  // chat updates live; an optimistic row covers instant feedback.
  const forwardMessage = async (msg: WAMessage, toPhone: string) => {
    const mediaSrc = msg.media_url || (msg.content?.startsWith('http') ? msg.content : null);
    const isText = msg.type === 'text' && !!msg.content && !msg.content.startsWith('http');
    if (!isText && !mediaSrc) return;
    const fwdType = isText ? 'text' : (msg.type === 'video' ? 'video' : msg.type === 'document' ? 'document' : msg.type === 'audio' || msg.type === 'voice' ? 'audio' : 'image');
    const payload: any = { to: '92' + toPhone, managerId };
    if (isText) payload.body = msg.content;
    else { payload.type = fwdType; payload.mediaUrl = mediaSrc; }
    const optimistic: WAMessage = {
      id: 'temp-fwd-' + Date.now(), manager_id: managerId, customer_phone: toPhone,
      direction: 'out', type: fwdType as WAMessage['type'],
      content: isText ? msg.content : mediaSrc, media_url: isText ? null : mediaSrc,
      flagged_payment_proof: false, is_read: true, status: 'sent',
      created_at: new Date().toISOString(),
    };
    setAllMessages(prev => [optimistic, ...prev]);
    setForwardMsg(null);
    try {
      const res = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setAllMessages(prev => prev.map(m => (m.id === optimistic.id ? { ...m, status: 'failed' } : m)));
      }
    } catch (e) {
      setAllMessages(prev => prev.map(m => (m.id === optimistic.id ? { ...m, status: 'failed' } : m)));
    }
    loadOverview();
  };

  // ── Retry a failed text message (mirrors Android's bubble Retry; media retry
  // is intentionally out of scope — failed media needs a fresh file pick). ──
  const retryTextMessage = async (m: WAMessage) => {
    if (!selectedPhone || m.type !== 'text' || !m.content) return;
    setThread(prev => prev.map(x => x.id === m.id ? { ...x, status: 'sent' as const } : x));
    try {
      const res = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ to: `92${selectedPhone}`, body: m.content, managerId }),
      });
      if (!res.ok) throw new Error('send failed');
    } catch (e) {
      setThread(prev => prev.map(x => x.id === m.id ? { ...x, status: 'failed' as const } : x));
    }
  };

  // ── Delete an own outgoing message (mirrors Android's long-press Delete). ──
  const deleteThreadMessage = async (m: WAMessage) => {
    if (m.direction !== 'out' || !selectedPhone) return;
    if (!window.confirm('Delete this message?')) return;
    setThread(prev => prev.filter(x => x.id !== m.id));
    try {
      const { error } = await supabase.from('whatsapp_messages').delete().eq('id', m.id).eq('manager_id', managerId);
      if (error) throw error;
    } catch (e) {
      console.error('[WABotInbox] deleteThreadMessage', e);
      openConversation(selectedPhone);
    }
  };

  const handleSend = async () => {
    if (!selectedPhone || !inputText.trim() || sending) return;
    const body = inputText.trim();
    setInputText('');
    const quoted = replyTo;
    setReplyTo(null);
    setSending(true);
    const optimistic: WAMessage = {
      id: `temp-${Date.now()}`,
      manager_id: managerId,
      customer_phone: selectedPhone,
      direction: 'out',
      type: 'text',
      content: body,
      flagged_payment_proof: false,
      is_read: true,
      status: 'sent',
      created_at: new Date().toISOString(),
      // Quote fields stay local — the current /api/wabot-send endpoint does not
      // support reply context (same as Android's offline comment).
      reply_to_id: quoted?.id ?? null,
      reply_to_content: quoted ? replySnippet(quoted) : null,
      reply_to_sender: quoted ? (quoted.direction === 'out' ? 'You' : (selectedConv?.name || 'Customer')) : null,
    };
    setThread(prev => [...prev, optimistic]);
    try {
      const res = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ to: `92${selectedPhone}`, body, managerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Message was not sent: ${err?.error || 'unknown error'}`);
      }
      // Replying manually pauses the bot on this thread — this already updated
      // local state, but never actually persisted to Supabase, so the webhook
      // (which reads paused_phones from the DB/Redis, not this component's
      // state) could still fire an auto-reply right after a manual message.
      // Also stamp paused_at so the 15-min auto-resume (webhook.ts) has a real
      // "last operator activity" time to measure from, and keeps extending
      // while the operator is actively replying.
      if (!pausedPhones.includes(selectedPhone)) {
        const nextPaused = [...pausedPhones, selectedPhone];
        setPausedPhones(nextPaused);
        try {
          await supabase.from('whatsapp_configs').update({ paused_phones: nextPaused }).eq('manager_id', managerId);
        } catch (e) { console.error('[WABotInbox] handleSend pause persist', e); }
      }
      try {
        await supabase.rpc('bump_paused_at', { p_manager_id: managerId, p_phone: selectedPhone });
      } catch (e) { console.error('[WABotInbox] bump_paused_at', e); }
    } catch (e) {
      alert('Network error — message was not sent.');
    } finally {
      setSending(false);
      loadOverview();
    }
  };

  const togglePause = async () => {
    if (!selectedPhone) return;
    const isPaused = pausedPhones.includes(selectedPhone);
    const next = isPaused ? pausedPhones.filter(p => p !== selectedPhone) : [...pausedPhones, selectedPhone];
    setPausedPhones(next);
    try {
      if (isPaused) {
        // Manual resume — clear the auto-resume timer for this phone too, via
        // an RPC so we don't need to fetch+merge the paused_at map client-side.
        await supabase.from('whatsapp_configs').update({ paused_phones: next }).eq('manager_id', managerId);
        await supabase.rpc('clear_paused_at', { p_manager_id: managerId, p_phone: selectedPhone });
      } else {
        await supabase.from('whatsapp_configs').update({ paused_phones: next }).eq('manager_id', managerId);
        await supabase.rpc('bump_paused_at', { p_manager_id: managerId, p_phone: selectedPhone });
      }
    } catch (e) {
      console.error('[WABotInbox] togglePause', e);
    }
  };

  // ── Bulk pause/resume (Android parity with HeaderMenu bulk toggle): pause or
  // resume the bot on every conversation currently in the list, persisted with
  // the same whatsapp_configs.paused_phones update as togglePause. ──
  const allPaused = conversations.length > 0 && conversations.every(c => pausedPhones.includes(c.phone));
  const [bulkConfirm, setBulkConfirm] = useState<null | 'pause' | 'resume'>(null);

  // Escape dismisses the bulk confirm sheet
  useEffect(() => {
    if (!bulkConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBulkConfirm(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bulkConfirm]);

  // The movable Copilot bubble stays hidden after drag-to-close until the user
  // opens the Copilot view once (e.g. from the menu) — then it comes back.
  useEffect(() => {
    if (view === 'copilot') {
      try { localStorage.removeItem('wabot_copilot_bubble_closed'); } catch { /* ignore */ }
    }
  }, [view]);

  const pauseAllBots = async () => {
    const allPhones = Array.from(new Set([...pausedPhones, ...conversations.map(c => c.phone)]));
    setPausedPhones(allPhones);
    setBulkConfirm(null);
    try {
      // Stamp paused_at for every paused phone, same as togglePause (bump_paused_at),
      // so the webhook's 15-min auto-resume measures from now — not from a stale
      // timestamp left by an earlier pause, which would resume some phones at once.
      const { data: cfg } = await supabase.from('whatsapp_configs').select('paused_at').eq('manager_id', managerId).maybeSingle();
      const nowIso = new Date().toISOString();
      const pausedAtMap: Record<string, string> = { ...((cfg as any)?.paused_at || {}) };
      for (const ph of allPhones) pausedAtMap[ph] = nowIso;
      await supabase.from('whatsapp_configs').update({ paused_phones: allPhones, paused_at: pausedAtMap }).eq('manager_id', managerId);
    } catch (e) {
      console.error('[WABotInbox] pauseAllBots', e);
    }
  };

  const resumeAllBots = async () => {
    setPausedPhones([]);
    setBulkConfirm(null);
    try {
      // Clear paused_at too (togglePause resume uses clear_paused_at) so no stale
      // timers survive to auto-resume a phone paused again later.
      await supabase.from('whatsapp_configs').update({ paused_phones: [], paused_at: {} }).eq('manager_id', managerId);
    } catch (e) {
      console.error('[WABotInbox] resumeAllBots', e);
    }
  };

  // ── Overflow menu panel items (shared by the top-right ⋮ menu on mobile
  // and the desktop tool rail's More dropdown). Includes the D4 account row,
  // the bulk pause/resume item (Android parity), all view links, and Logout. ──
  const renderMenuItems = () => (<>
{/* ── Silk D4: account row (username/plan) at the top of the ⋮ menu.
                    username = managerId prop; plan = loaded quota planType (may be
                    unset until the Topup view loads it — no extra fetching). ── */}
                <div className="px-4 py-3 border-b border-[var(--nb-border)]">
                  <p className="text-sm font-black text-[var(--nb-text-1)] truncate">{managerId}</p>
                  {quota?.planType ? (
                    <p className="text-[11px] font-bold text-[var(--nb-text-2)] capitalize mt-0.5">{quota.planType.replace('_', ' ')}</p>
                  ) : null}
                </div>
                {/* ── Bulk pause/resume (Android parity): under the D4 account row ── */}
                <button
                  onClick={() => { setBulkConfirm(allPaused ? 'resume' : 'pause'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  {allPaused ? (
                    <svg className="w-4 h-4 flex-shrink-0 text-[var(--nb-accent)]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  ) : (
                    <svg className="w-4 h-4 flex-shrink-0 text-[var(--nb-warning)]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" /></svg>
                  )}
                  {allPaused ? 'Resume all bots' : 'Pause all bots'}
                </button>
                <button
                  onClick={() => { setView('teach'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" /></svg>
                  Teach NetBot
                  {(botBehaviorRules || []).filter(rule => rule.active).length > 0 && <span className="ml-auto bg-[var(--nb-accent)] text-white text-[9px] font-black px-2 py-1 rounded-full">{(botBehaviorRules || []).filter(rule => rule.active).length}</span>}
                </button>
                <button
                  onClick={() => { setView('training'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 21 12.083 12.083 0 015.84 10.578L12 14zm0 0v7" /></svg>
                  Training
                  {unreviewedCount > 0 && <span className="ml-auto bg-[var(--nb-warning)] text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{unreviewedCount}</span>}
                </button>
                <button
                  onClick={() => { setView('copilot'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-[var(--nb-accent)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4c.7 4.2 3.1 7.6 7.3 8.3-4.2.7-6.6 4.1-7.3 8.3-.7-4.2-3.1-7.6-7.3-8.3C8.9 11.6 11.3 8.2 12 4z" /></svg>
                  Copilot
                </button>
                <button
                  onClick={() => { setView('catalog'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                  Router Catalog
                </button>
                <button
                  onClick={() => { setView('templates'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Bot Templates
                </button>
                <button
                  onClick={() => { setView('agents'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                  Voice &amp; Agents
                </button>
                <button
                  onClick={() => { setView('topup'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 100 6h3.75A2.25 2.25 0 0021 13.5v-1.5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9.75V7.5a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 7.5v9a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0018 16.5v-2.25" /></svg>
                  Topup
                </button>
                <button
                  onClick={() => { setView('updates'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 text-[var(--nb-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <div className="flex-1 flex items-center justify-between text-left">
                    <span>Updates &amp; Changelog</span>
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-[var(--nb-accent-soft)] text-[var(--nb-accent)]">New</span>
                  </div>
                </button>
                <button
                  onClick={() => { setView('settings'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Settings
                </button>
                <button
                  onClick={() => { setView('outages'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Network Outages
                </button>
                <button
                  onClick={() => { setView('help'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Help &amp; Support
                </button>
                <button
                  onClick={() => { setView('recovery'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Pending Recoveries
                </button>
                <button
                  onClick={() => { setView('customization'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  Customization
                </button>
                <button
                  onClick={() => { setView('contacts'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  Contacts
                </button>
                <button
                  onClick={() => { setView('devices'); closeMenus(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)] transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Linked Devices
                </button>
                {onLogout && (
                  <>
                    <div className="h-px bg-[var(--nb-divider)] my-2" />
                    <button
                      onClick={() => { closeMenus(); onLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-[var(--nb-danger)] hover:bg-[var(--nb-surface-2)] transition-all"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Logout
                    </button>
                  </>
                )}
  </>);

  // ── Mic: record + send a voice note, the same way WhatsApp's own mic works ──
  const pickRecorderMimeType = (): string => {
    const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return '';
  };

  const startRecording = async () => {
    if (!selectedPhone) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
        const finalType = mr.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        if (blob.size > 0) sendRecordedAudio(blob, finalType);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = window.setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (e) {
      alert('Microphone permission was not granted. Please allow it in your browser settings.');
    }
  };

  const cancelRecording = () => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const mr = mediaRecorderRef.current;
      mr.onstop = () => { mr.stream?.getTracks().forEach(t => t.stop()); };
      mr.stop();
    }
    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // WhatsApp Cloud API only reliably delivers audio messages in mp3/mpeg, aac, mp4,
  // amr, or ogg(opus) — NOT the webm/opus container most desktop browsers' MediaRecorder
  // actually produces. Sending webm silently gets accepted by the API call but then
  // fails delivery to the customer. Fix: decode whatever the browser recorded (Web Audio
  // API decoding is universally supported regardless of recording format) and re-encode
  // to MP3 with the lamejs encoder already used server-side for the TTS pipeline.
  const blobToMp3 = async (blob: Blob): Promise<Blob> => {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const samples = audioBuffer.getChannelData(0);
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const encoder = new (lamejs as any).Mp3Encoder(1, audioBuffer.sampleRate, 96);
      const blockSize = 1152;
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < pcm.length; i += blockSize) {
        const buf = encoder.encodeBuffer(pcm.subarray(i, i + blockSize));
        if (buf.length > 0) chunks.push(buf);
      }
      const finalBuf = encoder.flush();
      if (finalBuf.length > 0) chunks.push(finalBuf);
      return new Blob(chunks, { type: 'audio/mpeg' });
    } finally {
      audioCtx.close();
    }
  };

  const sendRecordedAudio = async (blob: Blob, mimeType: string) => {
    if (!selectedPhone) return;
    setUploading(true);
    // Show the bubble immediately with a local blob preview + spinner, instead
    // of waiting for the R2 upload to finish — matches WhatsApp's own
    // "uploading" bubble state rather than the message popping in only once sent.
    const tempId = `temp-${Date.now()}`;
    const localPreviewUrl = URL.createObjectURL(blob);
    const optimistic: WAMessage = {
      id: tempId, manager_id: managerId, customer_phone: selectedPhone,
      direction: 'out', type: 'audio', content: null, media_url: localPreviewUrl,
      flagged_payment_proof: false, is_read: true, status: 'uploading', created_at: new Date().toISOString(),
    };
    setThread(prev => [...prev, optimistic]);
    try {
      let outBlob = blob;
      let ext = 'mp3';
      let outMime = 'audio/mpeg';
      try {
        outBlob = await blobToMp3(blob);
      } catch (e: any) {
        console.error('[WABotInbox] mp3 transcode failed, sending original recording', e?.message);
        ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        outMime = mimeType;
        outBlob = blob;
      }
      const path = `admin-voice/${Date.now()}.${ext}`;
      const mediaUrl = await uploadMediaToR2(path, outBlob, outMime);
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, content: mediaUrl, media_url: mediaUrl, status: 'sent' } : m));
      const res = await fetch('/api/wabot-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ to: `92${selectedPhone}`, managerId, type: 'audio', mediaUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        alert(`Voice message was not sent: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      alert('Voice message upload failed: ' + (e?.message || ''));
    } finally {
      setUploading(false);
      loadOverview();
    }
  };

  // ── Gallery: share a photo, video, or document straight from the chat ──
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedPhone) return;
    setUploading(true);
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const sendType: 'image' | 'video' | 'document' = isImage ? 'image' : isVideo ? 'video' : 'document';
    const tempId = `temp-${Date.now()}`;
    const localPreviewUrl = URL.createObjectURL(file);
    const optimistic: WAMessage = {
      id: tempId, manager_id: managerId, customer_phone: selectedPhone,
      direction: 'out', type: sendType, content: null, media_url: localPreviewUrl,
      flagged_payment_proof: false, is_read: true, status: 'uploading', created_at: new Date().toISOString(),
    };
    setThread(prev => [...prev, optimistic]);
    try {
      const folder = isImage ? 'admin-images' : isVideo ? 'admin-videos' : 'admin-documents';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${folder}/${Date.now()}-${safeName}`;
      const mediaUrl = await uploadMediaToR2(path, file, file.type || 'application/octet-stream');
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, content: mediaUrl, media_url: mediaUrl, status: 'sent' } : m));
      const res = await fetch('/api/wabot-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ to: `92${selectedPhone}`, managerId, type: sendType, mediaUrl, filename: sendType === 'document' ? file.name : undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        alert(`File was not sent: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      alert('File upload failed: ' + (e?.message || ''));
    } finally {
      setUploading(false);
      loadOverview();
    }
  };

  const saveBotName = () => {
    const name = botNameInput.trim() || 'NetBot';
    setBotNameInput(name);
    setEditingBotName(false);
    onUpdateBotName?.(name);
    showSaveToast('Bot name saved');
  };

  // Lets the manager give a contact a friendlier label in the thread list — purely a
  // local display override (stored in whatsapp_configs.contact_names), it never touches
  // the actual customer record's name.
  const saveContactName = async () => {
    if (!selectedPhone) return;
    const trimmed = contactNameInput.trim();
    const next = { ...contactNames };
    if (trimmed) next[selectedPhone] = trimmed; else delete next[selectedPhone];
    setContactNames(next);
    setEditingContactName(false);
    try {
      await supabase
        .from('whatsapp_configs')
        .update({ contact_names: next })
        .eq('manager_id', managerId);
      showSaveToast('Name saved');
    } catch (e) {
      console.error('[WABotInbox] saveContactName', e);
    }
  };

  // ── Silk tool rail (desktop, proposal §9): 64px persistent nav on md+ screens.
  // Icon-button helper: 44px target, tooltip via title, accent-soft active state. ──
  const railBtn = (
    key: string,
    title: string,
    active: boolean,
    onClick: () => void,
    iconPath: string,
    badge?: number,
  ) => (
    <button
      key={key}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-[0.97] ${
        active
          ? 'bg-[var(--nb-accent-soft)] text-[var(--nb-accent)]'
          : 'text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-2)]'
      }`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath} />
      </svg>
      {badge != null && badge > 0 && (
        <span className="absolute top-0.5 right-0.5 bg-[var(--nb-warning)] text-white text-[9px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-[var(--nb-text-3)] font-bold">
        Loading conversations...
      </div>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row h-full min-h-[520px] rounded-2xl overflow-hidden shadow-sm"
      style={{ background: wabotDark ? '#0C1317' : '#F0F2F5' }}
    >
      {/* ── Silk tool rail (desktop, proposal §9): persistent nav on md+ screens.
          Mobile (<md) keeps the existing single-pane header + ⋮ menu. ── */}
      <div className="hidden md:flex flex-col items-center w-16 flex-shrink-0 bg-[var(--nb-surface-1)] border-r border-[var(--nb-divider)] py-3 gap-1">
        {/* ── Pinned rail items (user-customizable, persisted) ── */}
        {railPins.map(k => {
          const meta = ALL_RAIL_VIEWS.find(v => v.key === k)!;
          return railBtn(meta.key, meta.label, view === meta.key, () => setView(meta.key), meta.icon, meta.key === 'training' ? unreviewedCount : undefined);
        })}
        {/* ── "+" — pin views to the rail ── */}
        <button
          type="button"
          title="Customize rail"
          aria-label="Customize rail"
          onClick={() => setPinSheetOpen(true)}
          className="w-11 h-11 flex items-center justify-center rounded-full border border-dashed border-[var(--nb-border)] text-[var(--nb-text-2)] hover:text-[var(--nb-accent)] hover:border-[var(--nb-accent)] transition-all active:scale-[0.97]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
        <div className="mt-auto relative w-full flex justify-center">
          <button
            type="button"
            title="More"
            aria-label="More"
            onClick={() => setRailMenuOpen(o => !o)}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-2)] transition-all active:scale-[0.97]"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
          </button>
          {railMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRailMenuOpen(false)} />
              <div style={{ maxHeight: '70dvh', overflowY: 'auto' }} className="absolute left-full bottom-0 ml-2 z-50 w-64 bg-[var(--nb-surface-3)] border border-[var(--nb-border)] rounded-xl shadow-lg py-2">
                {renderMenuItems()}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Inner content column: carries the previous outer padding/gap */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3 p-3 overflow-hidden">
      {!isOnline && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-warning)] text-[var(--nb-warning)] text-xs font-bold">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" /></svg>
          You're offline - new messages will appear when you reconnect.
        </div>
      )}
      {reconnecting && isOnline && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-warning)] text-[var(--nb-warning)] text-xs font-bold">
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Reconnecting&hellip; fetching the latest messages.
        </div>
      )}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--nb-accent)] text-white text-sm font-bold shadow-lg">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
          {saveToast}
        </div>
      )}
      {/* ── Header — single line like Android's "Wabot BillCollector" bar, with
          Training/Catalog/Templates/Agents & Voice + Bot Name tucked behind a
          ⋮ menu instead of always-visible tab buttons (matches Wabot-Android's
          HeaderMenu.tsx) — a back button replaces it on non-inbox screens. ── */}
      {view === 'inbox' ? (
        <div className="flex gap-2 flex-shrink-0 items-center justify-between relative">
          <h3 className="text-base font-black text-black dark:text-white uppercase tracking-tight truncate">NetBot</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedConv && (
              <>
                <button
                  onClick={togglePause}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedConv.paused ? 'bg-[#00A884] text-white' : 'bg-amber-500 text-white'}`}
                >
                  {selectedConv.paused ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" /></svg>
                  )}
                  {selectedConv.paused ? 'Resume' : 'Pause'}
                </button>
              </>
            )}
            <button
              onClick={() => setMenuOpen(o => !o)}
              title="Settings"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] border border-[var(--nb-border)] active:scale-[0.97] transition-all relative md:hidden"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
              {unreviewedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[var(--nb-warning)] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{unreviewedCount}</span>
              )}
            </button>
          </div>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div style={{ maxHeight: '70dvh', overflowY: 'auto' }} className="absolute top-11 right-0 z-50 w-64 bg-[var(--nb-surface-3)] border border-[var(--nb-border)] rounded-xl shadow-lg py-2">
                {renderMenuItems()}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setView('inbox')}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] border border-[var(--nb-border)] active:scale-[0.97] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-base font-black text-[var(--nb-text-1)] uppercase tracking-tight">
            {view === 'teach' ? 'Teach NetBot' : view === 'training' ? 'Training' : view === 'catalog' ? 'Router Catalog' : view === 'templates' ? 'Bot Templates' : view === 'topup' ? 'Topup' : view === 'updates' ? 'NetBot System Updates & Changelog' : view === 'contacts' ? 'Contacts' : view === 'recovery' ? 'Pending Recoveries' : view === 'customization' ? 'Customization' : view === 'devices' ? 'Linked Devices' : view === 'settings' ? 'Settings' : view === 'help' ? 'Help & Support' : view === 'outages' ? 'Network Outages' : view === 'copilot' ? 'Copilot' : 'Voice & Agents'}
          </h3>
        </div>
      )}

      {view === 'teach' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Teach NetBot</h3>
            <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">Teach the bot its overall tone for public dealing and how to handle specific situations here. This guidance is used as a reference in AI replies; the system safeguards for payment numbers, activation and renewal always take priority.</p>
          </div>

          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-accent-soft)] mb-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-black text-[var(--nb-text-1)]">Persona &amp; public dealing</h4>
                <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-1">Example: first acknowledge what the customer says, do not offer the catalog too quickly, and hand off to Mahad bhai / the team when needed.</p>
              </div>
              <button onClick={savePersonaNotes} className="px-3 min-h-[44px] bg-[var(--nb-accent)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
            </div>
            <textarea value={personaDraft} onChange={e => setPersonaDraft(e.target.value)} rows={5} placeholder="How should the bot generally speak and deal with customers?" className="w-full p-3 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)]" />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-black text-[var(--nb-text-1)]">Situation rules</h4>
                <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-1">Write the customer's situation and the preferred handling. The bot will treat this as support guidance, not a sales shortcut.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)]">{(botBehaviorRules || []).length} rules</span>
            </div>
            <div className="space-y-3 mb-5">
              {(botBehaviorRules || []).map(rule => (
                <div key={rule.id} className={`p-4 rounded-2xl border ${rule.active ? 'border-[var(--nb-border)] bg-[var(--nb-surface-2)]' : 'border-[var(--nb-border)] opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-accent)] mb-1">When this happens</p>
                      <p className="text-sm font-black text-[var(--nb-text-1)] whitespace-pre-wrap">{rule.trigger}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)] mt-3 mb-1">Handle it like this</p>
                      <p className="text-sm text-[var(--nb-text-2)] font-semibold whitespace-pre-wrap">{rule.response}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => toggleBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)]">{rule.active ? 'Pause' : 'Use'}</button>
                      <button onClick={() => deleteBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-[var(--nb-surface-2)] text-[var(--nb-danger)] text-[10px] font-black uppercase tracking-widest">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {(botBehaviorRules || []).length === 0 && <p className="text-sm text-[var(--nb-text-3)] font-bold py-4">No custom rules yet. Add your first rule below.</p>}
            </div>
            <div className="p-4 rounded-2xl border border-dashed border-[var(--nb-border)]">
              <h4 className="text-sm font-black text-[var(--nb-text-1)] mb-3">Add a rule</h4>
              <input value={ruleDraft.trigger} onChange={e => setRuleDraft(prev => ({ ...prev, trigger: e.target.value }))} placeholder="Situation: e.g. customer says the router is faulty and wants it fixed tomorrow" className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] mb-2" />
              <textarea value={ruleDraft.response} onChange={e => setRuleDraft(prev => ({ ...prev, response: e.target.value }))} rows={3} placeholder="Preferred handling: acknowledge the fault first, do not send the catalog, note a team visit" className="w-full p-3 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)]" />
              <button onClick={addBehaviorRule} className="mt-3 px-4 py-2.5 min-h-[44px] bg-[var(--nb-accent)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Add Rule</button>
            </div>
          </section>
        </div>
      ) : view === 'training' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-5">
            <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Confused Replies / Training</h3>
            <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">When the bot has no deterministic reply, it answers with AI and the reply is logged here. "Approve" a good reply — the same wording will be reused next time.</p>
          </div>

          {knowledgeLoading ? (
            <p className="text-sm text-[var(--nb-text-3)] font-bold text-center py-10">Loading...</p>
          ) : knowledge.length === 0 ? (
            <p className="text-sm text-[var(--nb-text-3)] font-bold text-center py-10">No training entries yet.</p>
          ) : (
            <div className="space-y-4">
              {knowledge.map(k => {
                const isUnreviewed = k.tags?.includes('unreviewed');
                const isEditing = editingId === k.id;
                return (
                  <div key={k.id} className={`p-5 rounded-2xl border ${isUnreviewed ? 'border-[var(--nb-warning)] bg-[var(--nb-surface-2)]' : 'border-[var(--nb-accent)] bg-[var(--nb-accent-soft)] dark:bg-[var(--nb-accent-soft)]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isUnreviewed ? 'bg-[var(--nb-warning)] text-white' : 'bg-[var(--nb-accent)] text-white'}`}>
                        {isUnreviewed ? 'Unreviewed' : 'Approved'}
                      </span>
                      <span className="text-[10px] text-[var(--nb-text-3)] font-bold">{timeAgo(k.created_at)}</span>
                    </div>
                    <p className="text-sm font-black text-[var(--nb-text-1)] mb-1">Q: {k.question}</p>
                    {isEditing ? (
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={3}
                        className="w-full mt-2 p-3 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)]"
                      />
                    ) : (
                      <p className="text-sm text-[var(--nb-text-2)] font-semibold whitespace-pre-wrap">A: {k.answer}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {isEditing ? (
                        <>
                          <button onClick={() => approveKnowledge(k, editText)} className="px-4 py-2 bg-[var(--nb-accent)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Save & Approve</button>
                          <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                        </>
                      ) : (
                        <>
                          {isUnreviewed ? (
                            <>
                              <button onClick={() => approveKnowledge(k, k.answer)} className="px-4 py-2 bg-[var(--nb-accent)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Approve As-Is</button>
                              <button onClick={() => { setEditingId(k.id); setEditText(k.answer); }} className="px-4 py-2 bg-[var(--nb-accent)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Edit & Approve</button>
                            </>
                          ) : (
                            <button onClick={() => revertKnowledge(k.id)} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Unapprove</button>
                          )}
                          <button onClick={() => deleteKnowledge(k.id)} className="px-4 py-2 bg-[var(--nb-surface-2)] text-[var(--nb-danger)] rounded-xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" /></svg>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : view === 'catalog' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-5">
            <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Router Catalog</h3>
            <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">Edit router models, prices, specs and images here — NetBot shows this same catalog on WhatsApp, so no code changes are needed.</p>
          </div>

          {(['2.4g', '5g'] as const).map(band => (
            <div key={band} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-black text-[var(--nb-text-1)] uppercase tracking-widest">{band === '2.4g' ? '2.4G Routers' : '5G Routers'}</h4>
                <button
                  onClick={() => openAddRouter(band)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--nb-accent)] text-white rounded-lg font-black text-[10px] uppercase tracking-widest"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {catalogState[band].length === 0 ? (
                  <p className="text-xs text-[var(--nb-text-3)] font-bold py-4">No routers in this band.</p>
                ) : (
                  catalogState[band].map(r => (
                    <div key={r.id} className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)] flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-[var(--nb-text-1)] truncate">{r.model} <span className="text-[var(--nb-text-3)] font-bold">— {r.company}</span></p>
                        <p className="text-xs text-[var(--nb-text-3)] font-bold mt-0.5">{r.band} · Rs. {r.price.toLocaleString()}</p>
                      </div>
                      <button onClick={() => openEditRouter(band, r)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--nb-accent-soft)] text-[var(--nb-accent)]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteRouter(band, r.id)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--nb-surface-2)] text-[var(--nb-danger)]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {catalogModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nb-scrim)] p-4">
              <div className="bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 className="text-base font-black text-[var(--nb-text-1)] mb-4">{catalogModal.item ? 'Edit Router' : 'Add New Router'} — {catalogModal.band === '2.4g' ? '2.4G' : '5G'}</h3>
                <div className="space-y-3">
                  <input placeholder="Model (e.g. GS3101)" value={catalogForm.model} onChange={e => setCatalogForm(f => ({ ...f, model: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                  <input placeholder="Company (e.g. Huawei)" value={catalogForm.company} onChange={e => setCatalogForm(f => ({ ...f, company: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                  <input placeholder="Band label (e.g. 2.4GHz Single Band)" value={catalogForm.band} onChange={e => setCatalogForm(f => ({ ...f, band: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                  <input placeholder="Price (Rs.)" type="number" value={catalogForm.price} onChange={e => setCatalogForm(f => ({ ...f, price: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                  <input placeholder="Image URL" value={catalogForm.image} onChange={e => setCatalogForm(f => ({ ...f, image: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                  <textarea placeholder="Specs — this exact text is sent to the customer on WhatsApp" rows={7} value={catalogForm.specs} onChange={e => setCatalogForm(f => ({ ...f, specs: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]" />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={saveCatalogModal} className="flex-1 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">Save</button>
                  <button onClick={() => setCatalogModal(null)} className="px-4 py-2.5 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'templates' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Reply Templates</h3>
              <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">Edit the wording of every NetBot reply here — no code deploy needed. Do not remove the {'{curly_braces}'} tokens; they are filled with the customer's name/amount/etc.</p>
            </div>
            <button
              onClick={() => setShowAddTemplateModal(true)}
              className="flex-shrink-0 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              + New
            </button>
          </div>

          {orderedCategories.length === 0 ? (
            <p className="text-xs text-[var(--nb-text-3)] font-bold py-6">Templates are loading — if this message stays, refresh the app once.</p>
          ) : (
            orderedCategories.map(category => (
              <div key={category} className="mb-4">
                <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between mb-2 py-1">
                  <h4 className="text-sm font-black text-[var(--nb-text-1)] uppercase tracking-widest">{category}</h4>
                  <svg className={`w-4 h-4 text-[var(--nb-text-3)] transition-transform ${expandedCategories.has(category) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="space-y-2">
                    {templatesByCategory[category].map(([key, item]) => (
                      <div key={key} className="rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)] p-3">
                        <button onClick={() => openTemplateEdit(key)} className="w-full flex items-center justify-between gap-2 text-left">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-[var(--nb-text-1)] truncate">{item.label}</span>
                            {isEditedBotTemplate(key) && (
                              <span className="flex-shrink-0 text-[9px] bg-[var(--nb-surface-2)] text-[var(--nb-warning)] border border-[var(--nb-warning)] px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">Edited</span>
                            )}
                          </span>
                          <svg className="w-4 h-4 flex-shrink-0 text-[var(--nb-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {editingTemplateKey === key && (
                          <div className="mt-3">
                            <textarea
                              rows={Math.min(12, Math.max(3, templateDraft.split('\n').length + 1))}
                              value={templateDraft}
                              onChange={e => setTemplateDraft(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)]"
                            />
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <button onClick={() => saveTemplateEdit(key)} className="flex-1 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                              <button onClick={() => setEditingTemplateKey(null)} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                              {isEditedBotTemplate(key) && !isCustomBotTemplate(key) && (
                                <button onClick={() => resetBotTemplateToDefault(key)} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Reset</button>
                              )}
                              {isCustomBotTemplate(key) && (
                                <button onClick={() => deleteCustomBotTemplate(key)} className="px-4 py-2 bg-[var(--nb-surface-2)] hover:bg-[var(--nb-surface-3)] text-[var(--nb-danger)] border border-[var(--nb-danger)] rounded-xl font-black text-[10px] uppercase tracking-widest">Delete</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {showAddTemplateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nb-scrim)] p-4">
              <div className="bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 className="text-base font-black text-[var(--nb-text-1)] mb-4">New Template</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Key (unique, no spaces)</label>
                    <input
                      value={newBotTemplate.key}
                      onChange={e => setNewBotTemplate(f => ({ ...f, key: e.target.value }))}
                      placeholder="e.g. installation_followup"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Label</label>
                    <input
                      value={newBotTemplate.label}
                      onChange={e => setNewBotTemplate(f => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Installation Follow-up"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Category</label>
                    <select
                      value={newBotTemplate.category}
                      onChange={e => setNewBotTemplate(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                    >
                      {[...templateCategoryOrder, 'General'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Message Text</label>
                    <textarea
                      rows={6}
                      value={newBotTemplate.text}
                      onChange={e => setNewBotTemplate(f => ({ ...f, text: e.target.value }))}
                      placeholder="Type here... use placeholders like {name}, {businessName}"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                    <p className="text-[10px] text-[var(--nb-text-3)] font-semibold mt-1.5">
                      Note: this new template will not link itself to any bot reply — it is only saved for reference until a developer wires it in webhook.ts.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={handleAddBotTemplate} className="flex-1 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">Create</button>
                  <button onClick={() => { setShowAddTemplateModal(false); setNewBotTemplate({ key: '', label: '', category: 'General', text: '' }); }} className="px-4 py-2.5 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'agents' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          {/* ── Default Voice ── */}
          <div className="mb-8">
            <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Default Voice</h3>
            <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1 mb-4">This voice is used when no specific agent matches. Listen to each voice, then pick one.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <select
                value={selectedVoice}
                onChange={e => saveDefaultVoice(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                ))}
              </select>
              <button
                onClick={() => playVoicePreview(selectedVoice)}
                disabled={previewingVoice === selectedVoice}
                className="flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {previewingVoice === selectedVoice ? 'Loading...' : 'Preview'}
              </button>
            </div>
            {previewError && <p className="text-[11px] text-[var(--nb-danger)] font-bold">{previewError}</p>}
            {previewConfirm && <p className="text-[11px] text-[var(--nb-accent)] font-bold">{previewConfirm}</p>}
          </div>

          {/* ── Support Agents ── */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Support Agents</h3>
              <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">You can create up to 10 agents (e.g. NetBot=billing, Bilal=technical). If a keyword in the customer's message matches, that agent replies with its own name, scope, purpose, TTS provider, gender and voice — if nothing matches, the Default Voice / Bot Name is used. You can test each agent's own TTS provider (Gemini/Azure/Edge-TTS).</p>
            </div>
            <button
              onClick={startNewAgent}
              className="flex-shrink-0 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              + New Agent
            </button>
          </div>

          {(!wabotAgents || wabotAgents.length === 0) && editingAgentId === null && (
            <p className="text-xs text-[var(--nb-text-3)] font-bold py-4">No extra agents created yet — only the single Default Voice persona is active. Create your first specialized agent with "+ New Agent".</p>
          )}

          <div className="space-y-3">
            {(wabotAgents || []).map(agent => (
              <div key={agent.id} className="rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)] p-4">
                {editingAgentId === agent.id && agentDraft ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Agent Name</label>
                      <input
                        value={agentDraft.name}
                        onChange={e => setAgentDraft(d => d ? { ...d, name: e.target.value } : d)}
                        placeholder="e.g. Bilal"
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Specialization Scope</label>
                      <textarea
                        rows={3}
                        value={agentDraft.scope}
                        onChange={e => setAgentDraft(d => d ? { ...d, scope: e.target.value } : d)}
                        placeholder="e.g. Only handles technical/connection issues (net slow, router, disconnect) — does not answer billing/payment questions"
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Routing Keywords (comma se separate)</label>
                      <input
                        value={agentDraft.keywords.join(', ')}
                        onChange={e => setAgentDraft(d => d ? { ...d, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } : d)}
                        placeholder="e.g. net not working, router, slow, disconnect"
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Voice</label>
                      <div className="flex gap-2">
                        <select
                          value={agentDraft.voice}
                          onChange={e => setAgentDraft(d => d ? { ...d, voice: e.target.value } : d)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                        >
                          {GEMINI_VOICES.map(v => (
                            <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => playVoicePreview(agentDraft.voice)}
                          disabled={previewingVoice === agentDraft.voice}
                          className="flex-shrink-0 flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          {previewingVoice === agentDraft.voice ? '...' : 'Preview'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Purpose</label>
                        <select
                          value={agentDraft.purpose || 'general'}
                          onChange={e => setAgentDraft(d => d ? { ...d, purpose: e.target.value as WABotAgent['purpose'] } : d)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                        >
                          <option value="billing">Billing</option>
                          <option value="complaint">Complaint</option>
                          <option value="new_connection">New Connection</option>
                          <option value="network_qa">Network Q&amp;A</option>
                          <option value="general">General</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Gender</label>
                        <select
                          value={agentDraft.gender || 'female'}
                          onChange={e => setAgentDraft(d => d ? { ...d, gender: e.target.value as WABotAgent['gender'] } : d)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">TTS Provider</label>
                      <div className="flex gap-2">
                        <select
                          value={agentDraft.ttsProvider || 'gemini'}
                          onChange={e => setAgentDraft(d => d ? { ...d, ttsProvider: e.target.value as WABotAgent['ttsProvider'] } : d)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                        >
                          <option value="gemini">Gemini (Roman Urdu native)</option>
                          <option value="azure">Azure (free tier — script-based)</option>
                          <option value="edge">Edge-TTS (unlimited free — script-based)</option>
                        </select>
                        <button
                          onClick={() => playVoicePreview(agentDraft.voice, undefined, agentDraft.ttsProvider, agentDraft.gender)}
                          disabled={previewingVoice === agentDraft.voice}
                          className="flex-shrink-0 flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          {previewingVoice === agentDraft.voice ? '...' : 'Test'}
                        </button>
                      </div>
                      {agentDraft.ttsProvider === 'azure' && (
                        <p className="text-[10px] text-[var(--nb-warning)] font-bold mt-1">If no Azure key is set, this automatically falls back to Edge-TTS (free).</p>
                      )}
                      {previewError && <p className="text-[10px] text-[var(--nb-danger)] font-bold mt-1">{previewError}</p>}
                      {previewConfirm && <p className="text-[10px] text-[var(--nb-accent)] font-bold mt-1">{previewConfirm}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveAgentDraft} className="flex-1 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                      <button onClick={() => { setEditingAgentId(null); setAgentDraft(null); }} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={() => editAgent(agent)} className="min-w-0 text-left flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black text-[var(--nb-text-1)]">{agent.name}</span>
                        <span className="text-[9px] bg-[var(--nb-accent-soft)] text-[var(--nb-accent)] border border-[var(--nb-accent)] px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{agent.voice}</span>
                        <span className="text-[9px] bg-[var(--nb-accent-soft)] text-[var(--nb-accent)] border border-[var(--nb-accent)] px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{agent.ttsProvider || 'gemini'}</span>
                        <span className="text-[9px] bg-[var(--nb-surface-2)] text-[var(--nb-text-3)] border border-[var(--nb-border)] px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{(agent.purpose || 'general').replace('_', ' ')}</span>
                        {!agent.active && (
                          <span className="text-[9px] bg-[var(--nb-surface-2)] text-[var(--nb-text-3)] border border-[var(--nb-border)] px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">Paused</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--nb-text-3)] font-semibold truncate">{agent.scope || 'No scope description'}</p>
                      {agent.keywords.length > 0 && (
                        <p className="text-[10px] text-[var(--nb-text-3)] font-bold mt-1 truncate">Keywords: {agent.keywords.join(', ')}</p>
                      )}
                    </button>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => toggleAgentActive(agent.id)}
                        className="px-3 py-1.5 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-lg font-black text-[10px] uppercase tracking-widest"
                      >
                        {agent.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        className="px-3 py-1.5 bg-[var(--nb-surface-2)] hover:bg-[var(--nb-surface-3)] text-[var(--nb-danger)] border border-[var(--nb-danger)] rounded-lg font-black text-[10px] uppercase tracking-widest"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editingAgentId && agentDraft && !(wabotAgents || []).some(a => a.id === editingAgentId) && (
              <div className="rounded-2xl border border-[var(--nb-accent)] bg-[var(--nb-accent-soft)] p-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Agent Name</label>
                    <input
                      value={agentDraft.name}
                      onChange={e => setAgentDraft(d => d ? { ...d, name: e.target.value } : d)}
                      placeholder="e.g. Bilal"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Specialization Scope</label>
                    <textarea
                      rows={3}
                      value={agentDraft.scope}
                      onChange={e => setAgentDraft(d => d ? { ...d, scope: e.target.value } : d)}
                      placeholder="e.g. Only handles technical/connection issues (net slow, router, disconnect) — does not answer billing/payment questions"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Routing Keywords (comma se separate)</label>
                    <input
                      value={agentDraft.keywords.join(', ')}
                      onChange={e => setAgentDraft(d => d ? { ...d, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } : d)}
                      placeholder="e.g. net not working, router, slow, disconnect"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Voice</label>
                    <div className="flex gap-2">
                      <select
                        value={agentDraft.voice}
                        onChange={e => setAgentDraft(d => d ? { ...d, voice: e.target.value } : d)}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                      >
                        {GEMINI_VOICES.map(v => (
                          <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => playVoicePreview(agentDraft.voice)}
                        disabled={previewingVoice === agentDraft.voice}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        {previewingVoice === agentDraft.voice ? '...' : 'Preview'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Purpose</label>
                      <select
                        value={agentDraft.purpose || 'general'}
                        onChange={e => setAgentDraft(d => d ? { ...d, purpose: e.target.value as WABotAgent['purpose'] } : d)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                      >
                        <option value="billing">Billing</option>
                        <option value="complaint">Complaint</option>
                        <option value="new_connection">New Connection</option>
                        <option value="network_qa">Network Q&amp;A</option>
                        <option value="general">General</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">Gender</label>
                      <select
                        value={agentDraft.gender || 'female'}
                        onChange={e => setAgentDraft(d => d ? { ...d, gender: e.target.value as WABotAgent['gender'] } : d)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--nb-text-2)] block mb-1.5 uppercase tracking-widest">TTS Provider</label>
                    <div className="flex gap-2">
                      <select
                        value={agentDraft.ttsProvider || 'gemini'}
                        onChange={e => setAgentDraft(d => d ? { ...d, ttsProvider: e.target.value as WABotAgent['ttsProvider'] } : d)}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                      >
                        <option value="gemini">Gemini (Roman Urdu native)</option>
                        <option value="azure">Azure (free tier — script-based)</option>
                        <option value="edge">Edge-TTS (unlimited free — script-based)</option>
                      </select>
                      <button
                        onClick={() => playVoicePreview(agentDraft.voice, undefined, agentDraft.ttsProvider, agentDraft.gender)}
                        disabled={previewingVoice === agentDraft.voice}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        {previewingVoice === agentDraft.voice ? '...' : 'Test'}
                      </button>
                    </div>
                    {agentDraft.ttsProvider === 'azure' && (
                      <p className="text-[10px] text-[var(--nb-warning)] font-bold mt-1">If no Azure key is set, this automatically falls back to Edge-TTS (free).</p>
                    )}
                    {previewError && <p className="text-[10px] text-[var(--nb-danger)] font-bold mt-1">{previewError}</p>}
                    {previewConfirm && <p className="text-[10px] text-[var(--nb-accent)] font-bold mt-1">{previewConfirm}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveAgentDraft} className="flex-1 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                    <button onClick={() => { setEditingAgentId(null); setAgentDraft(null); }} className="px-4 py-2 bg-[var(--nb-surface-3)] text-[var(--nb-text-2)] rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : view === 'topup' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">Message Quota</h3>
            <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">NetBot usage for the current billing cycle — text and voice replies are tracked separately.</p>
          </div>

          {quotaLoading ? (
            <p className="text-xs text-[var(--nb-text-3)] font-bold py-6 text-center">Loading...</p>
          ) : quotaError ? (
            <p className="text-xs text-[var(--nb-danger)] font-bold py-6 text-center">{quotaError}</p>
          ) : quota ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-accent-soft)] p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)]">Plan</span>
                  {quota.serviceStatus && quota.serviceStatus !== 'active' && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[var(--nb-surface-2)] text-[var(--nb-danger)]">{quota.serviceStatus}</span>
                  )}
                </div>
                <p className="text-sm font-black text-[var(--nb-text-1)] capitalize">{(quota.planType || 'unknown').replace('_', ' ')}</p>
                {quota.cycleEndDate && (
                  <p className="text-[11px] text-[var(--nb-text-3)] font-bold mt-1">Cycle ends: {quota.cycleEndDate}</p>
                )}
              </div>

              <QuotaBar label="Text Messages" used={quota.textUsed} limit={quota.textQuota} />
              {quota.voiceQuota > 0 ? (
                <QuotaBar label="Voice Replies" used={quota.voiceUsed} limit={quota.voiceQuota} />
              ) : (
                <div className="rounded-2xl border border-[var(--nb-border)] p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)]">Voice Replies</span>
                  <p className="text-xs text-[var(--nb-text-3)] font-bold mt-1">Voice replies are not included in this plan.</p>
                </div>
              )}

              <a
                href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent('Hello, I need NetBot credits/topup or plan upgrade.')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 004.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2z" /></svg>
                Request Topup / Upgrade
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--nb-text-3)] font-bold py-6 text-center">No quota data found.</p>
          )}
        </div>
      ) : view === 'updates' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="flex items-center justify-between border-b border-[var(--nb-border)] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[var(--nb-text-1)] uppercase tracking-tight">NetBot System Updates &amp; Changelog</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--nb-accent-soft)] text-[var(--nb-accent)] font-black text-[10px] uppercase tracking-wider">Live</span>
              </div>
              <p className="text-xs text-[var(--nb-text-2)] font-semibold mt-1">
                New features, UI improvements and performance updates for the NetBot and WABot inbox are tracked here.
              </p>
            </div>
            <button
              onClick={() => setView('inbox')}
              className="px-3.5 py-2 rounded-xl bg-[var(--nb-accent)] text-white font-bold text-xs uppercase tracking-wider hover:bg-[var(--nb-accent-pressed)] transition-all flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Open Inbox
            </button>
          </div>

          <div className="space-y-6">
            {CHANGELOG_ITEMS.map((release) => (
              <div key={release.version} className="relative pl-6 border-l-2 border-[var(--nb-accent)] space-y-3">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[var(--nb-accent)] border-2 border-[var(--nb-surface-1)]" />
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-black text-sm text-[var(--nb-accent)]">{release.version}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider text-white ${release.badgeColor}`}>
                    {release.badge}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--nb-text-2)]">{release.date}</span>
                </div>
                <h4 className="text-base font-bold text-[var(--nb-text-1)]">{release.title}</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {release.features.map((feat, fIdx) => (
                    <div key={fIdx} className="p-3.5 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[var(--nb-surface-1)] text-[var(--nb-accent)] border border-[var(--nb-border)]">
                          {feat.tag}
                        </span>
                        <h5 className="text-xs font-bold text-[var(--nb-text-1)] truncate">{feat.title}</h5>
                      </div>
                      <p className="text-[11px] text-[var(--nb-text-2)] leading-relaxed font-medium">
                        {feat.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : view === 'settings' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-3">Business / Bot Name</h4>
            {editingBotName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={botNameInput}
                  onChange={e => setBotNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBotName()}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
                />
                <button onClick={saveBotName} className="px-4 py-2.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
              </div>
            ) : (
              <button onClick={() => setEditingBotName(true)} className="flex items-center gap-1.5 text-sm font-black text-[var(--nb-text-1)]">
                {botNameInput}
                <svg className="w-3.5 h-3.5 text-[var(--nb-text-3)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </section>

          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-1">Business Profile</h4>
            <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mb-2">Used in payment details, templates and quick replies. Stored in your settings — never hardcoded.</p>
            <BusinessProfileField label="Business name" value={identity.businessName} placeholder="e.g. Your Business" onSave={v => onUpdateBusinessProfile?.({ businessName: v })} />
            <BusinessProfileField label="Support number" value={identity.supportNumber} placeholder="e.g. 0300-1234567" onSave={v => onUpdateBusinessProfile?.({ supportNumber: v })} />
            <BusinessProfileField label="Bank name" value={identity.bankName} placeholder="e.g. Your Bank" onSave={v => onUpdateBusinessProfile?.({ bankName: v })} />
            <BusinessProfileField label="Bank account number" value={identity.bankAccountNo} placeholder="e.g. 01234567890123" onSave={v => onUpdateBusinessProfile?.({ bankAccountNo: v })} />
            <BusinessProfileField label="Bank IBAN" value={identity.bankIban} placeholder="e.g. PK00BANK00000000000000" onSave={v => onUpdateBusinessProfile?.({ bankIban: v })} />
            <BusinessProfileField label="JazzCash number" value={identity.jazzcashNo} placeholder="e.g. 03009876543" onSave={v => onUpdateBusinessProfile?.({ jazzcashNo: v })} />
            <BusinessProfileField label="EasyPaisa number" value={identity.easypaisaNo} placeholder="e.g. 03009876543" onSave={v => onUpdateBusinessProfile?.({ easypaisaNo: v })} />
            <BusinessProfileField label="Support email" value={identity.supportEmail} placeholder="e.g. support@example.com" onSave={v => onUpdateBusinessProfile?.({ supportEmail: v })} />
            <BusinessProfileField label="Support phone" value={identity.supportPhone} placeholder="e.g. +92 300 1234567" onSave={v => onUpdateBusinessProfile?.({ supportPhone: v })} />
            <BusinessProfileField label="Support WhatsApp (digits)" value={identity.supportWhatsApp} placeholder="e.g. 923001234567" onSave={v => onUpdateBusinessProfile?.({ supportWhatsApp: v })} />
          </section>

          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)]">Theme</h4>
                <p className="text-sm font-black text-[var(--nb-text-1)] mt-1">{wabotDark ? 'Dark' : 'Light'}</p>
              </div>
              <button
                onClick={toggleWabotTheme}
                title={wabotDark ? 'Light mode' : 'Dark mode'}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] border border-[var(--nb-border)] active:scale-95 transition-all"
              >
                {wabotDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>
                )}
              </button>
            </div>
          </section>

          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-3">TTS Voice</h4>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedVoice}
                onChange={e => saveDefaultVoice(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                ))}
              </select>
              <button
                onClick={() => playVoicePreview(selectedVoice)}
                disabled={previewingVoice === selectedVoice}
                className="flex items-center gap-1.5 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {previewingVoice === selectedVoice ? 'Loading...' : 'Preview'}
              </button>
            </div>
            {previewError && <p className="text-[11px] text-[var(--nb-danger)] font-bold mt-2">{previewError}</p>}
            {previewConfirm && <p className="text-[11px] text-[var(--nb-accent)] font-bold mt-2">{previewConfirm}</p>}
          </section>

                    <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-1">Linked devices</h4>
            <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mb-3">See every browser logged into NetBot Web, or log one out remotely.</p>
            <button
              onClick={() => setView('devices')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white font-black text-[11px] uppercase tracking-widest transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Manage linked devices
            </button>
          </section>

          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] mb-1">Manager account</h4>
            <p className="text-sm font-black text-[var(--nb-text-1)] break-all">{managerId || '—'}</p>
          </section>
        </div>
      ) : view === 'help' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <p className="text-xs font-bold text-[var(--nb-text-2)]">Common NetBot questions, and how to reach support.</p>
          {[
            { q: 'How do I link NetBot Web?', a: 'Open NetBot Web on your computer and show the QR code. In the Android app go to App Settings → Link a Device and scan it — the web session logs into the same account.' },
            { q: 'How do I log out a computer remotely?', a: 'In the Android app go to App Settings → Link a Device. Every linked session shows its browser, OS and last-active time. Tap Log out.' },
            { q: 'The bot is still auto-replying after I sent a manual message.', a: 'A manual message pauses that chat. Use Resume on the thread to re-enable auto-replies.' },
            { q: 'How do I change the bot name or voice?', a: 'The bot name is in Settings. The default TTS voice and extra agents are under the Voice & Agents menu item.' },
            { q: 'What if I lose my password?', a: `Contact ${supportEmail} / WhatsApp ${supportPhone} and we will help you recover access.` },
          ].map((item, i) => {
            const open = helpFaqOpen === i;
            return (
              <button
                key={item.q}
                onClick={() => setHelpFaqOpen(open ? null : i)}
                className="w-full text-left p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-[var(--nb-text-1)]">{item.q}</span>
                  <svg className={`w-4 h-4 flex-shrink-0 text-[var(--nb-text-3)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {open && <p className="text-sm text-[var(--nb-text-2)] font-semibold mt-2">{item.a}</p>}
              </button>
            );
          })}
          <section className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)] space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)]">Contact support</h4>
            <p className="text-sm font-black text-[var(--nb-text-1)]">{supportEmail}</p>
            <a
              href={`mailto:${supportEmail}`}
              className="flex items-center justify-center gap-2 bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Email support
            </a>
            <a
              href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent('Hello, I need help with NetBot.')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 border border-[var(--nb-accent)] text-[var(--nb-accent)] px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all hover:bg-[var(--nb-accent)]/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 004.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2z" /></svg>
              WhatsApp {supportPhone}
            </a>
          </section>
        </div>
      ) : view === 'copilot' ? (
        <div className="flex-1 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-hidden min-h-0">
          <CopilotTab
            users={customers || []}
            history={copilotHistory}
            onHistoryChange={onCopilotHistoryChange}
            onOpenTab={handleCopilotOpenTab}
            onPrepareReceipt={() => { /* standalone NetBot has no receipt flow (removed Phase 3); required by shared hook */ }}
          />
        </div>
      ) : view === 'outages' ? (
        <OutageTracker
          outageLogs={outageLogs || []}
          currentUser={managerId}
          totalUsers={totalUsers || 0}
          onAdd={(log) => onUpdateOutageLogs?.([...(outageLogs || []), log])}
          onUpdate={(id, updates) => onUpdateOutageLogs?.((outageLogs || []).map(o => (o.id === id ? { ...o, ...updates } : o)))}
          onDelete={(id) => onUpdateOutageLogs?.((outageLogs || []).filter(o => o.id !== id))}
        />
      ) : view === 'recovery' ? (
        <WABotRecovery managerId={managerId} />
      ) : view === 'customization' ? (
        <WABotCustomization
          themePref={themePref || (wabotDark ? 'dark' : 'light')}
          onThemePrefChange={onThemePrefChange || (() => {})}
          wallpaper={wallpaper}
          onWallpaperChange={changeWallpaper}
          wabotDark={wabotDark}
        />
      ) : view === 'contacts' ? (
        <WABotContacts
          customers={(customers || []).map(c => ({ id: c.id, name: c.name, username: c.username, phone: c.phone }))}
          chatPhones={(conversations || []).map(c => c.phone)}
          onOpenChat={(phone) => { setView('inbox'); openConversation(phone); }}
        />
      ) : view === 'devices' ? (
        <WABotLinkedDevices />
      ) : (
    <div className="flex flex-1 gap-3 min-h-0 overflow-hidden">
      {/* ── Chat list — full width on mobile until a chat is opened, fixed sidebar on desktop ── */}
      <div className={`${selectedPhone ? 'hidden sm:flex' : 'flex'} w-full sm:w-[350px] lg:w-[380px] flex-shrink-0 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] flex-col overflow-hidden`}>
        <div className="p-3 bg-[var(--nb-header)] border-b border-[var(--nb-border)] flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                placeholder="Search conversations"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full min-w-0 pl-3 pr-8 py-1.5 rounded-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-xs font-semibold outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
              />
              {search.length > 0 && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[var(--nb-text-3)] hover:text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-3)] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {/* ── Smart Filter Pills ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 text-[11px] font-bold">
            <button
              onClick={() => setChatFilter('all')}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'all' ? 'bg-[var(--nb-accent)] text-white' : 'bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-3)] border border-[var(--nb-border)]'}`}
            >
              All
              <span className="text-[10px] opacity-80">({filterCounts.all})</span>
            </button>
            <button
              onClick={() => setChatFilter('unread')}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'unread' ? 'bg-[var(--nb-accent)] text-white' : 'bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-3)] border border-[var(--nb-border)]'}`}
            >
              Unread
              {filterCounts.unread > 0 && <span className="bg-[var(--nb-accent)] text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.unread}</span>}
            </button>
            <button
              onClick={() => setChatFilter('proofs')}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'proofs' ? 'bg-[var(--nb-accent)] text-white' : 'bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-3)] border border-[var(--nb-border)]'}`}
            >
              Payment Slips
              {filterCounts.proofs > 0 && <span className="bg-[var(--nb-warning)] text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.proofs}</span>}
            </button>
            <button
              onClick={() => setChatFilter('paused')}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'paused' ? 'bg-[var(--nb-accent)] text-white' : 'bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-3)] border border-[var(--nb-border)]'}`}
            >
              Paused
              {filterCounts.paused > 0 && <span className="bg-[var(--nb-warning)] text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.paused}</span>}
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--nb-divider)] custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-sm text-[var(--nb-text-3)] font-bold">No WhatsApp conversations found.</p>
              {chatFilter !== 'all' && (
                <button onClick={() => setChatFilter('all')} className="mt-2 min-h-[44px] px-2 text-xs text-[var(--nb-accent)] font-bold underline">Show all chats</button>
              )}
            </div>
          ) : (
            filteredConversations.map(c => (
              <button
                key={c.phone}
                onClick={() => openConversation(c.phone)}
                className={`w-full text-left p-3 border-b border-[var(--nb-divider)] flex items-center gap-3 transition-all ${selectedPhone === c.phone ? 'bg-[var(--nb-accent-soft)]' : 'hover:bg-[var(--nb-surface-2)]'}`}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white flex-shrink-0"
                  style={{ backgroundColor: c.paused ? 'var(--nb-warning)' : avatarColor(c.phone) }}
                >
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-sm text-[var(--nb-text-1)] truncate">{c.name}</p>
                    <span className="text-[10px] text-[var(--nb-text-2)] font-bold flex-shrink-0">{timeAgo(c.lastTime)}</span>
                  </div>
                  <p className="text-xs text-[var(--nb-text-2)] font-semibold truncate">
                    {typePreview(c.lastType) || c.lastMessage}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-[var(--nb-accent)] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{c.unreadCount}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Thread — takes over full screen on mobile when a chat is open ── */}
      <div className={`${selectedPhone ? 'flex' : 'hidden sm:flex'} flex-1 bg-[var(--nb-bg)] rounded-2xl border border-[var(--nb-border)] flex-col overflow-hidden min-w-0`}>
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-[var(--nb-text-3)] font-bold">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="p-3.5 bg-[var(--nb-header)] border-b border-[var(--nb-border)] flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 text-[var(--nb-text-2)] flex-shrink-0"
                  aria-label="Back to chat list"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="min-w-0">
                  {editingContactName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={contactNameInput}
                        onChange={e => setContactNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveContactName(); if (e.key === 'Escape') setEditingContactName(false); }}
                        placeholder={selectedConv.name}
                        className="text-sm font-black bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-lg px-2 py-1 outline-none text-[var(--nb-text-1)] w-36"
                      />
                      <button onClick={saveContactName} className="text-[var(--nb-accent)] flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Save">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button onClick={() => setEditingContactName(false)} className="text-[var(--nb-text-2)] flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Cancel">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setContactNameInput(contactNames[selectedConv.phone] || ''); setEditingContactName(true); }}
                      className="flex items-center gap-1.5 group"
                      title="Edit contact name"
                    >
                      <p className="font-black text-sm text-[var(--nb-text-1)] truncate">{selectedConv.name}</p>
                      <svg className="w-3.5 h-3.5 text-[var(--nb-text-3)] group-hover:text-[var(--nb-accent)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  <p className="text-xs text-[var(--nb-text-2)] font-bold truncate">+92{selectedConv.phone}{selectedConv.username ? ` • @${selectedConv.username}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" />
            </div>

            {windowStatus && (
              <div className={`px-3.5 py-2 flex items-center gap-2 flex-shrink-0 text-xs font-bold ${windowStatus.open ? 'bg-[var(--nb-accent-soft)] text-[var(--nb-accent)]' : 'bg-[var(--nb-surface-2)] text-[var(--nb-danger)]'}`}>
                {windowStatus.open ? (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                )}
                <span>
                  {windowStatus.open
                    ? `24h window open — ${formatHoursLeft(windowStatus.hoursLeft)} left to send free-text replies`
                    : '24h window closed — only approved templates can be sent'}
                </span>
              </div>
            )}

            <div ref={threadContainerRef} style={{ backgroundColor: wabotDark ? wallpaperPreset.dark : wallpaperPreset.light }} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5 bg-[var(--nb-bg)] custom-scrollbar">
              {threadError && thread.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--nb-surface-2)] border border-[var(--nb-danger)] flex items-center justify-center">
                    <svg className="w-6 h-6 text-[var(--nb-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <p className="text-sm font-bold text-[var(--nb-text-2)] max-w-xs">{threadError}</p>
                  <button
                    type="button"
                    onClick={() => selectedPhone && openConversation(selectedPhone)}
                    className="px-4 min-h-[44px] rounded-xl bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] text-white text-xs font-black uppercase tracking-widest active:scale-95 transition-all"
                  >
                    Retry
                  </button>
                </div>
              )}
              {threadHasMore && (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="text-[11px] font-black uppercase tracking-widest px-4 min-h-[44px] rounded-full bg-[var(--nb-surface-1)] text-[var(--nb-accent)] border border-[var(--nb-border)] hover:bg-[var(--nb-surface-2)] disabled:opacity-50 transition-all"
                  >
                    {loadingOlder ? 'Loading older messages\u2026' : 'Load older messages'}
                  </button>
                </div>
              )}
              {threadWithDates.map(item => {
                if (item.kind === 'date') {
                  return (
                    <div key={item.key} className="flex justify-center">
                      <span className="text-[11px] font-bold text-[var(--nb-text-2)] bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-lg px-3 py-1">{item.label}</span>
                    </div>
                  );
                }
                const m = item.message;
                const mediaSrc = m.media_url || (m.content?.startsWith('http') ? m.content : null);
                const hasTranslation = !!m.translated_content && m.translated_content !== m.content;
                const isPlaceholderText = m.content === '[voice note — transcription unavailable]';
                return (
                  <div key={item.key} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, msg: m }); }}
                      className={`max-w-[75%] px-3.5 py-2 rounded-xl text-sm font-medium shadow-sm ${m.direction === 'out' ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-br-xs' : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] rounded-bl-xs border border-[#E9EDEF]/40 dark:border-[#222D34]/40'}`}>
                      {m.reply_to_content ? (
                        <div className="mb-1.5 px-2 py-1 rounded-r-lg border-l-[3px] border-[#00A884] bg-black/5 dark:bg-white/5">
                          <p className="text-[10px] font-black text-[#00A884] truncate">{m.reply_to_sender || 'Message'}</p>
                          <p className="text-[11px] opacity-70 truncate">{m.reply_to_content}</p>
                        </div>
                      ) : null}
                      {m.type === 'image' && mediaSrc ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLightboxMedia({ url: mediaSrc, type: 'image', timestamp: m.created_at, sender: selectedConv?.name });
                            setLightboxZoom(1);
                            setLightboxRotate(0);
                          }}
                          className="relative block text-left group cursor-zoom-in"
                          title="Click to zoom / verify payment"
                        >
                          <img src={mediaSrc} alt="attachment" className="rounded-xl max-w-[220px] mb-1 group-hover:opacity-95 transition-all" />
                          {m.status === 'uploading' && <UploadSpinner />}
                          <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                            Zoom
                          </span>
                        </button>
                      ) : m.type === 'video' && mediaSrc ? (
                        <div className="relative">
                          <video controls={m.status !== 'uploading'} src={mediaSrc} className="rounded-xl max-w-[220px] mb-1" />
                          {m.status === 'uploading' && <UploadSpinner />}
                        </div>
                      ) : m.type === 'document' && mediaSrc ? (
                        <a href={mediaSrc} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline mb-1">
                          {m.status === 'uploading' ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} View document
                        </a>
                      ) : m.type === 'audio' || m.type === 'voice' ? (
                        <div>
                          {m.status === 'uploading' ? (
                            <div className="flex items-center gap-2 max-w-[220px] mb-1.5 py-1">
                              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin inline-block opacity-80" />
                              <span className="text-[12px] opacity-80">Uploading voice note…</span>
                            </div>
                          ) : mediaSrc && <audio controls src={mediaSrc} className="max-w-[220px] mb-1.5" />}
                          {m.content && !isPlaceholderText && !m.content.startsWith('http') && (
                            <p className="whitespace-pre-wrap break-words text-[13px] opacity-90">
                              {renderWhatsAppText(showTranslated[m.id] && hasTranslation ? (m.translated_content || '') : m.content)}
                            </p>
                          )}
                          {isPlaceholderText && <p className="whitespace-pre-wrap break-words text-[13px] opacity-70 italic">{m.content}</p>}
                          {hasTranslation && (
                            <button
                              onClick={() => setShowTranslated(p => ({ ...p, [m.id]: !p[m.id] }))}
                              className={`text-[10px] underline mt-0.5 ${m.direction === 'out' ? 'text-white/70' : 'text-[#00A884] dark:text-[#00A884]'}`}
                            >
                              <span className="inline-flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeWidth="2" d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" /></svg>{showTranslated[m.id] ? 'View original' : 'Translate'}</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{renderWhatsAppText(m.content || '')}</p>
                      )}
                      <p className={`text-[10px] mt-1 font-bold flex items-center gap-1 ${m.direction === 'out' ? 'text-[#111B21]/60 dark:text-[#E9EDEF]/60 justify-end' : 'text-[#667781] dark:text-[#8696A0]'}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {m.flagged_payment_proof ? (<span className="inline-flex items-center gap-1"> • <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>Payment proof</span>) : ''}
                        {m.direction === 'out' && <DeliveryTicks status={m.status} />}
                      </p>
                      {m.direction === 'out' && m.status === 'failed' && m.type === 'text' && (
                        <button
                          type="button"
                          onClick={() => retryTextMessage(m)}
                          className="mt-1 text-[11px] font-black text-rose-500 dark:text-rose-300 hover:underline"
                        >
                          Message failed \u2014 tap to retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {botTypingPhone && botTypingPhone === selectedPhone && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-xl bg-white dark:bg-[#202C33] border border-[#E9EDEF]/40 dark:border-[#222D34]/40 shadow-sm flex items-center gap-2">
                    <span className="text-xs font-bold text-[#667781] dark:text-[#8696A0]">NetBot is typing</span>
                    <span className="flex items-center gap-1">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#8696A0] animate-bounce" style={{ animationDelay: (i * 0.2) + 's' }} />
                      ))}
                    </span>
                  </div>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>

            {ctxMenu && (
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setCtxMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
              >
                <div
                  className="absolute min-w-[168px] py-1.5 bg-[var(--nb-surface-3)] rounded-xl shadow-2xl border border-[var(--nb-border)] overflow-hidden"
                  style={{ left: Math.min(ctxMenu.x, window.innerWidth - 184), top: Math.min(ctxMenu.y, window.innerHeight - 170) }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => { setReplyTo(ctxMenu.msg); setCtxMenu(null); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setForwardMsg(ctxMenu.msg); setForwardQuery(''); setCtxMenu(null); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    Forward
                  </button>
                  {ctxMenu.msg.type === 'text' && ctxMenu.msg.content && (
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(ctxMenu.msg.content || '').catch(() => {}); setCtxMenu(null); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-[var(--nb-text-1)] hover:bg-[var(--nb-surface-2)]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Copy
                    </button>
                  )}
                  {ctxMenu.msg.direction === 'out' && (
                    <button
                      type="button"
                      onClick={() => { const m = ctxMenu.msg; setCtxMenu(null); deleteThreadMessage(m); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-[var(--nb-danger)] hover:bg-[var(--nb-surface-2)]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}

            {forwardMsg && (
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[var(--nb-scrim)]"
                onClick={() => setForwardMsg(null)}
              >
                <div
                  className="w-full max-w-sm bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-hidden shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4 border-b border-[var(--nb-border)]">
                    <h4 className="text-sm font-black text-[var(--nb-text-1)]">Forward to...</h4>
                    <div className="flex items-center gap-2 px-3 py-2 mt-2.5 rounded-xl bg-[var(--nb-header)]">
                      <svg className="w-4 h-4 flex-shrink-0 text-[var(--nb-text-2)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        autoFocus
                        value={forwardQuery}
                        onChange={(e) => setForwardQuery(e.target.value)}
                        placeholder="Search chats"
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)]"
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto custom-scrollbar">
                    {conversations
                      .filter(c => {
                        const q = forwardQuery.trim().toLowerCase();
                        return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, ''));
                      })
                      .map(c => (
                        <button
                          key={c.phone}
                          type="button"
                          onClick={() => forwardMessage(forwardMsg, c.phone)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--nb-surface-2)] transition-colors text-left"
                        >
                          <span className="w-10 h-10 rounded-full bg-[var(--nb-accent)] text-white flex items-center justify-center text-sm font-black flex-shrink-0">
                            {(c.name || '?').trim().slice(0, 1).toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-black text-[var(--nb-text-1)] truncate">{c.name}</span>
                            <span className="block text-[11px] font-bold text-[var(--nb-text-2)] truncate">{c.lastMessage || '+92' + c.phone}</span>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFilePick}
              className="hidden"
            />
            {replyTo && (
              <div className="px-3.5 py-2 bg-[var(--nb-header)] border-t border-[var(--nb-border)] flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 min-w-0 pl-2.5 border-l-[3px] border-[var(--nb-accent)]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--nb-accent)]">
                    Replying to {replyTo.direction === 'out' ? 'yourself' : (selectedConv?.name || 'customer')}
                  </p>
                  <p className="text-xs text-[var(--nb-text-1)] opacity-70 truncate">{replySnippet(replyTo)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  title="Cancel reply"
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-[var(--nb-text-2)] hover:bg-[var(--nb-surface-2)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            <div className="p-3 bg-[var(--nb-header)] border-t border-[var(--nb-border)] flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording}
                title="Send a photo, video or document"
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] border border-[var(--nb-border)] disabled:opacity-40 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>
              <button
                onClick={openOfficialTemplateModal}
                disabled={uploading || recording}
                title="Send an official Meta template"
                aria-label="Official templates"
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] text-[var(--nb-text-2)] border border-[var(--nb-border)] disabled:opacity-40 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>

              {recording ? (
                <div className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3 rounded-xl bg-[var(--nb-surface-2)] border border-[var(--nb-danger)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--nb-danger)] animate-pulse flex-shrink-0" />
                  <span className="text-sm font-bold text-[var(--nb-danger)] flex-1">
                    Recording... {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                  </span>
                  <button onClick={cancelRecording} className="text-xs font-black uppercase tracking-widest text-[var(--nb-text-3)] min-h-[44px] px-2">Cancel</button>
                </div>
              ) : (
                <div className="flex-1 min-w-0 relative">
                  {showSlashPalette && (
                    <>
                      {/* ── UI/UX P3 (W23): tap-outside dismisses the palette on mobile ── */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowSlashPalette(false)} />
                    <div className="absolute bottom-full mb-3 left-0 w-full max-w-md bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-2.5 bg-[var(--nb-header)] border-b border-[var(--nb-border)] flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--nb-text-2)]">Quick Replies (/commands)</span>
                        <button onClick={() => setShowSlashPalette(false)} className="text-[10px] font-bold text-[var(--nb-text-2)] hover:text-[var(--nb-accent)] min-h-[44px] px-2">Close (Esc)</button>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-[var(--nb-divider)] custom-scrollbar">
                        {slashMatches.map((cr, i) => (
                          <button
                            key={cr.cmd}
                            type="button"
                            onClick={() => { setInputText(cr.text); setShowSlashPalette(false); }}
                            onMouseEnter={() => setSlashHi(i)}
                            className={`w-full text-left p-2.5 transition-colors flex items-start gap-2.5 group ${i === slashHi ? 'bg-[var(--nb-accent-soft)]' : 'hover:bg-[var(--nb-surface-2)]'}`}
                          >
                            <span className="px-2 py-0.5 rounded-md bg-[var(--nb-accent-soft)] text-[var(--nb-accent)] font-mono font-bold text-xs shrink-0 mt-0.5">{cr.cmd}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[var(--nb-text-1)] truncate">{cr.title}</p>
                              <p className="text-[10px] text-[var(--nb-text-2)] truncate">{cr.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    </>
                  )}
                  <input
                    value={inputText}
                    onChange={e => {
                      const val = e.target.value;
                      setInputText(val);
                      if (val.startsWith('/') && val.length <= 15) {
                        setShowSlashPalette(true);
                        setSlashHi(0);
                      } else if (!val.startsWith('/')) {
                        setShowSlashPalette(false);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setShowSlashPalette(false); return; }
                      // ── UI/UX P3 (W23): arrow-key navigation + Enter to pick ──
                      if (showSlashPalette && slashMatches.length > 0) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setSlashHi(h => (h + 1) % slashMatches.length); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setSlashHi(h => (h - 1 + slashMatches.length) % slashMatches.length); return; }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const pick = slashMatches[Math.min(slashHi, slashMatches.length - 1)];
                          if (pick) { setInputText(pick.text); setShowSlashPalette(false); }
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !showSlashPalette) handleSend();
                    }}
                    placeholder="Type a message or / for quick replies..."
                    disabled={uploading}
                    className="w-full min-h-[44px] px-4 py-3 rounded-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-sm font-medium outline-none text-[var(--nb-text-1)] placeholder:text-[var(--nb-text-3)] disabled:opacity-50"
                  />
                </div>
              )}

              {recording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3.5 min-h-[44px] bg-[var(--nb-danger)] text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  Send
                </button>
              ) : inputText.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="px-6 py-3.5 min-h-[44px] bg-[var(--nb-accent)] disabled:opacity-40 text-white rounded-full font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  Send
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={uploading}
                  title="Voice message"
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-[var(--nb-accent)] disabled:opacity-40 text-white active:scale-95 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="fixed inset-0" onClick={closeOfficialTemplateModal} />
          <div className="relative z-10 w-full sm:max-w-md bg-white dark:bg-[#202C33] rounded-t-2xl sm:rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E9EDEF] dark:border-[#222D34] flex-shrink-0">
              {selectedOfficialTpl ? (
                <button onClick={() => setSelectedOfficialTpl(null)} className="w-10 h-10 flex items-center justify-center text-[#111B21] dark:text-[#E9EDEF]" aria-label="Back to templates">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
              ) : (
                <span className="w-8" />
              )}
              <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">{selectedOfficialTpl ? selectedOfficialTpl.title : 'Official Templates'}</p>
              <button onClick={closeOfficialTemplateModal} className="w-10 h-10 flex items-center justify-center text-[#111B21] dark:text-[#E9EDEF]" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto p-4 custom-scrollbar flex-1 min-h-0">
              {!selectedOfficialTpl ? (
                <>
                  <p className="text-xs font-bold text-[#667781] dark:text-[#8696A0] mb-3">Meta-approved messages — can be sent even outside the 24-hour reply window.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={usernameQuery}
                      onChange={e => { setUsernameQuery(e.target.value); setUsernameLookupState('idle'); }}
                      onKeyDown={e => { if (e.key === 'Enter') lookupOfficialTplByUsername(); }}
                      placeholder="Customer username (e.g. fcabid06)"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-medium outline-none text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781]"
                    />
                    <button
                      type="button"
                      onClick={lookupOfficialTplByUsername}
                      className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[#00A884] text-white active:scale-95 transition-all"
                      aria-label="Lookup username"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </button>
                  </div>
                  {usernameLookupState === 'notfound' && (
                    <p className="text-xs font-bold text-rose-500 mb-3">Username not found — check spelling or use manual entry below.</p>
                  )}
                  {lookupPrefill && usernameLookupState === 'idle' && (
                    <p className="text-xs font-bold text-[#00A884] mb-3">{lookupPrefill.name} — amounts will auto-fill when you pick a template.</p>
                  )}
                  <div className="space-y-2">
                    {META_OFFICIAL_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => pickOfficialTpl(tpl)}
                        className="w-full text-left p-3.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] hover:bg-[#E9EDEF] dark:hover:bg-[#2A3942] transition-colors flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">{tpl.title}</p>
                          <p className="text-[11px] text-[#667781] dark:text-[#8696A0] mt-0.5">{tpl.description}</p>
                        </div>
                        <svg className="w-4 h-4 flex-shrink-0 text-[#8696A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {selectedOfficialTpl.fields.map(f => (
                    <label key={f.key} className="block mb-3">
                      <span className="block text-xs font-bold text-[#667781] dark:text-[#8696A0] mb-1.5">{f.label}</span>
                      <input
                        type={f.inputType === 'number' ? 'number' : 'text'}
                        value={officialTplValues[f.key] || ''}
                        onChange={e => setOfficialTplValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-medium outline-none text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781]"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={sendOfficialTemplate}
                    disabled={sendingOfficialTpl || selectedOfficialTpl.fields.some(f => !(officialTplValues[f.key] || '').trim())}
                    className="w-full mt-1 px-4 py-3 bg-[#00A884] disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                  >
                    {sendingOfficialTpl ? 'Sending…' : 'Send Template'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── In-App Media Lightbox Modal (Payment screenshot zoom & verification) ── */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setLightboxMedia(null)} />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#111B21] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#202C33] border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {lightboxMedia.sender || 'Attachment'}
                </p>
                <p className="text-[11px] text-[#8696A0]">
                  {lightboxMedia.timestamp ? new Date(lightboxMedia.timestamp).toLocaleString() : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLightboxZoom(z => Math.max(0.5, z - 0.25))}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                </button>
                <span className="text-xs font-mono text-white/80 w-10 text-center">{Math.round(lightboxZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setLightboxZoom(z => Math.min(3, z + 0.25))}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxRotate(r => (r + 90) % 360)}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Rotate 90°"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <a
                  href={lightboxMedia.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Download / Open original"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  className="w-10 h-10 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Media canvas */}
            <div className="flex-1 min-h-[350px] max-h-[70vh] overflow-auto flex items-center justify-center p-4 bg-black/40 custom-scrollbar">
              <img
                src={lightboxMedia.url}
                alt="Attachment preview"
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${lightboxZoom}) rotate(${lightboxRotate}deg)` }}
              />
            </div>

            {/* Footer action bar */}
            <div className="px-4 py-3 bg-[#202C33] border-t border-white/10 flex items-center justify-between shrink-0">
              <span className="text-xs text-[#8696A0]">Verify the payment slip</span>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    )}
      {/* ── Rail pin sheet (customizable tool rail): Silk bottom sheet with grabber
          + scrim. Lists all 16 views with pin/unpin toggles; Inbox is always pinned.
          Dismisses on backdrop click or Escape. ── */}
      {pinSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-[var(--nb-scrim)] flex items-end justify-center"
          onClick={() => setPinSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Customize rail"
        >
          <div
            className="w-full max-w-md bg-[var(--nb-surface-1)] rounded-t-[20px] border-t border-x border-[var(--nb-border)] max-h-[70dvh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-3 pb-1 flex justify-center flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-[var(--nb-text-3)]" />
            </div>
            <div className="px-4 pt-1 pb-2 flex-shrink-0">
              <h5 className="text-[17px] font-semibold text-[var(--nb-text-1)]">Pin to rail</h5>
              <p className="text-[13px] text-[var(--nb-text-2)]">Choose which views appear on the rail. Inbox is always pinned.</p>
            </div>
            <div className="overflow-y-auto px-2 pb-4 custom-scrollbar">
              {ALL_RAIL_VIEWS.map(v => {
                const pinned = railPins.includes(v.key);
                const locked = v.key === 'inbox';
                return (
                  <button
                    key={v.key}
                    type="button"
                    disabled={locked}
                    onClick={() => toggleRailPin(v.key)}
                    className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-xl text-left transition-all active:scale-[0.99] hover:bg-[var(--nb-surface-2)] disabled:opacity-60"
                  >
                    <svg className="w-5 h-5 flex-shrink-0 text-[var(--nb-text-2)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={v.icon} />
                    </svg>
                    <span className="flex-1 text-[15px] font-semibold text-[var(--nb-text-1)]">{v.label}</span>
                    {locked ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-3)]">Always</span>
                    ) : (
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${pinned ? 'bg-[var(--nb-accent)] border-[var(--nb-accent)]' : 'border-[var(--nb-border)]'}`}>
                        {pinned && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* ── Bulk pause/resume confirm sheet (Android parity): Silk confirm sheet,
          never window.confirm. Dismisses on backdrop click or Escape. ── */}
      {bulkConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--nb-scrim)]"
          onClick={() => setBulkConfirm(null)}
          role="dialog"
          aria-modal="true"
          aria-label={bulkConfirm === 'pause' ? 'Pause all bots' : 'Resume all bots'}
        >
          <div
            className="w-full max-w-sm bg-[var(--nb-surface-1)] rounded-2xl p-4 border border-[var(--nb-border)]"
            onClick={e => e.stopPropagation()}
          >
            <h5 className="text-[17px] font-semibold text-[var(--nb-text-1)]">
              {bulkConfirm === 'pause' ? 'Pause all bots?' : 'Resume all bots?'}
            </h5>
            <p className="mt-1 text-[15px] text-[var(--nb-text-2)]">
              {bulkConfirm === 'pause'
                ? 'The bot will stop auto-replying on every conversation until you resume — you can still reply manually.'
                : 'The bot will start auto-replying again on every conversation.'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setBulkConfirm(null)}
                className="flex-1 min-h-[48px] rounded-full bg-[var(--nb-surface-3)] text-[var(--nb-text-1)] text-[15px] font-semibold active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { bulkConfirm === 'pause' ? pauseAllBots() : resumeAllBots(); }}
                className={`flex-1 min-h-[48px] rounded-full text-white text-[15px] font-semibold active:scale-[0.97] transition-all ${bulkConfirm === 'pause' ? 'bg-[var(--nb-danger)]' : 'bg-[var(--nb-accent)]'}`}
              >
                {bulkConfirm === 'pause' ? 'Pause All' : 'Resume All'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Movable Copilot bubble: hidden on the copilot view itself ── */}
      {view !== 'copilot' && (
        <WABotCopilotBubble
          onOpenCopilot={() => { closeMenus(); setView('copilot'); }}
          onCloseHint={showSaveToast}
        />
      )}
      </div>
    </div>
  );
};

export default WABotInbox;

