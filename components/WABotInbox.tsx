import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserRecord, RouterCatalog, RouterCatalogItem, BotTemplate, WABotAgent, WABotBehaviorRule } from '../types';
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
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#00A884';
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-xs font-black text-slate-900 dark:text-white">
          {unlimited ? 'Unlimited' : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
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
  onOpenReceiptGenerator?: (userId?: string) => void;
  botName?: string;
  onUpdateBotName?: (name: string) => void;
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
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
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
      specs: `📡 *GS3101 — China Mobile*\n💰 Price: Rs. 3,000\n\n🔧 *Specs:*\n• Chipset: EcoNet EN7526F @ 900MHz\n• Memory: 256MB RAM + 256MB Flash\n• Ports: 1x Gigabit + 3x Fast Ethernet\n• Fiber: GPON/EPON auto-detect\n• WiFi: 2.4GHz (802.11 b/g/n)\n• Extra: 1x VoIP port + 1x USB 2.0\n\n📶 *Range:* 1-2 rooms (30-40 feet), 1 deewar cross karta hai achi tarah\n✅ *Best for:* Budget-friendly, single room/small space use, stable connection`,
    },
    {
      id: 'default-hg8546m',
      model: 'HG8546M',
      company: 'Huawei EchoLife',
      band: '2.4GHz Single Band',
      price: 3500,
      image: `${IMG_BASE}/huawei-hg8546m.jpg`,
      specs: `📡 *Huawei EchoLife HG8546M*\n💰 Price: Rs. 3,500\n\n🔧 *Specs:*\n• PON: XPON (GPON/EPON adaptive)\n• Ports: 1x Gigabit + 3x Fast Ethernet\n• WiFi: 2.4GHz only (802.11 b/g/n, 2x2 MIMO)\n• Antennas: 2x External (5dBi)\n• Extra: 1x Telephone port + 1x USB 2.0\n\n📶 *Range:* Open space mein 60-80 feet, indoor 1 deewar easily, 2+ deewaron ke baad weak\n✅ *Best for:* 10 marla ghar ka 1 floor (center mein lagayein)`,
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
      specs: `📡 *Huawei Q2 — Dual Band 5G*\n💰 Price: Rs. 6,000 _(Refurbished)_\n📦 Box mein: Router + Original Power Adapter\n\n🔧 *Specs:*\n• Dedicated Gigabit WAN — full speed, no drop\n• 5GHz Ultra-Speed WiFi — low ping, 4K streaming\n• Heavy bandwidth handling, 24/7 use\n• 64 devices ek sath connect ho sakte hain\n\n📶 *Range:* Moti deewaron ke through bhi 50-80 feet — 2-3 kamron ya pure medium flat ke liye perfect\n✅ *Best for:* Gaming, multiple devices, bara ghar/flat`,
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
  if (mins < 1) return 'abhi';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function typePreview(type: string): string {
  if (type === 'image') return '📷 Photo';
  if (type === 'audio' || type === 'voice') return '🎤 Voice note';
  if (type === 'video') return '🎬 Video';
  if (type === 'document') return '📄 Document';
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
    return <span className="text-rose-300">⚠</span>;
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

const CANNED_REPLIES: CannedReply[] = [
  {
    cmd: '/bank',
    title: 'Bank Account Details',
    desc: 'Bank account number, title aur IBAN',
    text: '🏦 *Bank Account Details:*\nBank: Meezan Bank\nAccount Title: MahadNet ISP\nAccount No: 02840105829101\nIBAN: PK23MEZN0002840105829101\n\n_Payment kar ke screenshot yahan share kar dein taake foran update kar diya jaye._',
  },
  {
    cmd: '/jazzcash',
    title: 'JazzCash Account Details',
    desc: 'JazzCash mobile account details',
    text: '📱 *JazzCash Payment Details:*\nAccount Title: MahadNet\nJazzCash No: 03001234567\n\n_Payment ke baad TID ya screenshot zaroor send karein._',
  },
  {
    cmd: '/easypaisa',
    title: 'EasyPaisa Account Details',
    desc: 'EasyPaisa mobile account details',
    text: '💳 *EasyPaisa Payment Details:*\nAccount Title: MahadNet\nEasyPaisa No: 03001234567\n\n_Screenshot bhej dein activation foran ho jaye gi._',
  },
  {
    cmd: '/reboot',
    title: 'Router Restart Guide',
    desc: 'Router ko band kar ke on karne ka tareeqa',
    text: '🔌 *Router Restart Guidance:*\n1. Router ka power adapter switch se nikalen.\n2. 2 minute intezar karein taake session reset ho jaye.\n3. Dobara on karein aur 3 minute wait karein jab tak Internet light stable na ho jaye.\n\nAgar phir bhi issue ho to batayein, team visit schedule kar dete hain.',
  },
  {
    cmd: '/los',
    title: 'Red LOS Light / Fiber Cut',
    desc: 'Router par red light blinking guide',
    text: '🔴 *Router par Red LOS Light:*\nIska matlab fiber optical wire mein signal drop ya cut hai. Baraye meharbani wire ko zor se mat khenchein. Humari field team ko alert bhej diya gaya hai, jald se jald check kar rahe hain.',
  },
  {
    cmd: '/dns',
    title: 'Speed / DNS Troubleshooting',
    desc: 'Google DNS 8.8.8.8 setting guide',
    text: '🌐 *Internet Speed / Browsing Check:*\nBaraye meharbani device ke Wi-Fi settings mein ja kar DNS ko *8.8.8.8* aur secondary *8.8.4.4* par set karein, aur direct test karein.',
  },
  {
    cmd: '/grace',
    title: '24-Hour Grace Period',
    desc: 'Bill payment ke liye 24 ghante ka time',
    text: '⏳ *Grace Period Extended:*\nAapki connection 24 ghante ke liye temporarily restore kar di gayi hai. Baraye meharbani kal sham se pehle apna bill clear kar dein taake service suspend na ho. Shukriya!',
  },
];

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
    version: 'v2.4',
    date: '17 September 2026',
    title: 'WhatsApp Web Redesign & Workflow Speedup',
    badge: 'Latest',
    badgeColor: 'bg-[#00A884]',
    features: [
      {
        tag: 'UI/UX',
        title: 'Desktop Viewport Lock & Pinned Composer',
        desc: 'Chat kholne par browser page scroll hona band; left chat directory aur right conversation thread alag alag independent scroll hote hain, aur message input bar screen ke bottom par pinned rehta hai.',
      },
      {
        tag: 'Theme',
        title: 'Official WhatsApp Web Color Palette & Unified Sync',
        desc: 'Original WhatsApp Web hex colors (#efeae2 canvas, #d9fdd3 outgoing, #00a884 accent) apply kiye gaye aur Manager Dashboard ke sath dark/light mode ek sath sync kar diya gaya.',
      },
      {
        tag: 'Speed',
        title: 'Smart Filter Tabs (All / Unread / Payment Slips / Paused)',
        desc: 'Bina scroll kiye 1 click par unread messages ya payment slips filter karne ki sahulat.',
      },
      {
        tag: 'Shortcuts',
        title: 'Canned Quick Replies (/slash commands)',
        desc: 'Input box mein / likhte hi /bank, /jazzcash, /reboot, /los, /dns, /grace ki palette khul jati hai, bar bar bank details type karne ki zaroorat nahi.',
      },
      {
        tag: 'Verification',
        title: 'In-App Media Lightbox & Screenshot Zoom Viewer',
        desc: 'Customer ke payment screenshot ko bina new tab khole chat ke andar hi zoom aur rotate kar ke 1 click mein receipt generate karne ka button.',
      },
    ],
  },
  {
    version: 'v2.3',
    date: '16 September 2026',
    title: 'Outage Management & Realtime Reliability',
    badge: 'Performance',
    badgeColor: 'bg-indigo-500',
    features: [
      {
        tag: 'Automation',
        title: 'Unregistered Number Outage Scoping',
        desc: 'Agar customer ka number system mein register na bhi ho, tab bhi area/backend outage par NetBot foran automatic outage alert bhejti hai.',
      },
      {
        tag: 'Database',
        title: 'Aggregated Conversation Summaries RPC',
        desc: 'Chat list row-cap khatam; database-level aggregate RPC se chats load hoti hain jisse high traffic par koi contact miss nahi hota.',
      },
      {
        tag: 'Egress',
        title: 'Network Egress Optimization',
        desc: 'Background 60s poll se unnecessary heavy payload cut kar ke fast sync implement kiya gaya.',
      },
    ],
  },
  {
    version: 'v2.2',
    date: '14 September 2026',
    title: 'NetBot AI Persona & Training Studio',
    badge: 'AI Engine',
    badgeColor: 'bg-purple-500',
    features: [
      {
        tag: 'AI',
        title: 'Teach NetBot & Situation Handling Rules',
        desc: 'Bot ko specific customer situations ke liye custom rules aur preferred handling sikhane ka visual manager panel.',
      },
      {
        tag: 'Voice',
        title: 'Gemini TTS Voice Studio',
        desc: '30 prebuilt Gemini AI natural voices aur custom style descriptors ke sath live voice preview.',
      },
      {
        tag: 'Inventory',
        title: 'Interactive Router Catalog',
        desc: 'Single band aur dual band routers ki images, specifications aur live pricing ka managed catalog.',
      },
    ],
  },
];

