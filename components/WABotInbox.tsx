import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserRecord, RouterCatalog, RouterCatalogItem, BotTemplate } from '../types';
import { supabase } from '../lib/supabase';
import * as lamejs from '@breezystack/lamejs';

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
  status: 'sent' | 'delivered' | 'read' | 'failed';
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
}

const POLL_MS = 15000;

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

function DeliveryTicks({ status }: { status: string }) {
  if (status === 'read') {
    return (
      <svg className="w-4 h-3 inline-block text-sky-300" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5.5L8.5 9L15 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
  }
  if (status === 'delivered') {
    return (
      <svg className="w-4 h-3 inline-block text-indigo-200" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 5.5L8.5 9L15 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
  }
  if (status === 'failed') {
    return <span className="text-rose-300">⚠</span>;
  }
  // sent (single tick)
  return (
    <svg className="w-4 h-3 inline-block text-indigo-200" viewBox="0 0 16 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}

const WABotInbox: React.FC<WABotInboxProps> = ({ managerId, customers, onOpenReceiptGenerator, botName, onUpdateBotName, routerCatalog, onUpdateRouterCatalog, botTemplates, onUpdateBotTemplates }) => {
  // WABot has its own theme, independent of the manager dashboard's dark/light
  // toggle, saved separately so it's remembered across visits. Defaults to
  // light (matching the brand look), but the eye-comfort toggle below lets it
  // go dark. We strip/restore the dashboard's own .dark class on mount/unmount
  // so leaving WABot doesn't leave the rest of the dashboard in the wrong mode.
  const [wabotDark, setWabotDark] = useState<boolean>(() => {
    try { return localStorage.getItem('wabot_theme') === 'dark'; } catch { return false; }
  });

  useEffect(() => {
    const hadDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', wabotDark);
    return () => { document.documentElement.classList.toggle('dark', hadDark); };
  }, [wabotDark]);

  const toggleWabotTheme = () => {
    setWabotDark(prev => {
      const next = !prev;
      try { localStorage.setItem('wabot_theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  };

  const [allMessages, setAllMessages] = useState<WAMessage[]>([]);
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
  const [botNameInput, setBotNameInput] = useState(botName || 'MYISP-BOT');
  useEffect(() => { setBotNameInput(botName || 'MYISP-BOT'); }, [botName]);

  // ── Training (Confused Replies) tab state ──
  const [view, setView] = useState<'inbox' | 'training' | 'catalog' | 'templates'>('inbox');
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // ── Router Catalog tab state (admin-editable, drives what Ayesha shows on WhatsApp) ──
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
  const [templatesState, setTemplatesState] = useState<Record<string, BotTemplate>>(botTemplates || {});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingTemplateKey, setEditingTemplateKey] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState('');

  useEffect(() => {
    if (botTemplates && Object.keys(botTemplates).length > 0) setTemplatesState(botTemplates);
  }, [botTemplates]);

  const templatesByCategory = useMemo(() => {
    const groups: Record<string, Array<[string, BotTemplate]>> = {};
    for (const [key, item] of Object.entries(templatesState) as [string, BotTemplate][]) {
      const cat = item.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push([key, item]);
    }
    for (const cat of Object.keys(groups)) groups[cat].sort((a, b) => a[1].label.localeCompare(b[1].label));
    return groups;
  }, [templatesState]);

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
    setTemplateDraft(templatesState[key]?.text || '');
  };

  const saveTemplateEdit = (key: string) => {
    const next = { ...templatesState, [key]: { ...templatesState[key], text: templateDraft } };
    setTemplatesState(next);
    onUpdateBotTemplates?.(next);
    setEditingTemplateKey(null);
  };

  const loadKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const { data } = await supabase
        .from('ayesha_knowledge')
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
        .from('ayesha_knowledge')
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
      await supabase.from('ayesha_knowledge').delete().eq('id', id);
      setKnowledge(prev => prev.filter(k => k.id !== id));
    } catch (e) {
      console.error('[WABotInbox] deleteKnowledge', e);
    }
  };

  const revertKnowledge = async (id: string) => {
    try {
      await supabase.from('ayesha_knowledge').update({ tags: ['unreviewed'] }).eq('id', id);
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
      const { data: msgs } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false })
        .limit(500);
      setAllMessages(msgs || []);

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
    const byPhone = new Map<string, WAMessage[]>();
    for (const m of allMessages) {
      const list = byPhone.get(m.customer_phone) || [];
      list.push(m);
      byPhone.set(m.customer_phone, list);
    }
    const list: Conversation[] = [];
    for (const [phone, msgs] of byPhone) {
      const sorted = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const last = sorted[0];
      const unread = sorted.filter(m => m.direction === 'in' && !m.is_read).length;
      const cust = customerByPhone.get(phone);
      list.push({
        phone,
        name: contactNames[phone] || cust?.name || `+92${phone}`,
        username: cust?.username,
        userId: cust?.id,
        lastMessage: last?.content || '',
        lastType: last?.type || 'text',
        lastTime: last?.created_at || '',
        unreadCount: unread,
        paused: pausedPhones.includes(phone),
      });
    }
    return list
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
      .sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  }, [allMessages, customerByPhone, pausedPhones, contactNames, search]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  const openConversation = useCallback(async (phone: string) => {
    setSelectedPhone(phone);
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

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: `92${selectedPhone}`, body, managerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Message send nahi hua: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
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
      await supabase
        .from('whatsapp_configs')
        .update({ paused_phones: next })
        .eq('manager_id', managerId);
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
      const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, outBlob, { contentType: outMime });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
      const mediaUrl = pub.publicUrl;
      const optimistic: WAMessage = {
        id: `temp-${Date.now()}`, manager_id: managerId, customer_phone: selectedPhone,
        direction: 'out', type: 'audio', content: mediaUrl, media_url: mediaUrl,
        flagged_payment_proof: false, is_read: true, status: 'sent', created_at: new Date().toISOString(),
      };
      setThread(prev => [...prev, optimistic]);
      const res = await fetch('/api/wabot-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: `92${selectedPhone}`, managerId, type: 'audio', mediaUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Voice message send nahi hua: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
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
    try {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const sendType: 'image' | 'video' | 'document' = isImage ? 'image' : isVideo ? 'video' : 'document';
      const folder = isImage ? 'admin-images' : isVideo ? 'admin-videos' : 'admin-documents';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${folder}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
      const mediaUrl = pub.publicUrl;
      const optimistic: WAMessage = {
        id: `temp-${Date.now()}`, manager_id: managerId, customer_phone: selectedPhone,
        direction: 'out', type: sendType, content: mediaUrl, media_url: mediaUrl,
        flagged_payment_proof: false, is_read: true, status: 'sent', created_at: new Date().toISOString(),
      };
      setThread(prev => [...prev, optimistic]);
      const res = await fetch('/api/wabot-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: `92${selectedPhone}`, managerId, type: sendType, mediaUrl, filename: sendType === 'document' ? file.name : undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`File send nahi hua: ${err?.error || 'unknown error'}`);
      }
      if (!pausedPhones.includes(selectedPhone)) setPausedPhones(prev => [...prev, selectedPhone]);
    } catch (e: any) {
      alert('File upload nahi hua: ' + (e?.message || ''));
    } finally {
      setUploading(false);
      loadOverview();
    }
  };

  const saveBotName = () => {
    const name = botNameInput.trim() || 'MYISP-BOT';
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
      className="flex flex-col h-full min-h-0 gap-3 p-3 rounded-[2rem]"
      style={{ background: wabotDark ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : 'linear-gradient(135deg, #F0F4F8 0%, #E6EBF0 100%)' }}
    >
      {/* ── Tab toggle + Receipt/Pause + Bot Name setting ── */}
      <div className="flex gap-2 flex-shrink-0 items-center flex-wrap">
        <button
          onClick={() => setView('inbox')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${view === 'inbox' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          Inbox
        </button>
        <button
          onClick={() => setView('training')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all relative ${view === 'training' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 21 12.083 12.083 0 015.84 10.578L12 14zm0 0v7" /></svg>
          Training
          {unreviewedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{unreviewedCount}</span>
          )}
        </button>

        <button
          onClick={() => setView('catalog')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${view === 'catalog' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
          Catalog
        </button>

        <button
          onClick={() => setView('templates')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${view === 'templates' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Templates
        </button>

        <button
          onClick={toggleWabotTheme}
          title={wabotDark ? 'Light mode' : 'Dark mode (eye comfort)'}
          className="ml-auto w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-white dark:bg-[#0f172a] text-slate-500 dark:text-amber-300 border border-slate-200 dark:border-white/5 active:scale-95 transition-all"
        >
          {wabotDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M12 7a5 5 0 100 10 5 5 0 000-10z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" /></svg>
          )}
        </button>

        {view === 'inbox' && selectedConv && (
          <>
            <button
              onClick={() => onOpenReceiptGenerator?.(selectedConv.userId)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-[#0f172a] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Receipt
            </button>
            <button
              onClick={togglePause}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedConv.paused ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}
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

        {!selectedConv && (
          <div className="ml-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bot Name</span>
            {editingBotName ? (
              <>
                <input
                  autoFocus
                  value={botNameInput}
                  onChange={e => setBotNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBotName()}
                  className="w-28 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white"
                />
                <button onClick={saveBotName} className="px-3 py-1 bg-emerald-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest">Save</button>
              </>
            ) : (
              <button onClick={() => setEditingBotName(true)} className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">
                {botNameInput}
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'training' ? (
        <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-y-auto p-6">
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
                  <div key={k.id} className={`p-5 rounded-2xl border ${isUnreviewed ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5' : 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isUnreviewed ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
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
                        className="w-full mt-2 p-3 rounded-xl bg-white dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold whitespace-pre-wrap">A: {k.answer}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {isEditing ? (
                        <>
                          <button onClick={() => approveKnowledge(k, editText)} className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Save & Approve</button>
                          <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                        </>
                      ) : (
                        <>
                          {isUnreviewed ? (
                            <>
                              <button onClick={() => approveKnowledge(k, k.answer)} className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">✓ Approve As-Is</button>
                              <button onClick={() => { setEditingId(k.id); setEditText(k.answer); }} className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">✏ Edit & Approve</button>
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
        <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-y-auto p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Router Catalog</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Yahan se router models, price, specs aur image edit karein — Ayesha WhatsApp par yehi catalog dikhati hai, code edit ki koi zaroorat nahi.</p>
          </div>

          {(['2.4g', '5g'] as const).map(band => (
            <div key={band} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{band === '2.4g' ? '2.4G Routers' : '5G Routers'}</h4>
                <button
                  onClick={() => openAddRouter(band)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest"
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
                      <button onClick={() => openEditRouter(band, r)} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
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
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-4">{catalogModal.item ? 'Edit Router' : 'Naya Router Add Karein'} — {catalogModal.band === '2.4g' ? '2.4G' : '5G'}</h3>
                <div className="space-y-3">
                  <input placeholder="Model (jese GS3101)" value={catalogForm.model} onChange={e => setCatalogForm(f => ({ ...f, model: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Company (jese Huawei)" value={catalogForm.company} onChange={e => setCatalogForm(f => ({ ...f, company: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Band label (jese 2.4GHz Single Band)" value={catalogForm.band} onChange={e => setCatalogForm(f => ({ ...f, band: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Price (Rs.)" type="number" value={catalogForm.price} onChange={e => setCatalogForm(f => ({ ...f, price: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <input placeholder="Image URL" value={catalogForm.image} onChange={e => setCatalogForm(f => ({ ...f, image: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-bold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                  <textarea placeholder="Specs — yeh exact text customer ko WhatsApp par jayega" rows={7} value={catalogForm.specs} onChange={e => setCatalogForm(f => ({ ...f, specs: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white placeholder-slate-400" />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={saveCatalogModal} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">Save</button>
                  <button onClick={() => setCatalogModal(null)} className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-xs uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'templates' ? (
        <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-y-auto p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Reply Templates</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Ayesha ke har reply ki wording yahan se edit karein — koi code deploy ki zaroorat nahi. {'{curly_braces}'} wale tokens na hatayen, woh customer ka naam/amount/etc. se fill hote hain.</p>
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
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                          <svg className="w-4 h-4 flex-shrink-0 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {editingTemplateKey === key && (
                          <div className="mt-3">
                            <textarea
                              rows={Math.min(12, Math.max(3, templateDraft.split('\n').length + 1))}
                              value={templateDraft}
                              onChange={e => setTemplateDraft(e.target.value)}
                              className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#030712] border border-slate-200 dark:border-white/10 text-sm font-semibold outline-none text-slate-900 dark:text-white"
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => saveTemplateEdit(key)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Save</button>
                              <button onClick={() => setEditingTemplateKey(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
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
        </div>
      ) : (
    <div className="flex flex-1 gap-4 min-h-0">
      {/* ── Chat list — full width on mobile until a chat is opened, fixed sidebar on desktop ── */}
      <div className={`${selectedPhone ? 'hidden sm:flex' : 'flex'} w-full sm:w-[340px] flex-shrink-0 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm flex-col overflow-hidden`}>
        <div className="p-5 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">MYISP WABot</h3>
            {totalUnread > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full">{totalUnread}</span>
            )}
          </div>
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 text-sm font-bold outline-none text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-10">Koi WhatsApp conversation nahi hai abhi.</p>
          ) : (
            conversations.map(c => (
              <button
                key={c.phone}
                onClick={() => openConversation(c.phone)}
                className={`w-full text-left p-4 border-b border-slate-50 dark:border-white/5 flex items-center gap-3 transition-all ${selectedPhone === c.phone ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 ${c.paused ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-sm text-slate-900 dark:text-white truncate">{c.name}</p>
                    <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">{timeAgo(c.lastTime)}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold truncate">
                    {typePreview(c.lastType) || c.lastMessage}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{c.unreadCount}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Thread — takes over full screen on mobile when a chat is open ── */}
      <div className={`${selectedPhone ? 'flex' : 'hidden sm:flex'} flex-1 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm flex-col overflow-hidden`}>
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 font-bold">
            Koi conversation select karein
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="sm:hidden p-2 -ml-2 text-slate-500 dark:text-slate-300 flex-shrink-0"
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
                        className="text-sm font-black bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 outline-none text-slate-900 dark:text-white w-36"
                      />
                      <button onClick={saveContactName} className="text-emerald-500 flex-shrink-0" aria-label="Save">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      </button>
                      <button onClick={() => setEditingContactName(false)} className="text-slate-400 flex-shrink-0" aria-label="Cancel">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setContactNameInput(contactNames[selectedConv.phone] || ''); setEditingContactName(true); }}
                      className="flex items-center gap-1.5 group"
                      title="Contact ka naam edit karein"
                    >
                      <p className="font-black text-slate-900 dark:text-white truncate">{selectedConv.name}</p>
                      <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-500 group-hover:text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  <p className="text-xs text-slate-400 font-bold truncate">+92{selectedConv.phone}{selectedConv.username ? ` • @${selectedConv.username}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" />
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-black/20">
              {thread.map(m => {
                const mediaSrc = m.media_url || (m.content?.startsWith('http') ? m.content : null);
                const hasTranslation = !!m.translated_content && m.translated_content !== m.content;
                const isPlaceholderText = m.content === '[voice note — transcription unavailable]';
                return (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm font-semibold ${m.direction === 'out' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-white/10 text-slate-900 dark:text-white rounded-bl-sm border border-slate-100 dark:border-white/5'}`}>
                      {m.type === 'image' && mediaSrc ? (
                        <a href={mediaSrc} target="_blank" rel="noreferrer">
                          <img src={mediaSrc} alt="attachment" className="rounded-xl max-w-[220px] mb-1" />
                        </a>
                      ) : m.type === 'video' && mediaSrc ? (
                        <video controls src={mediaSrc} className="rounded-xl max-w-[220px] mb-1" />
                      ) : m.type === 'document' && mediaSrc ? (
                        <a href={mediaSrc} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline mb-1">
                          📄 Document dekhein
                        </a>
                      ) : m.type === 'audio' || m.type === 'voice' ? (
                        <div>
                          {mediaSrc && <audio controls src={mediaSrc} className="max-w-[220px] mb-1.5" />}
                          {m.content && !isPlaceholderText && !m.content.startsWith('http') && (
                            <p className="whitespace-pre-wrap break-words text-[13px] opacity-90">
                              {showTranslated[m.id] && hasTranslation ? m.translated_content : m.content}
                            </p>
                          )}
                          {isPlaceholderText && <p className="whitespace-pre-wrap break-words text-[13px] opacity-70 italic">{m.content}</p>}
                          {hasTranslation && (
                            <button
                              onClick={() => setShowTranslated(p => ({ ...p, [m.id]: !p[m.id] }))}
                              className={`text-[10px] underline mt-0.5 ${m.direction === 'out' ? 'text-indigo-200' : 'text-indigo-500 dark:text-indigo-300'}`}
                            >
                              {showTranslated[m.id] ? '🌐 Asal text dekhein' : '🌐 Translate'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      )}
                      <p className={`text-[10px] mt-1 font-bold flex items-center gap-1 ${m.direction === 'out' ? 'text-indigo-200 justify-end' : 'text-slate-400'}`}>
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
            <div className="p-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording}
                title="Photo, video ya document bhejein"
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 disabled:opacity-40 active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
              </button>

              {recording ? (
                <div className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-300 flex-1">
                    Recording... {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                  </span>
                  <button onClick={cancelRecording} className="text-xs font-black uppercase tracking-widest text-slate-400">Cancel</button>
                </div>
              ) : (
                <input
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="Type a message..."
                  disabled={uploading}
                  className="flex-1 min-w-0 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 text-sm font-semibold outline-none text-slate-900 dark:text-white disabled:opacity-50"
                />
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
                  className="px-6 py-3.5 bg-indigo-600 disabled:opacity-40 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  Send
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={uploading}
                  title="Voice message"
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-indigo-600 disabled:opacity-40 text-white active:scale-95 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
      )}
    </div>
  );
};

export default WABotInbox;
