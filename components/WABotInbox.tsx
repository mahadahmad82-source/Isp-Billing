import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UserRecord } from '../types';
import { supabase } from '../lib/supabase';

interface WAMessage {
  id: string;
  manager_id: string;
  customer_phone: string;
  direction: 'in' | 'out';
  type: 'text' | 'image' | 'audio' | 'voice' | 'document';
  content: string | null;
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

interface WABotInboxProps {
  managerId: string;
  customers: UserRecord[];
  onOpenReceiptGenerator?: (userId?: string) => void;
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

const WABotInbox: React.FC<WABotInboxProps> = ({ managerId, customers, onOpenReceiptGenerator }) => {
  const [allMessages, setAllMessages] = useState<WAMessage[]>([]);
  const [pausedPhones, setPausedPhones] = useState<string[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [thread, setThread] = useState<WAMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-slate-400 dark:text-slate-500 font-bold">
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[500px] gap-4">
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
                    {c.lastType === 'image' ? '📷 Photo' : c.lastType === 'audio' ? '🎤 Voice note' : c.lastMessage}
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
              {thread.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm font-semibold ${m.direction === 'out' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-white/10 text-slate-900 dark:text-white rounded-bl-sm border border-slate-100 dark:border-white/5'}`}>
                    {m.type === 'image' && m.content ? (
                      <a href={m.content} target="_blank" rel="noreferrer">
                        <img src={m.content} alt="attachment" className="rounded-xl max-w-[220px] mb-1" />
                      </a>
                    ) : m.type === 'audio' && m.content?.startsWith('http') ? (
                      <audio controls src={m.content} className="max-w-[220px]" />
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
              ))}
              <div ref={threadEndRef} />
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-3">
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                placeholder="Type a message..."
                className="flex-1 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 text-sm font-semibold outline-none text-slate-900 dark:text-white"
              />
              <button
                onClick={handleSend}
                disabled={sending || !inputText.trim()}
                className="px-6 py-3.5 bg-indigo-600 disabled:opacity-40 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WABotInbox;
