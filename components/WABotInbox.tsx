import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserRecord } from '../types';
import { supabase } from '../lib/supabase';

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
}

const POLL_MS = 15000;

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

const WABotInbox: React.FC<WABotInboxProps> = ({ managerId, customers, onOpenReceiptGenerator, botName, onUpdateBotName }) => {
  const [allMessages, setAllMessages] = useState<WAMessage[]>([]);
  const [pausedPhones, setPausedPhones] = useState<string[]>([]);
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
  const [botNameInput, setBotNameInput] = useState(botName || 'Ayesha');
  useEffect(() => { setBotNameInput(botName || 'Ayesha'); }, [botName]);

  // ── Training (Confused Replies) tab state ──
  const [view, setView] = useState<'inbox' | 'training'>('inbox');
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

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
        .select('paused_phones')
        .eq('manager_id', managerId)
        .maybeSingle();
      setPausedPhones(cfg?.paused_phones || []);
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
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [managerId]);

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
        name: cust?.name || `+92${phone}`,
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
  }, [allMessages, customerByPhone, pausedPhones, search]);

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + c.unreadCount, 0), [conversations]);

  const openConversation = useCallback(async (phone: string) => {
    setSelectedPhone(phone);
    try {
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('manager_id', managerId)
        .eq('customer_phone', phone)
        .order('created_at', { ascending: true })
        .limit(150);
      setThread(data || []);

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

  const sendRecordedAudio = async (blob: Blob, mimeType: string) => {
    if (!selectedPhone) return;
    setUploading(true);
    try {
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      const path = `admin-voice/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, blob, { contentType: mimeType });
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
    const name = botNameInput.trim() || 'Ayesha';
    setBotNameInput(name);
    setEditingBotName(false);
    onUpdateBotName?.(name);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-slate-400 dark:text-slate-500 font-bold">
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[540px] gap-3">
      {/* ── Tab toggle + Bot Name setting ── */}
      <div className="flex gap-2 flex-shrink-0 items-center flex-wrap">
        <button
          onClick={() => setView('inbox')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${view === 'inbox' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          💬 Inbox
        </button>
        <button
          onClick={() => setView('training')}
          className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all relative ${view === 'training' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}
        >
          🎓 Training
          {unreviewedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">{unreviewedCount}</span>
          )}
        </button>

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
              {botNameInput} <span className="text-xs">✏️</span>
            </button>
          )}
        </div>
      </div>

      {view === 'training' ? (
        <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm overflow-y-auto p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-black dark:text-white uppercase tracking-tight">Confused Replies / Training</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">Jab Ayesha ko deterministic jawab nahi milta, woh AI se reply karti hai aur yahan log hota hai. Acha jawab "Approve" kar do — wahi wording aage bhi use hogi.</p>
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
                  <p className="font-black text-slate-900 dark:text-white truncate">{selectedConv.name}</p>
                  <p className="text-xs text-slate-400 font-bold truncate">+92{selectedConv.phone}{selectedConv.username ? ` • @${selectedConv.username}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onOpenReceiptGenerator?.(selectedConv.userId)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                >
                  🧾 Receipt
                </button>
                <button
                  onClick={togglePause}
                  className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${selectedConv.paused ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}
                >
                  {selectedConv.paused ? '▶ Resume' : '⏸ Pause'}
                </button>
              </div>
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
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 disabled:opacity-40 active:scale-95 transition-all text-lg"
              >
                📎
              </button>

              {recording ? (
                <div className="flex-1 flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
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
                  className="flex-1 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 text-sm font-semibold outline-none text-slate-900 dark:text-white disabled:opacity-50"
                />
              )}

              {recording ? (
                <button
                  onClick={stopRecording}
                  className="px-6 py-3.5 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all flex-shrink-0"
                >
                  ⏹ Send
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
                  className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl bg-indigo-600 disabled:opacity-40 text-white active:scale-95 transition-all text-lg"
                >
                  🎤
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
