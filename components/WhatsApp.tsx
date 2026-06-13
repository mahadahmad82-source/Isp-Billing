// components/WhatsApp.tsx — WhatsApp Integration Test Panel

import { useState } from 'react';
import { MessageCircle, Send, CheckCircle, XCircle, Phone, Loader2, Info } from 'lucide-react';

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

interface SendResult {
  success?: boolean;
  messageId?: string;
  to?: string;
  template?: string;
  error?: string;
  details?: any;
}

export default function WhatsApp() {
  const [toNumber, setToNumber] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');
  const [result, setResult] = useState<SendResult | null>(null);

  const handleSend = async () => {
    if (!toNumber.trim()) return;
    setStatus('sending');
    setResult(null);

    try {
      const response = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: toNumber.trim() }),
      });

      const data: SendResult = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setResult(data);
      } else {
        setStatus('error');
        setResult(data);
      }
    } catch (err: any) {
      setStatus('error');
      setResult({ error: err?.message || 'Network error — check your connection' });
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-8">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
          >
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">WhatsApp Integration</h1>
            <p className="text-slate-400 text-sm">Meta Cloud API — Template Sender</p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 mb-6 flex gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-semibold text-blue-300 mb-1">Development Mode</p>
            <p>
              In Dev Mode, you can only send to{' '}
              <span className="text-white font-medium">verified test numbers</span> added
              in your Meta Developer Portal. Enter with country code (e.g.{' '}
              <span className="font-mono text-blue-300">923042773453</span>).
            </p>
          </div>
        </div>

        {/* Send Card */}
        <div className="bg-slate-800/60 rounded-2xl border border-white/10 p-6 backdrop-blur-sm mb-4">
          <p className="text-sm text-slate-400 mb-4 font-medium">
            Send <span className="text-white">hello_world</span> template
          </p>

          {/* Phone Input */}
          <div className="relative mb-4">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Phone className="w-4 h-4 text-slate-500" />
            </div>
            <input
              type="tel"
              placeholder="923042773453  (with country code, no +)"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && status !== 'sending' && handleSend()}
              className="w-full bg-slate-700/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={status === 'sending' || !toNumber.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white"
            style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
          >
            {status === 'sending' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending via Meta API…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send hello_world Template
              </>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            className={`rounded-2xl border p-5 ${
              status === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-rose-500/10 border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              {status === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
              <span
                className={`font-semibold text-sm ${
                  status === 'success' ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {status === 'success' ? 'Message Sent Successfully!' : 'Failed to Send'}
              </span>
            </div>

            <div className="text-xs font-mono text-slate-400 bg-slate-900/50 rounded-xl p-3 overflow-auto max-h-48">
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>

            <button
              onClick={handleReset}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
            >
              Clear result
            </button>
          </div>
        )}

        {/* Env Vars Status */}
        <div className="mt-6 bg-slate-800/30 rounded-2xl border border-white/5 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Required Environment Variables
          </p>
          <div className="space-y-2">
            {[
              { key: 'WHATSAPP_TOKEN', hint: 'Your Meta Permanent Access Token' },
              { key: 'PHONE_NUMBER_ID', hint: 'Numeric ID from Meta Developer Portal' },
            ].map(({ key, hint }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-slate-300">{key}</span>
                  <p className="text-xs text-slate-600">{hint}</p>
                </div>
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                  Set in Vercel
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
