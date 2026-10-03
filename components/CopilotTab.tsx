import React, { useRef, useEffect } from 'react';
import { useCopilot, type UseCopilotOptions } from '../hooks/useCopilot';
import { CopilotIcon, MicIcon, SendIcon, SpeakerIcon, LoopIcon } from './CopilotIcons';

// Full-screen Copilot conversation space (the "Copilot" tab). Shares the
// exact same logic, history, backend, voice input, confirm-gated actions and
// receipt bridge as the floating CopilotBar widget via useCopilot — the two
// stay in sync through the parent's copilotHistory and are never on screen
// at the same time. No financial context is fed to any AI call here.
export default function CopilotTab(props: UseCopilotOptions) {
  const c = useCopilot(props);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }); }, [c.log, c.pending]);

  return (
    <div className="animate-in fade-in duration-200 max-w-3xl mx-auto pb-24">
      <div className="bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-hidden flex flex-col" style={{ minHeight: '70vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-7 py-4 bg-[var(--nb-header)] border-b border-[var(--nb-border)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-[var(--nb-accent-soft)] text-[var(--nb-accent)] rounded-2xl flex items-center justify-center"><CopilotIcon className="w-6 h-6" /></span>
            <div>
              <h3 className="text-[17px] font-semibold tracking-tight text-[var(--nb-text-1)]">Copilot</h3>
              <p className="text-[10px] font-bold text-[var(--nb-text-2)] uppercase tracking-widest">Ask anything, command everything</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={c.toggleHandsFree} aria-label="Hands-free mode" title="Hands-free" className={(c.handsFree ? 'text-[var(--nb-accent)]' : 'text-[var(--nb-text-2)]') + ' min-w-[44px] min-h-[44px] flex items-center justify-center'}><LoopIcon /></button>
            <button onClick={c.toggleVoiceReply} aria-label="Voice reply" title="Voice reply" className={(c.voiceReply ? 'text-[var(--nb-accent)]' : 'text-[var(--nb-text-2)]') + ' min-w-[44px] min-h-[44px] flex items-center justify-center'}><SpeakerIcon off={!c.voiceReply} /></button>
          </div>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto px-5 md:px-7 py-5 space-y-3 text-sm" style={{ minHeight: '40vh' }}>
          {c.log.length === 0 && (
            <div className="text-[var(--nb-text-3)] text-xs leading-relaxed space-y-2 py-4">
              <p className="font-bold text-[var(--nb-text-2)] uppercase tracking-widest text-[10px]">Try asking</p>
              <p>"Open customer list" · "Ali ka balance batao" · "Sara ki receipt 1500 ki banao" · "Ali ko disable karo"</p>
              <p>Tap the mic to speak in Urdu, Roman Urdu or English. Enable hands-free for a continuous voice loop.</p>
            </div>
          )}
          {c.log.map((entry, i) => (
            <div key={i} className={entry.from === 'user' ? 'text-right' : 'text-left'}>
              <span className={`inline-block px-3 py-2 rounded-xl max-w-[75%] text-left ${entry.from === 'user' ? 'bg-[var(--nb-bubble-out)] text-[var(--nb-text-1)]' : 'bg-[var(--nb-bubble-in)] text-[var(--nb-text-1)]'}`}>
                {entry.text}
              </span>
            </div>
          ))}
          {c.pending && (
            <div className="flex gap-2 pt-1">
              <button onClick={c.confirmPending} className="px-5 min-h-[44px] rounded-full bg-[var(--nb-accent)] text-white text-xs font-black uppercase tracking-widest">Confirm</button>
              <button onClick={c.cancelPending} className="px-5 min-h-[44px] rounded-full bg-[var(--nb-surface-3)] text-[var(--nb-text-1)] text-xs font-black uppercase tracking-widest">Cancel</button>
            </div>
          )}
          {c.busy && <p className="text-[var(--nb-text-3)] text-xs">Thinking...</p>}
          {c.listening && <p className="text-[var(--nb-danger)] text-xs animate-pulse">Listening...</p>}
          {c.transcribing && <p className="text-[var(--nb-text-3)] text-xs">Transcribing...</p>}
          <div ref={logEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 md:px-6 py-4 border-t border-[var(--nb-border)] shrink-0">
          <input
            value={c.input}
            onChange={(e) => c.setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') c.runCommand(c.input); }}
            placeholder="Type a command..."
            className="flex-1 min-w-0 px-4 min-h-[44px] rounded-full border border-[var(--nb-border)] bg-[var(--nb-surface-1)] text-[var(--nb-text-1)] text-sm placeholder:text-[var(--nb-text-3)] focus:outline-none focus:border-[var(--nb-accent)]"
          />
          <button
            onClick={c.toggleMic}
            disabled={c.transcribing}
            aria-label="Voice"
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors shrink-0 disabled:opacity-40 ${c.listening ? 'bg-[var(--nb-danger)] text-white animate-pulse' : 'bg-[var(--nb-surface-3)] text-[var(--nb-text-2)]'}`}
          >
            <MicIcon />
          </button>
          <button
            onClick={() => c.runCommand(c.input)}
            disabled={c.busy || !c.input.trim()}
            aria-label="Send"
            className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--nb-accent)] text-white disabled:opacity-40 shrink-0"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