const WABotInbox: React.FC<WABotInboxProps> = ({ managerId, customers, onOpenReceiptGenerator, botName, onUpdateBotName, routerCatalog, onUpdateRouterCatalog, botTemplates, onUpdateBotTemplates, ttsVoice, onUpdateTtsVoice, wabotAgents, onUpdateWabotAgents, botPersonaNotes, onUpdateBotPersonaNotes, botBehaviorRules, onUpdateBotBehaviorRules, theme, onToggleTheme, onLogout }) => {
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

  // ── Tab views & settings navigation ──
  const [view, setView] = useState<'inbox' | 'teach' | 'training' | 'catalog' | 'templates' | 'agents' | 'topup' | 'updates' | 'contacts' | 'settings' | 'help'>('inbox');
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpFaqOpen, setHelpFaqOpen] = useState<number | null>(0);

  // ── Smart filter tabs (All / Unread / Payment Slips / Paused) ──
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'proofs' | 'paused'>('all');

  // ── In-App Media Lightbox state (Payment proof zoom & verification) ──
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video'; timestamp?: string; sender?: string } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxRotate, setLightboxRotate] = useState(0);

  // ── Canned quick replies (/slash commands) palette state ──
  const [showSlashPalette, setShowSlashPalette] = useState(false);

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
        setPreviewError(`⚠️ Yeh Edge-TTS ki awaz hai, Azure ki nahi — Azure fail hui: ${data.azureError || 'wajah maloom nahi'}`);
      } else if (data.providerUsed) {
        setPreviewConfirm(`✓ Yeh awaz ${providerLabel[data.providerUsed] || data.providerUsed} se generate hui`);
      }
    } catch (e: any) {
      setPreviewError(e?.message || 'Preview generate nahi ho saka. Dobara koshish karein.');
    } finally {
      setPreviewingVoice(null);
    }
  };

  const saveDefaultVoice = (voice: string) => {
    setSelectedVoice(voice);
    onUpdateTtsVoice?.(voice);
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
      setQuotaError('Quota load nahi ho saki. Dobara koshish karein.');
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
  };

  const addBehaviorRule = () => {
    const trigger = ruleDraft.trigger.trim();
    const response = ruleDraft.response.trim();
    if (!trigger || !response) {
      alert('Situation aur preferred handling dono required hain');
      return;
    }
    const rule: WABotBehaviorRule = { id: `rule-${Date.now()}`, trigger, response, active: true };
    onUpdateBotBehaviorRules?.([...(botBehaviorRules || []), rule]);
    setRuleDraft({ trigger: '', response: '' });
  };

  const toggleBehaviorRule = (id: string) => {
    onUpdateBotBehaviorRules?.((botBehaviorRules || []).map(rule => rule.id === id ? { ...rule, active: !rule.active } : rule));
  };

  const deleteBehaviorRule = (id: string) => {
    if (!confirm('Yeh Teach NetBot rule delete karein?')) return;
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
  };

  const resetBotTemplateToDefault = (key: string) => {
    if (!botTemplates || !botTemplates[key]) return;
    if (!confirm('Is template ko default wording par reset karein?')) return;
    const updated = { ...botTemplates };
    delete updated[key];
    onUpdateBotTemplates?.(updated);
  };

  const deleteCustomBotTemplate = (key: string) => {
    if (!confirm('Yeh custom template permanently delete karein?')) return;
    const updated = { ...(botTemplates || {}) };
    delete updated[key];
    onUpdateBotTemplates?.(updated);
  };

  const handleAddBotTemplate = () => {
    if (!newBotTemplate.key.trim() || !newBotTemplate.label.trim() || !newBotTemplate.text.trim()) {
      alert('Key, label aur text sab required hain');
      return;
    }
    const safeKey = newBotTemplate.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (effectiveTemplates[safeKey]) {
      alert('Ye key already exist karti hai, dusra naam try karein');
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

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (chatFilter === 'unread') return c.unreadCount > 0;
      if (chatFilter === 'paused') return c.paused;
      if (chatFilter === 'proofs') {
        const isImgOrDoc = c.lastType === 'image' || c.lastType === 'document';
        const textHasProof = /proof|slip|payment|paid|screen\s*shot|receipt|ada|bhej\s*di/i.test(c.lastMessage);
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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
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

  const handleSend = async () => {
    if (!selectedPhone || !inputText.trim() || sending) return;
    const body = inputText.trim();
    setInputText('');
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
        alert(`Message send nahi hua: ${err?.error || 'unknown error'}`);
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
      alert('Network error — message send nahi hua.');
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
      alert('Microphone ki permission nahi mili. Browser settings mein allow karein.');
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
        alert(`Voice message send nahi hua: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      alert('Voice message upload nahi hua: ' + (e?.message || ''));
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
        alert(`File send nahi hua: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
      setThread(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      alert('File upload nahi hua: ' + (e?.message || ''));
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
    } catch (e) {
      console.error('[WABotInbox] saveContactName', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-slate-400 dark:text-slate-500 font-bold">
        Loading conversations...
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100dvh-5.5rem)] min-h-[520px] max-h-[100dvh] gap-3 p-3 rounded-2xl overflow-hidden shadow-sm"
      style={{ background: wabotDark ? '#0C1317' : '#F0F2F5' }}
    >
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
                  onClick={() => onOpenReceiptGenerator?.(selectedConv.userId)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#000000] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Receipt
                </button>
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
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#000000] text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-white/5 active:scale-95 transition-all relative"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
              {unreviewedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{unreviewedCount}</span>
              )}
            </button>
          </div>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute top-11 right-0 z-50 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg py-2 overflow-hidden">
                <button
                  onClick={() => { setView('teach'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L8 18l-4 1 1-4 11.5-11.5z" /></svg>
                  Teach NetBot
                  {(botBehaviorRules || []).filter(rule => rule.active).length > 0 && <span className="ml-auto bg-[#00A884] text-white text-[9px] font-black px-2 py-1 rounded-full">{(botBehaviorRules || []).filter(rule => rule.active).length}</span>}
                </button>
                <button
                  onClick={() => { setView('training'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 21 12.083 12.083 0 015.84 10.578L12 14zm0 0v7" /></svg>
                  Training
                  {unreviewedCount > 0 && <span className="ml-auto bg-amber-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{unreviewedCount}</span>}
                </button>
                <button
                  onClick={() => { setView('catalog'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
                  Router Catalog
                </button>
                <button
                  onClick={() => { setView('templates'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Bot Templates
                </button>
                <button
                  onClick={() => { setView('agents'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                  Voice &amp; Agents
                </button>
                <button
                  onClick={() => { setView('topup'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 100 6h3.75A2.25 2.25 0 0021 13.5v-1.5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9.75V7.5a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 7.5v9a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0018 16.5v-2.25" /></svg>
                  Topup
                </button>
                <button
                  onClick={() => { setView('updates'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 text-[#00A884] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <div className="flex-1 flex items-center justify-between text-left">
                    <span>Updates &amp; Changelog</span>
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-[#00A884]/15 text-[#00A884]">New</span>
                  </div>
                </button>
                <button
                  onClick={() => { setView('settings'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Settings
                </button>
                <button
                  onClick={() => { setView('help'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Help &amp; Support
                </button>
                {onLogout && (
                  <>
                    <div className="h-px bg-slate-100 dark:bg-white/10 my-2" />
                    <button
                      onClick={() => { setMenuOpen(false); onLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Logout
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setView('inbox')}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#000000] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h3 className="text-base font-black text-black dark:text-white uppercase tracking-tight">
            {view === 'teach' ? 'Teach NetBot' : view === 'training' ? 'Training' : view === 'catalog' ? 'Router Catalog' : view === 'templates' ? 'Bot Templates' : view === 'topup' ? 'Topup' : view === 'updates' ? 'NetBot System Updates & Changelog' : view === 'contacts' ? 'Contacts' : view === 'settings' ? 'Settings' : view === 'help' ? 'Help & Support' : 'Voice & Agents'}
          </h3>
        </div>
      )}

      {view === 'teach' ? (
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Teach NetBot</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Yahan bot ko public dealing ka overall andaaz aur specific situations handle karne ka tareeqa samjhayen. Yeh guidance AI replies mein reference ke taur par use hogi; payment numbers, activation aur renewal ke system safeguards hamesha priority par rahenge.</p>
          </div>

          <section className="p-4 rounded-2xl border border-[#00A884]/25 bg-[#00A884]/5 mb-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Persona &amp; public dealing</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1">Misal: pehle customer ki baat acknowledge karo, jaldi catalog offer na karo, aur zaroorat par Mahad bhai/team ko handoff batao.</p>
              </div>
              <button onClick={savePersonaNotes} className="px-3 py-2 bg-[#00A884] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
            </div>
            <textarea value={personaDraft} onChange={e => setPersonaDraft(e.target.value)} rows={5} placeholder="Bot ko overall kis lehje aur tareeqe se baat karni chahiye?" className="w-full p-3 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white" />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Situation rules</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1">Customer ki situation likhein aur preferred handling batayein. Bot isay sales shortcut nahi, support guidance samjhega.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{(botBehaviorRules || []).length} rules</span>
            </div>
            <div className="space-y-3 mb-5">
              {(botBehaviorRules || []).map(rule => (
                <div key={rule.id} className={`p-4 rounded-2xl border ${rule.active ? 'border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5' : 'border-slate-100 dark:border-white/5 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#00A884] mb-1">When this happens</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white whitespace-pre-wrap">{rule.trigger}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3 mb-1">Handle it like this</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold whitespace-pre-wrap">{rule.response}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => toggleBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">{rule.active ? 'Pause' : 'Use'}</button>
                      <button onClick={() => deleteBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {(botBehaviorRules || []).length === 0 && <p className="text-sm text-slate-400 font-bold py-4">Abhi koi custom rule nahi hai. Neeche se pehla rule add karein.</p>}
            </div>
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/15">
              <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3">Add a rule</h4>
              <input value={ruleDraft.trigger} onChange={e => setRuleDraft(prev => ({ ...prev, trigger: e.target.value }))} placeholder="Situation: customer kahe router kharab hai aur kal set karwana hai" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white mb-2" />
              <textarea value={ruleDraft.response} onChange={e => setRuleDraft(prev => ({ ...prev, response: e.target.value }))} rows={3} placeholder="Preferred handling: pehle fault acknowledge karo, catalog na bhejo, team visit note karo" className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white" />
              <button onClick={addBehaviorRule} className="mt-3 px-4 py-2.5 bg-[#00A884] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Add Rule</button>
            </div>
          </section>
        </div>
      ) : view === 'training' ? (
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-5">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Confused Replies / Training</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Jab bot ko deterministic jawab nahi milta, woh AI se reply karti hai aur yahan log hota hai. Acha jawab "Approve" kar do — wahi wording aage bhi use hogi.</p>
          </div>

          {knowledgeLoading ? (
            <p className="text-sm text-slate-400 font-bold text-center py-10">Loading...</p>
          ) : knowledge.length === 0 ? (
            <p className="text-sm text-slate-400 font-bold text-center py-10">Abhi koi training entries nahi hain.</p>
          ) : (
            <div className="space-y-4">
              {knowledge.map(k => {
                const isUnreviewed = k.tags?.includes('unreviewed');
                const isEditing = editingId === k.id;
                return (
                  <div key={k.id} className={`p-5 rounded-2xl border ${isUnreviewed ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5' : 'border-[#00A884]/25 dark:border-[#00A884]/20 bg-[#00A884]/5 dark:bg-[#00A884]/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isUnreviewed ? 'bg-amber-500 text-white' : 'bg-[#00A884] text-white'}`}>
                        {isUnreviewed ? 'Unreviewed' : 'Approved'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">{timeAgo(k.created_at)}</span>
                    </div>
                    <p className="text-sm font-black text-slate-900 dark:text-white mb-1">Q: {k.question}</p>
                    {isEditing ? (
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={3}
                        className="w-full mt-2 p-3 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold whitespace-pre-wrap">A: {k.answer}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {isEditing ? (
                        <>
                          <button onClick={() => approveKnowledge(k, editText)} className="px-4 py-2 bg-[#00A884] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Save & Approve</button>
                          <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                        </>
                      ) : (
                        <>
                          {isUnreviewed ? (
                            <>
                              <button onClick={() => approveKnowledge(k, k.answer)} className="px-4 py-2 bg-[#00A884] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">✓ Approve As-Is</button>
                              <button onClick={() => { setEditingId(k.id); setEditText(k.answer); }} className="px-4 py-2 bg-[#00A884] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">✏ Edit & Approve</button>
                            </>
                          ) : (
                            <button onClick={() => revertKnowledge(k.id)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">↺ Unapprove</button>
                          )}
                          <button onClick={() => deleteKnowledge(k.id)} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest">🗑 Delete</button>
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
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-5">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Router Catalog</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Yahan se router models, price, specs aur image edit karein — NetBot WhatsApp par yehi catalog dikhati hai, code edit ki koi zaroorat nahi.</p>
          </div>

          {(['2.4g', '5g'] as const).map(band => (
            <div key={band} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{band === '2.4g' ? '2.4G Routers' : '5G Routers'}</h4>
                <button
                  onClick={() => openAddRouter(band)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00A884] text-white rounded-lg font-black text-[10px] uppercase tracking-widest"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  Add
                </button>
              </div>
              <div className="space-y-3">
                {catalogState[band].length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-4">Koi router nahi hai is band mein.</p>
                ) : (
                  catalogState[band].map(r => (
                    <div key={r.id} className="p-4 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white truncate">{r.model} <span className="text-slate-400 font-bold">— {r.company}</span></p>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">{r.band} · Rs. {r.price.toLocaleString()}</p>
                      </div>
                      <button onClick={() => openEditRouter(band, r)} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#00A884]/10 text-[#00A884]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteRouter(band, r.id)} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {catalogModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">{catalogModal.item ? 'Edit Router' : 'Naya Router Add Karein'} — {catalogModal.band === '2.4g' ? '2.4G' : '5G'}</h3>
                <div className="space-y-3">
                  <input placeholder="Model (jese GS3101)" value={catalogForm.model} onChange={e => setCatalogForm(f => ({ ...f, model: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Company (jese Huawei)" value={catalogForm.company} onChange={e => setCatalogForm(f => ({ ...f, company: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Band label (jese 2.4GHz Single Band)" value={catalogForm.band} onChange={e => setCatalogForm(f => ({ ...f, band: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Price (Rs.)" type="number" value={catalogForm.price} onChange={e => setCatalogForm(f => ({ ...f, price: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Image URL" value={catalogForm.image} onChange={e => setCatalogForm(f => ({ ...f, image: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <textarea placeholder="Specs — yeh exact text customer ko WhatsApp par jayega" rows={7} value={catalogForm.specs} onChange={e => setCatalogForm(f => ({ ...f, specs: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={saveCatalogModal} className="flex-1 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">Save</button>
                  <button onClick={() => setCatalogModal(null)} className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'templates' ? (
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Reply Templates</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">NetBot ke har reply ki wording yahan se edit karein — koi code deploy ki zaroorat nahi. {'{curly_braces}'} wale tokens na hatayen, woh customer ka naam/amount/etc. se fill hote hain.</p>
            </div>
            <button
              onClick={() => setShowAddTemplateModal(true)}
              className="flex-shrink-0 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              + New
            </button>
          </div>

          {orderedCategories.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold py-6">Templates load ho rahe hain — agar yeh message rehta hai, app ek baar refresh kar lein.</p>
          ) : (
            orderedCategories.map(category => (
              <div key={category} className="mb-4">
                <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between mb-2 py-1">
                  <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{category}</h4>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedCategories.has(category) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedCategories.has(category) && (
                  <div className="space-y-2">
                    {templatesByCategory[category].map(([key, item]) => (
                      <div key={key} className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] p-3">
                        <button onClick={() => openTemplateEdit(key)} className="w-full flex items-center justify-between gap-2 text-left">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.label}</span>
                            {isEditedBotTemplate(key) && (
                              <span className="flex-shrink-0 text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">Edited</span>
                            )}
                          </span>
                          <svg className="w-4 h-4 flex-shrink-0 text-[#00A884]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {editingTemplateKey === key && (
                          <div className="mt-3">
                            <textarea
                              rows={Math.min(12, Math.max(3, templateDraft.split('\n').length + 1))}
                              value={templateDraft}
                              onChange={e => setTemplateDraft(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white"
                            />
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <button onClick={() => saveTemplateEdit(key)} className="flex-1 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                              <button onClick={() => setEditingTemplateKey(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                              {isEditedBotTemplate(key) && !isCustomBotTemplate(key) && (
                                <button onClick={() => resetBotTemplateToDefault(key)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Reset</button>
                              )}
                              {isCustomBotTemplate(key) && (
                                <button onClick={() => deleteCustomBotTemplate(key)} className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest">Delete</button>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">Naya Template</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Key (unique, spaces nahi)</label>
                    <input
                      value={newBotTemplate.key}
                      onChange={e => setNewBotTemplate(f => ({ ...f, key: e.target.value }))}
                      placeholder="e.g. installation_followup"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Label</label>
                    <input
                      value={newBotTemplate.label}
                      onChange={e => setNewBotTemplate(f => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Installation Follow-up"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Category</label>
                    <select
                      value={newBotTemplate.category}
                      onChange={e => setNewBotTemplate(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                    >
                      {[...templateCategoryOrder, 'General'].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Message Text</label>
                    <textarea
                      rows={6}
                      value={newBotTemplate.text}
                      onChange={e => setNewBotTemplate(f => ({ ...f, text: e.target.value }))}
                      placeholder="Type here... {name}, {businessName} jese placeholders use karein"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                    <p className="text-[10px] text-slate-400 font-semibold mt-1.5">
                      Note: yeh naya template abhi khud se kisi bot reply se link nahi hoga — sirf reference ke liye save hota hai, jab tak developer isko webhook.ts mein wire na kare.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={handleAddBotTemplate} className="flex-1 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">Create</button>
                  <button onClick={() => { setShowAddTemplateModal(false); setNewBotTemplate({ key: '', label: '', category: 'General', text: '' }); }} className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'agents' ? (
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          {/* ── Default Voice ── */}
          <div className="mb-8">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Default Voice</h3>
            <p className="text-xs text-slate-400 font-bold mt-1 mb-4">Ye voice use hogi jab koi specific agent match na ho. Har voice sun kar pick karein.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <select
                value={selectedVoice}
                onChange={e => saveDefaultVoice(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                ))}
              </select>
              <button
                onClick={() => playVoicePreview(selectedVoice)}
                disabled={previewingVoice === selectedVoice}
                className="flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {previewingVoice === selectedVoice ? 'Loading...' : 'Preview'}
              </button>
            </div>
            {previewError && <p className="text-[11px] text-rose-400 font-bold">{previewError}</p>}
            {previewConfirm && <p className="text-[11px] text-[#00A884] font-bold">{previewConfirm}</p>}
          </div>

          {/* ── Support Agents ── */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Support Agents</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">10 tak agents bana sakte hain (jese NetBot=billing, Bilal=technical). Customer ke message mein keyword match ho to wo agent apna naam, scope, purpose, TTS provider, gender aur voice ke sath jawab deta hai — koi match na ho to Default Voice/Bot Name use hota hai. Har agent ka apna TTS provider (Gemini/Azure/Edge-TTS) test kar sakte hain.</p>
            </div>
            <button
              onClick={startNewAgent}
              className="flex-shrink-0 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              + New Agent
            </button>
          </div>

          {(!wabotAgents || wabotAgents.length === 0) && editingAgentId === null && (
            <p className="text-xs text-slate-400 font-bold py-4">Abhi koi extra agent nahi bana — sirf Default Voice wali single persona active hai. "+ New Agent" se pehla specialized agent banayein.</p>
          )}

          <div className="space-y-3">
            {(wabotAgents || []).map(agent => (
              <div key={agent.id} className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] p-4">
                {editingAgentId === agent.id && agentDraft ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Agent Name</label>
                      <input
                        value={agentDraft.name}
                        onChange={e => setAgentDraft(d => d ? { ...d, name: e.target.value } : d)}
                        placeholder="e.g. Bilal"
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Specialization Scope</label>
                      <textarea
                        rows={3}
                        value={agentDraft.scope}
                        onChange={e => setAgentDraft(d => d ? { ...d, scope: e.target.value } : d)}
                        placeholder="e.g. Sirf technical/connection issues (net slow, router, disconnect) handle karta hai — billing/payment ka jawab nahi deta"
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Routing Keywords (comma se separate)</label>
                      <input
                        value={agentDraft.keywords.join(', ')}
                        onChange={e => setAgentDraft(d => d ? { ...d, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } : d)}
                        placeholder="e.g. net nahi chal raha, router, slow, disconnect"
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Voice</label>
                      <div className="flex gap-2">
                        <select
                          value={agentDraft.voice}
                          onChange={e => setAgentDraft(d => d ? { ...d, voice: e.target.value } : d)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                        >
                          {GEMINI_VOICES.map(v => (
                            <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => playVoicePreview(agentDraft.voice)}
                          disabled={previewingVoice === agentDraft.voice}
                          className="flex-shrink-0 flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          {previewingVoice === agentDraft.voice ? '...' : 'Preview'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Purpose</label>
                        <select
                          value={agentDraft.purpose || 'general'}
                          onChange={e => setAgentDraft(d => d ? { ...d, purpose: e.target.value as WABotAgent['purpose'] } : d)}
                          className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
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
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Gender</label>
                        <select
                          value={agentDraft.gender || 'female'}
                          onChange={e => setAgentDraft(d => d ? { ...d, gender: e.target.value as WABotAgent['gender'] } : d)}
                          className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">TTS Provider</label>
                      <div className="flex gap-2">
                        <select
                          value={agentDraft.ttsProvider || 'gemini'}
                          onChange={e => setAgentDraft(d => d ? { ...d, ttsProvider: e.target.value as WABotAgent['ttsProvider'] } : d)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                        >
                          <option value="gemini">Gemini (Roman Urdu native)</option>
                          <option value="azure">Azure (free tier — script-based)</option>
                          <option value="edge">Edge-TTS (unlimited free — script-based)</option>
                        </select>
                        <button
                          onClick={() => playVoicePreview(agentDraft.voice, undefined, agentDraft.ttsProvider, agentDraft.gender)}
                          disabled={previewingVoice === agentDraft.voice}
                          className="flex-shrink-0 flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          {previewingVoice === agentDraft.voice ? '...' : 'Test'}
                        </button>
                      </div>
                      {agentDraft.ttsProvider === 'azure' && (
                        <p className="text-[10px] text-amber-500 font-bold mt-1">Azure key set nahi ho to yeh automatically Edge-TTS (free) pe fallback ho jayega.</p>
                      )}
                      {previewError && <p className="text-[10px] text-rose-400 font-bold mt-1">{previewError}</p>}
                      {previewConfirm && <p className="text-[10px] text-[#00A884] font-bold mt-1">{previewConfirm}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveAgentDraft} className="flex-1 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                      <button onClick={() => { setEditingAgentId(null); setAgentDraft(null); }} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <button onClick={() => editAgent(agent)} className="min-w-0 text-left flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-black text-slate-900 dark:text-white">{agent.name}</span>
                        <span className="text-[9px] bg-[#00A884]/10 text-[#00A884] border border-[#00A884]/20 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{agent.voice}</span>
                        <span className="text-[9px] bg-[#00A884]/10 text-[#00A884] border border-[#00A884]/20 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{agent.ttsProvider || 'gemini'}</span>
                        <span className="text-[9px] bg-slate-500/10 text-slate-400 border border-slate-500/20 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">{(agent.purpose || 'general').replace('_', ' ')}</span>
                        {!agent.active && (
                          <span className="text-[9px] bg-slate-500/10 text-slate-400 border border-slate-500/20 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">Paused</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-semibold truncate">{agent.scope || 'Koi scope description nahi'}</p>
                      {agent.keywords.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">Keywords: {agent.keywords.join(', ')}</p>
                      )}
                    </button>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => toggleAgentActive(agent.id)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-lg font-black text-[10px] uppercase tracking-widest"
                      >
                        {agent.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg font-black text-[10px] uppercase tracking-widest"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editingAgentId && agentDraft && !(wabotAgents || []).some(a => a.id === editingAgentId) && (
              <div className="rounded-2xl border border-[#00A884]/25 dark:border-[#00A884]/20 bg-[#00A884]/5 dark:bg-[#00A884]/[0.03] p-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Agent Name</label>
                    <input
                      value={agentDraft.name}
                      onChange={e => setAgentDraft(d => d ? { ...d, name: e.target.value } : d)}
                      placeholder="e.g. Bilal"
                      className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Specialization Scope</label>
                    <textarea
                      rows={3}
                      value={agentDraft.scope}
                      onChange={e => setAgentDraft(d => d ? { ...d, scope: e.target.value } : d)}
                      placeholder="e.g. Sirf technical/connection issues (net slow, router, disconnect) handle karta hai — billing/payment ka jawab nahi deta"
                      className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Routing Keywords (comma se separate)</label>
                    <input
                      value={agentDraft.keywords.join(', ')}
                      onChange={e => setAgentDraft(d => d ? { ...d, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } : d)}
                      placeholder="e.g. net nahi chal raha, router, slow, disconnect"
                      className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Voice</label>
                    <div className="flex gap-2">
                      <select
                        value={agentDraft.voice}
                        onChange={e => setAgentDraft(d => d ? { ...d, voice: e.target.value } : d)}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                      >
                        {GEMINI_VOICES.map(v => (
                          <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => playVoicePreview(agentDraft.voice)}
                        disabled={previewingVoice === agentDraft.voice}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        {previewingVoice === agentDraft.voice ? '...' : 'Preview'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Purpose</label>
                      <select
                        value={agentDraft.purpose || 'general'}
                        onChange={e => setAgentDraft(d => d ? { ...d, purpose: e.target.value as WABotAgent['purpose'] } : d)}
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
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
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">Gender</label>
                      <select
                        value={agentDraft.gender || 'female'}
                        onChange={e => setAgentDraft(d => d ? { ...d, gender: e.target.value as WABotAgent['gender'] } : d)}
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5 uppercase tracking-widest">TTS Provider</label>
                    <div className="flex gap-2">
                      <select
                        value={agentDraft.ttsProvider || 'gemini'}
                        onChange={e => setAgentDraft(d => d ? { ...d, ttsProvider: e.target.value as WABotAgent['ttsProvider'] } : d)}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                      >
                        <option value="gemini">Gemini (Roman Urdu native)</option>
                        <option value="azure">Azure (free tier — script-based)</option>
                        <option value="edge">Edge-TTS (unlimited free — script-based)</option>
                      </select>
                      <button
                        onClick={() => playVoicePreview(agentDraft.voice, undefined, agentDraft.ttsProvider, agentDraft.gender)}
                        disabled={previewingVoice === agentDraft.voice}
                        className="flex-shrink-0 flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        {previewingVoice === agentDraft.voice ? '...' : 'Test'}
                      </button>
                    </div>
                    {agentDraft.ttsProvider === 'azure' && (
                      <p className="text-[10px] text-amber-500 font-bold mt-1">Azure key set nahi ho to yeh automatically Edge-TTS (free) pe fallback ho jayega.</p>
                    )}
                    {previewError && <p className="text-[10px] text-rose-400 font-bold mt-1">{previewError}</p>}
                    {previewConfirm && <p className="text-[10px] text-[#00A884] font-bold mt-1">{previewConfirm}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveAgentDraft} className="flex-1 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                    <button onClick={() => { setEditingAgentId(null); setAgentDraft(null); }} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : view === 'topup' ? (
        <div className="flex-1 bg-white dark:bg-[#000000] rounded-2xl border border-slate-100 dark:border-white/5 overflow-y-auto p-6 custom-scrollbar">
          <div className="mb-6">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Message Quota</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Current billing cycle ka NetBot usage — text aur voice replies alag alag track hote hain.</p>
          </div>

          {quotaLoading ? (
            <p className="text-xs text-slate-400 font-bold py-6 text-center">Loading...</p>
          ) : quotaError ? (
            <p className="text-xs text-rose-400 font-bold py-6 text-center">{quotaError}</p>
          ) : quota ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[#00A884]/25 bg-[#00A884]/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plan</span>
                  {quota.serviceStatus && quota.serviceStatus !== 'active' && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">{quota.serviceStatus}</span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-900 dark:text-white capitalize">{(quota.planType || 'unknown').replace('_', ' ')}</p>
                {quota.cycleEndDate && (
                  <p className="text-[11px] text-slate-400 font-bold mt-1">Cycle ends: {quota.cycleEndDate}</p>
                )}
              </div>

              <QuotaBar label="Text Messages" used={quota.textUsed} limit={quota.textQuota} />
              {quota.voiceQuota > 0 ? (
                <QuotaBar label="Voice Replies" used={quota.voiceUsed} limit={quota.voiceQuota} />
              ) : (
                <div className="rounded-2xl border border-slate-100 dark:border-white/5 p-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Voice Replies</span>
                  <p className="text-xs text-slate-400 font-bold mt-1">Is plan mein voice replies included nahi hain.</p>
                </div>
              )}

              <a
                href={`https://wa.me/923042773453?text=${encodeURIComponent('Hello, I need NetBot credits/topup or plan upgrade.')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 004.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2z" /></svg>
                Request Topup / Upgrade
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-bold py-6 text-center">Koi quota data nahi mila.</p>
          )}
        </div>
      ) : view === 'updates' ? (
        <div className="flex-1 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="flex items-center justify-between border-b border-[#E9EDEF] dark:border-[#222D34] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-[#111B21] dark:text-[#E9EDEF] uppercase tracking-tight">NetBot System Updates &amp; Changelog</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-[#00A884]/15 text-[#00A884] font-black text-[10px] uppercase tracking-wider">Live</span>
              </div>
              <p className="text-xs text-[#667781] dark:text-[#8696A0] font-semibold mt-1">
                NetBot aur WABot inbox ke naye features, UI improvements, aur performance updates yahan track hote hain.
              </p>
            </div>
            <button
              onClick={() => setView('inbox')}
              className="px-3.5 py-2 rounded-xl bg-[#00A884] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#008069] transition-all flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Open Inbox
            </button>
          </div>

          <div className="space-y-6">
            {CHANGELOG_ITEMS.map((release) => (
              <div key={release.version} className="relative pl-6 border-l-2 border-[#00A884]/40 dark:border-[#00A884]/30 space-y-3">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#00A884] border-2 border-white dark:border-[#111B21]" />
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-black text-sm text-[#00A884]">{release.version}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider text-white ${release.badgeColor}`}>
                    {release.badge}
                  </span>
                  <span className="text-[11px] font-bold text-[#667781] dark:text-[#8696A0]">{release.date}</span>
                </div>
                <h4 className="text-base font-bold text-[#111B21] dark:text-[#E9EDEF]">{release.title}</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {release.features.map((feat, fIdx) => (
                    <div key={fIdx} className="p-3.5 rounded-xl bg-[#F0F2F5]/80 dark:bg-[#202C33]/60 border border-[#E9EDEF] dark:border-[#222D34] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-white dark:bg-[#111B21] text-[#00A884] border border-[#E9EDEF] dark:border-[#222D34]">
                          {feat.tag}
                        </span>
                        <h5 className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">{feat.title}</h5>
                      </div>
                      <p className="text-[11px] text-[#667781] dark:text-[#8696A0] leading-relaxed font-medium">
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
        <div className="flex-1 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0] mb-3">Business / Bot Name</h4>
            {editingBotName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={botNameInput}
                  onChange={e => setBotNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBotName()}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-bold outline-none text-[#111B21] dark:text-[#E9EDEF]"
                />
                <button onClick={saveBotName} className="px-4 py-2.5 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
              </div>
            ) : (
              <button onClick={() => setEditingBotName(true)} className="flex items-center gap-1.5 text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">
                {botNameInput}
                <svg className="w-3.5 h-3.5 text-[#8696A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </section>

          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">Theme</h4>
                <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] mt-1">{wabotDark ? 'Dark' : 'Light'}</p>
              </div>
              <button
                onClick={toggleWabotTheme}
                title={wabotDark ? 'Light mode' : 'Dark mode'}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#222D34] active:scale-95 transition-all"
              >
                {wabotDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>
                )}
              </button>
            </div>
          </section>

          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0] mb-3">TTS Voice</h4>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedVoice}
                onChange={e => saveDefaultVoice(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-bold outline-none text-[#111B21] dark:text-[#E9EDEF]"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                ))}
              </select>
              <button
                onClick={() => playVoicePreview(selectedVoice)}
                disabled={previewingVoice === selectedVoice}
                className="flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {previewingVoice === selectedVoice ? 'Loading...' : 'Preview'}
              </button>
            </div>
            {previewError && <p className="text-[11px] text-rose-400 font-bold mt-2">{previewError}</p>}
            {previewConfirm && <p className="text-[11px] text-[#00A884] font-bold mt-2">{previewConfirm}</p>}
          </section>

          <section className="p-4 rounded-2xl border border-[#00A884]/25 bg-[#00A884]/5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">Persona notes</h4>
                <p className="text-[11px] text-[#667781] dark:text-[#8696A0] font-semibold mt-1">Overall lehja aur public dealing ka andaaz.</p>
              </div>
              <button onClick={savePersonaNotes} className="px-3 py-2 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
            </div>
            <textarea value={personaDraft} onChange={e => setPersonaDraft(e.target.value)} rows={5} placeholder="Bot ko overall kis lehje aur tareeqe se baat karni chahiye?" className="w-full p-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF]" />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">Behavior rules</h4>
                <p className="text-[11px] text-[#667781] dark:text-[#8696A0] font-semibold mt-1">Situation aur preferred handling.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8696A0]">{(botBehaviorRules || []).length} rules</span>
            </div>
            <div className="space-y-3 mb-5">
              {(botBehaviorRules || []).map(rule => (
                <div key={rule.id} className={`p-4 rounded-2xl border ${rule.active ? 'border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40' : 'border-[#E9EDEF] dark:border-[#222D34] opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#00A884] mb-1">When this happens</p>
                      <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] whitespace-pre-wrap">{rule.trigger}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8696A0] mt-3 mb-1">Handle it like this</p>
                      <p className="text-sm text-[#667781] dark:text-[#8696A0] font-semibold whitespace-pre-wrap">{rule.response}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => toggleBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">{rule.active ? 'Pause' : 'Use'}</button>
                      <button onClick={() => deleteBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {(botBehaviorRules || []).length === 0 && <p className="text-sm text-[#8696A0] font-bold py-4">Abhi koi custom rule nahi hai. Neeche se pehla rule add karein.</p>}
            </div>
            <div className="p-4 rounded-2xl border border-dashed border-[#E9EDEF] dark:border-[#222D34]">
              <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] mb-3">Add a rule</h4>
              <input value={ruleDraft.trigger} onChange={e => setRuleDraft(prev => ({ ...prev, trigger: e.target.value }))} placeholder="Situation: customer kahe router kharab hai aur kal set karwana hai" className="w-full px-3 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF] mb-2" />
              <textarea value={ruleDraft.response} onChange={e => setRuleDraft(prev => ({ ...prev, response: e.target.value }))} rows={3} placeholder="Preferred handling: pehle fault acknowledge karo, catalog na bhejo, team visit note karo" className="w-full p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF]" />
              <button onClick={addBehaviorRule} className="mt-3 px-4 py-2.5 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Add Rule</button>
            </div>
          </section>
        </div>
      ) : view === 'help' ? (
        <div className="flex-1 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <p className="text-xs font-bold text-[#667781] dark:text-[#8696A0]">NetBot ke common sawaal, aur support se rabta.</p>
          {[
            { q: 'How do I link NetBot Web?', a: 'Computer par NetBot Web kholein aur QR code dikhayein. Android app mein App Settings → Link a Device se scan karein — web isi account mein login ho jata hai.' },
            { q: 'How do I log out a computer remotely?', a: 'Android app mein App Settings → Link a Device. Har linked session browser, OS aur last-active time dikhata hai. Log out tap karein.' },
            { q: 'The bot is still auto-replying after I sent a manual message.', a: 'Manual message us chat ko pause kar deta hai. Thread par Resume, ya menu se Pause All / Resume All Bots use karein.' },
            { q: 'How do I change the bot name or voice?', a: 'Bot name Settings mein hai. Default TTS voice aur extra agents Voice & Agents menu item se.' },
            { q: 'What if I lose my password?', a: 'Login screen par account recovery use karein, ya support@billcollector.online / WhatsApp +92 304 2773453 par rabta karein.' },
          ].map((item, i) => {
            const open = helpFaqOpen === i;
            return (
              <button
                key={item.q}
                onClick={() => setHelpFaqOpen(open ? null : i)}
                className="w-full text-left p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">{item.q}</span>
                  <svg className={`w-4 h-4 flex-shrink-0 text-[#8696A0] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {open && <p className="text-sm text-[#667781] dark:text-[#8696A0] font-semibold mt-2">{item.a}</p>}
              </button>
            );
          })}
          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">Contact support</h4>
            <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">support@billcollector.online</p>
            <a
              href="mailto:support@billcollector.online"
              className="flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#008069] text-white px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Email support
            </a>
            <a
              href={`https://wa.me/923042773453?text=${encodeURIComponent('Hello, I need help with NetBot.')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 border border-[#00A884] text-[#00A884] px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all hover:bg-[#00A884]/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 004.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2z" /></svg>
              WhatsApp +92 304 2773453
            </a>
          </section>
        </div>
      ) : view === 'settings' ? (
        <div className="flex-1 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0] mb-3">Business / Bot Name</h4>
            {editingBotName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={botNameInput}
                  onChange={e => setBotNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBotName()}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-bold outline-none text-[#111B21] dark:text-[#E9EDEF]"
                />
                <button onClick={saveBotName} className="px-4 py-2.5 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
              </div>
            ) : (
              <button onClick={() => setEditingBotName(true)} className="flex items-center gap-1.5 text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">
                {botNameInput}
                <svg className="w-3.5 h-3.5 text-[#8696A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </section>

          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">Theme</h4>
                <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] mt-1">{wabotDark ? 'Dark' : 'Light'}</p>
              </div>
              <button
                onClick={toggleWabotTheme}
                title={wabotDark ? 'Light mode' : 'Dark mode'}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#222D34] active:scale-95 transition-all"
              >
                {wabotDark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>
                )}
              </button>
            </div>
          </section>

          <section className="p-4 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0] mb-3">TTS Voice</h4>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedVoice}
                onChange={e => saveDefaultVoice(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-bold outline-none text-[#111B21] dark:text-[#E9EDEF]"
              >
                {GEMINI_VOICES.map(v => (
                  <option key={v.name} value={v.name}>{v.name} — {v.style}</option>
                ))}
              </select>
              <button
                onClick={() => playVoicePreview(selectedVoice)}
                disabled={previewingVoice === selectedVoice}
                className="flex items-center gap-1.5 bg-[#00A884] hover:bg-[#008069] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {previewingVoice === selectedVoice ? 'Loading...' : 'Preview'}
              </button>
            </div>
            {previewError && <p className="text-[11px] text-rose-400 font-bold mt-2">{previewError}</p>}
            {previewConfirm && <p className="text-[11px] text-[#00A884] font-bold mt-2">{previewConfirm}</p>}
          </section>

          <section className="p-4 rounded-2xl border border-[#00A884]/25 bg-[#00A884]/5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">Persona notes</h4>
                <p className="text-[11px] text-[#667781] dark:text-[#8696A0] font-semibold mt-1">Overall lehja aur public dealing ka andaaz.</p>
              </div>
              <button onClick={savePersonaNotes} className="px-3 py-2 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex-shrink-0">Save</button>
            </div>
            <textarea value={personaDraft} onChange={e => setPersonaDraft(e.target.value)} rows={5} placeholder="Bot ko overall kis lehje aur tareeqe se baat karni chahiye?" className="w-full p-3 rounded-xl bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF]" />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF]">Behavior rules</h4>
                <p className="text-[11px] text-[#667781] dark:text-[#8696A0] font-semibold mt-1">Situation aur preferred handling.</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8696A0]">{(botBehaviorRules || []).length} rules</span>
            </div>
            <div className="space-y-3 mb-5">
              {(botBehaviorRules || []).map(rule => (
                <div key={rule.id} className={`p-4 rounded-2xl border ${rule.active ? 'border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40' : 'border-[#E9EDEF] dark:border-[#222D34] opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#00A884] mb-1">When this happens</p>
                      <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] whitespace-pre-wrap">{rule.trigger}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8696A0] mt-3 mb-1">Handle it like this</p>
                      <p className="text-sm text-[#667781] dark:text-[#8696A0] font-semibold whitespace-pre-wrap">{rule.response}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => toggleBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">{rule.active ? 'Pause' : 'Use'}</button>
                      <button onClick={() => deleteBehaviorRule(rule.id)} className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {(botBehaviorRules || []).length === 0 && <p className="text-sm text-[#8696A0] font-bold py-4">Abhi koi custom rule nahi hai. Neeche se pehla rule add karein.</p>}
            </div>
            <div className="p-4 rounded-2xl border border-dashed border-[#E9EDEF] dark:border-[#222D34]">
              <h4 className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] mb-3">Add a rule</h4>
              <input value={ruleDraft.trigger} onChange={e => setRuleDraft(prev => ({ ...prev, trigger: e.target.value }))} placeholder="Situation: customer kahe router kharab hai aur kal set karwana hai" className="w-full px-3 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF] mb-2" />
              <textarea value={ruleDraft.response} onChange={e => setRuleDraft(prev => ({ ...prev, response: e.target.value }))} rows={3} placeholder="Preferred handling: pehle fault acknowledge karo, catalog na bhejo, team visit note karo" className="w-full p-3 rounded-xl bg-[#F0F2F5] dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF]" />
              <button onClick={addBehaviorRule} className="mt-3 px-4 py-2.5 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Add Rule</button>
            </div>
          </section>
        </div>
      ) : (
    <div className="flex flex-1 gap-3 min-h-0 overflow-hidden">
      {/* ── Chat list — full width on mobile until a chat is opened, fixed sidebar on desktop ── */}
      <div className={`${selectedPhone ? 'hidden sm:flex' : 'flex'} w-full sm:w-[350px] lg:w-[380px] flex-shrink-0 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] flex-col overflow-hidden shadow-sm`}>
        <div className="p-3 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <input
              placeholder="Search or start new chat"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white dark:bg-[#111B21] border border-[#E9EDEF] dark:border-[#222D34] text-xs font-semibold outline-none text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0]"
            />
            {totalUnread > 0 && (
              <span className="flex-shrink-0 bg-[#25D366] text-white text-[10px] font-black px-2 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </div>
          {/* ── Smart Filter Pills ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 text-[11px] font-bold">
            <button
              onClick={() => setChatFilter('all')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'all' ? 'bg-[#00A884] text-white shadow-xs' : 'bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] hover:bg-slate-200/60 dark:hover:bg-white/5 border border-[#E9EDEF] dark:border-[#222D34]'}`}
            >
              All
              <span className="text-[10px] opacity-80">({filterCounts.all})</span>
            </button>
            <button
              onClick={() => setChatFilter('unread')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'unread' ? 'bg-[#00A884] text-white shadow-xs' : 'bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] hover:bg-slate-200/60 dark:hover:bg-white/5 border border-[#E9EDEF] dark:border-[#222D34]'}`}
            >
              Unread
              {filterCounts.unread > 0 && <span className="bg-[#25D366] text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.unread}</span>}
            </button>
            <button
              onClick={() => setChatFilter('proofs')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'proofs' ? 'bg-[#00A884] text-white shadow-xs' : 'bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] hover:bg-slate-200/60 dark:hover:bg-white/5 border border-[#E9EDEF] dark:border-[#222D34]'}`}
            >
              Payment Slips
              {filterCounts.proofs > 0 && <span className="bg-amber-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.proofs}</span>}
            </button>
            <button
              onClick={() => setChatFilter('paused')}
              className={`px-2.5 py-1 rounded-full transition-all flex items-center gap-1 shrink-0 ${chatFilter === 'paused' ? 'bg-[#00A884] text-white shadow-xs' : 'bg-white dark:bg-[#111B21] text-[#667781] dark:text-[#8696A0] hover:bg-slate-200/60 dark:hover:bg-white/5 border border-[#E9EDEF] dark:border-[#222D34]'}`}
            >
              Paused
              {filterCounts.paused > 0 && <span className="bg-orange-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">{filterCounts.paused}</span>}
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#E9EDEF]/50 dark:divide-[#222D34]/50 custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-sm text-slate-400 dark:text-slate-500 font-bold">Koi WhatsApp conversation nahi mili.</p>
              {chatFilter !== 'all' && (
                <button onClick={() => setChatFilter('all')} className="mt-2 text-xs text-[#00A884] font-bold underline">Show all chats</button>
              )}
            </div>
          ) : (
            filteredConversations.map(c => (
              <button
                key={c.phone}
                onClick={() => openConversation(c.phone)}
                className={`w-full text-left p-3.5 border-b border-[#E9EDEF]/40 dark:border-[#222D34]/40 flex items-center gap-3 transition-all ${selectedPhone === c.phone ? 'bg-[#F0F2F5] dark:bg-[#2A3942]' : 'hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]'}`}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0"
                  style={{ backgroundColor: c.paused ? '#F5A623' : avatarColor(c.phone) }}
                >
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-sm text-[#111B21] dark:text-[#E9EDEF] truncate">{c.name}</p>
                    <span className="text-[10px] text-[#667781] dark:text-[#8696A0] font-bold flex-shrink-0">{timeAgo(c.lastTime)}</span>
                  </div>
                  <p className="text-xs text-[#667781] dark:text-[#8696A0] font-semibold truncate">
                    {typePreview(c.lastType) || c.lastMessage}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-[#25D366] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{c.unreadCount}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Thread — takes over full screen on mobile when a chat is open ── */}
      <div className={`${selectedPhone ? 'flex' : 'hidden sm:flex'} flex-1 bg-[#EFEAE2] dark:bg-[#0B141A] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] flex-col overflow-hidden shadow-sm min-w-0`}>
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 font-bold">
            Koi conversation select karein
          </div>
        ) : (
          <>
            <div className="p-3.5 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="sm:hidden p-2 -ml-2 text-[#667781] dark:text-[#8696A0] flex-shrink-0"
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
                        className="text-sm font-black bg-white dark:bg-[#2A3942] border border-[#E9EDEF] dark:border-[#222D34] rounded-lg px-2 py-1 outline-none text-[#111B21] dark:text-[#E9EDEF] w-36"
                      />
                      <button onClick={saveContactName} className="text-[#00A884] flex-shrink-0" aria-label="Save">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button onClick={() => setEditingContactName(false)} className="text-[#667781] dark:text-[#8696A0] flex-shrink-0" aria-label="Cancel">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setContactNameInput(contactNames[selectedConv.phone] || ''); setEditingContactName(true); }}
                      className="flex items-center gap-1.5 group"
                      title="Contact ka naam edit karein"
                    >
                      <p className="font-black text-sm text-[#111B21] dark:text-[#E9EDEF] truncate">{selectedConv.name}</p>
                      <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 group-hover:text-[#00A884] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  <p className="text-xs text-[#667781] dark:text-[#8696A0] font-bold truncate">+92{selectedConv.phone}{selectedConv.username ? ` • @${selectedConv.username}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" />
            </div>

            <div ref={threadContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5 bg-[#EFEAE2] dark:bg-[#0B141A] custom-scrollbar">
              {thread.map(m => {
                const mediaSrc = m.media_url || (m.content?.startsWith('http') ? m.content : null);
                const hasTranslation = !!m.translated_content && m.translated_content !== m.content;
                const isPlaceholderText = m.content === '[voice note — transcription unavailable]';
                return (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3.5 py-2 rounded-xl text-sm font-medium shadow-sm ${m.direction === 'out' ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-br-xs' : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] rounded-bl-xs border border-[#E9EDEF]/40 dark:border-[#222D34]/40'}`}>
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
                          {m.status === 'uploading' ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" /> : '📄'} Document dekhein
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
                              {showTranslated[m.id] ? '🌐 Asal text dekhein' : '🌐 Translate'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{renderWhatsAppText(m.content || '')}</p>
                      )}
                      <p className={`text-[10px] mt-1 font-bold flex items-center gap-1 ${m.direction === 'out' ? 'text-[#111B21]/60 dark:text-[#E9EDEF]/60 justify-end' : 'text-[#667781] dark:text-[#8696A0]'}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {m.flagged_payment_proof ? ' • 🧾 Payment proof' : ''}
                        {m.direction === 'out' && <DeliveryTicks status={m.status} />}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFilePick}
              className="hidden"
            />
            <div className="p-3 bg-[#F0F2F5] dark:bg-[#202C33] border-t border-[#E9EDEF] dark:border-[#222D34] flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording}
                title="Photo, video ya document bhejein"
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#2A3942] text-[#667781] dark:text-[#8696A0] border border-[#E9EDEF] dark:border-[#222D34] disabled:opacity-40 active:scale-95 transition-all shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>

              {recording ? (
                <div className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-300 flex-1">
                    Recording... {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                  </span>
                  <button onClick={cancelRecording} className="text-xs font-black uppercase tracking-widest text-slate-400">Cancel</button>
                </div>
              ) : (
                <div className="flex-1 min-w-0 relative">
                  {showSlashPalette && (
                    <div className="absolute bottom-full mb-3 left-0 w-full max-w-md bg-white dark:bg-[#202C33] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-2.5 bg-[#F0F2F5] dark:bg-[#111B21] border-b border-[#E9EDEF] dark:border-[#222D34] flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#667781] dark:text-[#8696A0]">Quick Replies (/commands)</span>
                        <button onClick={() => setShowSlashPalette(false)} className="text-[10px] font-bold text-[#667781] dark:text-[#8696A0] hover:text-[#00A884]">Close (Esc)</button>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-[#E9EDEF]/50 dark:divide-[#222D34]/50 custom-scrollbar">
                        {CANNED_REPLIES.filter(cr => !inputText.slice(1) || cr.cmd.includes(inputText.toLowerCase()) || cr.title.toLowerCase().includes(inputText.toLowerCase())).map(cr => (
                          <button
                            key={cr.cmd}
                            type="button"
                            onClick={() => { setInputText(cr.text); setShowSlashPalette(false); }}
                            className="w-full text-left p-2.5 hover:bg-[#F5F6F6] dark:hover:bg-[#2A3942] transition-colors flex items-start gap-2.5 group"
                          >
                            <span className="px-2 py-0.5 rounded-md bg-[#00A884]/15 text-[#00A884] font-mono font-bold text-xs shrink-0 mt-0.5">{cr.cmd}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#111B21] dark:text-[#E9EDEF] truncate">{cr.title}</p>
                              <p className="text-[10px] text-[#667781] dark:text-[#8696A0] truncate">{cr.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    value={inputText}
                    onChange={e => {
                      const val = e.target.value;
                      setInputText(val);
                      if (val.startsWith('/') && val.length <= 15) {
                        setShowSlashPalette(true);
                      } else if (!val.startsWith('/')) {
                        setShowSlashPalette(false);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setShowSlashPalette(false);
                      if (e.key === 'Enter' && !showSlashPalette) handleSend();
                    }}
                    placeholder="Type a message or / for quick replies..."
                    disabled={uploading}
                    className="w-full p-3 rounded-xl bg-white dark:bg-[#2A3942] border border-[#E9EDEF] dark:border-[#222D34] text-sm font-medium outline-none text-[#111B21] dark:text-[#E9EDEF] placeholder:text-[#667781] dark:placeholder:text-[#8696A0] disabled:opacity-50"
                  />
                </div>
              )}

              {recording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3.5 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  Send
                </button>
              ) : inputText.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="px-6 py-3.5 bg-[#00A884] disabled:opacity-40 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  Send
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={uploading}
                  title="Voice message"
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-[#00A884] disabled:opacity-40 text-white active:scale-95 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
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
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                </button>
                <span className="text-xs font-mono text-white/80 w-10 text-center">{Math.round(lightboxZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setLightboxZoom(z => Math.min(3, z + 0.25))}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxRotate(r => (r + 90) % 360)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Rotate 90°"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <a
                  href={lightboxMedia.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                  title="Download / Open original"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all"
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
              <span className="text-xs text-[#8696A0]">Payment slip verify karein ya receipt banayein</span>
              <div className="flex items-center gap-2">
                {selectedConv && (
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxMedia(null);
                      onOpenReceiptGenerator?.(selectedConv.userId);
                    }}
                    className="px-4 py-2 bg-[#00A884] hover:bg-[#008069] text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Verify &amp; Generate Receipt
                  </button>
                )}
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
        </div>
      )}
    </div>
    )}
    </div>
  );
};

export default WABotInbox;

