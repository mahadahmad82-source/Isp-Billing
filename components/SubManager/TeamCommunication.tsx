import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SubManagerAccount, TeamMessage } from '../../types';
import { supabase } from '../../lib/supabase';

interface TeamCommunicationProps {
  managerId: string;
  managerUsername: string;
  currentUsername: string;
  currentRole: 'manager' | 'sub-manager';
  subManagers: SubManagerAccount[];
  messages: TeamMessage[];
  onSend: (message: TeamMessage) => void | Promise<boolean | void>;
  onRefresh?: () => Promise<void> | void;
}

const pickMimeType = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return '';
};

const TeamCommunication: React.FC<TeamCommunicationProps> = ({
  managerId, managerUsername, currentUsername, currentRole, subManagers, messages, onSend, onRefresh,
}) => {
  const [recipient, setRecipient] = useState(subManagers[0]?.username || '');
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<TeamMessage[]>([]);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const refreshRef = useRef(onRefresh);

  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!managerId || !onRefresh) return;
    let mounted = true;
    let inFlight = false;
    const pullLatest = () => {
      if (!mounted || inFlight || !refreshRef.current) return;
      inFlight = true;
      Promise.resolve(refreshRef.current()).catch(() => {}).finally(() => { inFlight = false; });
    };
    pullLatest();
    const channel = supabase
      .channel(`team-chat-${managerId}-${currentUsername}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'manager_data', filter: `manager_id=eq.${managerId}` }, pullLatest)
      .subscribe();
    const fallback = window.setInterval(pullLatest, 15000);
    return () => {
      mounted = false;
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [managerId, currentUsername, onRefresh]);

  const targetUsername = currentRole === 'manager' ? recipient : managerUsername;
  useEffect(() => {
    if (currentRole === 'manager' && (!recipient || !subManagers.some(agent => agent.username === recipient))) {
      setRecipient(subManagers[0]?.username || '');
    }
  }, [currentRole, recipient, subManagers]);
  const visibleMessages = useMemo(() => {
    const byId = new Map<string, TeamMessage>();
    [...optimisticMessages, ...(messages || [])].forEach(message => byId.set(message.id, message));
    return Array.from(byId.values())
      .filter(message => message.managerUsername === managerUsername)
      .filter(message => currentRole === 'sub-manager'
        ? (message.senderUsername === currentUsername || message.recipientUsername === currentUsername)
        : (!recipient || message.senderUsername === recipient || message.recipientUsername === recipient))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [currentRole, currentUsername, managerUsername, messages, optimisticMessages, recipient]);

  useEffect(() => {
    const delivered = new Set((messages || []).map(message => message.id));
    if (delivered.size > 0) setOptimisticMessages(previous => previous.filter(message => !delivered.has(message.id)));
  }, [messages]);

  useEffect(() => {
    const node = messageScrollRef.current;
    if (!node) return;
    requestAnimationFrame(() => node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' }));
  }, [visibleMessages.length, recipient]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const sendMessage = async (message: Pick<TeamMessage, 'text' | 'voiceUrl' | 'voiceMimeType'>): Promise<boolean> => {
    if (!targetUsername || (!message.text && !message.voiceUrl) || sending) return false;
    const nextMessage: TeamMessage = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      managerUsername,
      senderUsername: currentUsername,
      senderRole: currentRole,
      recipientUsername: targetUsername,
      createdAt: new Date().toISOString(),
      ...message,
    };
    setOptimisticMessages(previous => [...previous, nextMessage]);
    setSending(true);
    try {
      const sent = await Promise.resolve(onSend(nextMessage));
      if (sent === false) throw new Error('Team message could not be saved.');
      return true;
    } catch (error) {
      setOptimisticMessages(previous => previous.filter(item => item.id !== nextMessage.id));
      throw error;
    } finally {
      setSending(false);
    }
  };

  const handleTextSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await sendMessage({ text });
    } catch (error: any) {
      setDraft(text);
      alert(error?.message || 'Team message save nahi hua.');
    }
  };

  const startRecording = async () => {
    if (!targetUsername || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!blob.size) return;
        setUploading(true);
        try {
          const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
          const path = `team-voice/${managerId}/${Date.now()}.${extension}`;
          const { error } = await supabase.storage.from('whatsapp-media').upload(path, blob, {
            contentType: blob.type || 'audio/webm',
            cacheControl: '31536000',
          });
          if (error) throw error;
          const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
          const sent = await sendMessage({ voiceUrl: data.publicUrl, voiceMimeType: blob.type || 'audio/webm' });
          if (!sent) alert('Voice note save nahi hui.');
        } catch (error: any) {
          alert(`Voice note upload nahi hua: ${error?.message || 'Unknown error'}`);
        } finally {
          setUploading(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert('Microphone permission allow karein, phir dobara try karein.');
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Team Communication</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Private manager and sub-manager channel</p>
          </div>
          {currentRole === 'manager' ? (
            <select value={recipient} onChange={event => setRecipient(event.target.value)} className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-xs font-bold outline-none">
              <option value="">Select team member</option>
              {subManagers.map(agent => <option key={agent.id} value={agent.username}>{agent.name} (@{agent.username})</option>)}
            </select>
          ) : (
            <span className="px-4 py-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs font-bold">Manager: @{managerUsername}</span>
          )}
        </div>

          <div ref={messageScrollRef} className="min-h-[280px] max-h-[48vh] overflow-y-auto scroll-smooth space-y-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] p-4 border border-slate-100 dark:border-white/5">
          {visibleMessages.length === 0 ? (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-slate-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mb-3"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h8M8 14h5"/></svg>
              <p className="text-xs font-bold uppercase tracking-widest">No messages yet</p>
            </div>
          ) : visibleMessages.map(message => {
            const mine = message.senderUsername === currentUsername;
            const isSending = optimisticMessages.some(item => item.id === message.id);
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>@{message.senderUsername}</p>
                  {message.text && <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>}
                  {message.voiceUrl && <audio controls preload="metadata" src={message.voiceUrl} className="w-full max-w-[240px] h-9 mt-1" />}
                  <p className={`text-[9px] mt-2 ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>{isSending ? 'Sending…' : new Date(message.createdAt).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleTextSubmit} className="mt-4 flex items-center gap-2">
          <input value={draft} onChange={event => setDraft(event.target.value)} disabled={!targetUsername || recording || uploading || sending} placeholder={targetUsername ? 'Write an internal message...' : 'Select a team member first'} className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="button" onClick={recording ? stopRecording : startRecording} disabled={!targetUsername || uploading} className={`p-3 rounded-xl text-white transition-all ${recording ? 'bg-rose-600' : 'bg-slate-700 hover:bg-slate-800'} disabled:opacity-50`} title={recording ? 'Stop recording' : 'Record voice note'}>
            {recording ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/></svg>}
          </button>
          <button type="submit" disabled={!draft.trim() || !targetUsername || recording || uploading || sending} className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" title="Send message">
            {sending ? <span className="text-[10px] font-black">…</span> :             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
          </button>
        </form>
        {uploading && <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-2">Uploading voice note...</p>}
      </div>
    </div>
  );
};

export default TeamCommunication;
