import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { BusinessType } from '../../types';
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, normalizeBusinessType } from '../../utils/businessType';
import { checkAdminSession } from './managersPanelUtils';

export interface CreateManagerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Fired after the server confirmed creation (host refreshes its list). */
  onCreated: (username: string) => void;
}

interface CreatedInfo {
  username: string;
  businessName: string;
  businessType: BusinessType;
  password: string;
  usesSyntheticEmail: boolean;
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';
const labelCls = 'text-[10px] font-bold text-[#64748b] dark:text-[#94a3b8] uppercase tracking-widest ml-1 mb-1 block';
const errCls = 'text-[11px] text-[#b91c1c] dark:text-[#f87171] font-semibold mt-1 ml-1';

const formatCnic = (raw: string) => {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 13);
  if (digits.length > 12) return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
};

// 10 chars, letters + digits, ambiguous 0/O/1/l excluded.
const generatePassword = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => alphabet[n % alphabet.length]).join('');
};

const copyText = async (text: string) => {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable: silently ignore */ }
};

export default function CreateManagerSheet({ open, onClose, onCreated }: CreateManagerSheetProps): React.JSX.Element | null {
  const [mode, setMode] = useState<'form' | 'success'>('form');
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cnic, setCnic] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [showCreatedPassword, setShowCreatedPassword] = useState(true);

  const resetForm = () => {
    setMode('form');
    setBusinessType(null); setBusinessName(''); setUsername(''); setPhone('');
    setEmail(''); setCnic(''); setPassword(''); setShowPassword(false);
    setErrors({}); setServerError(''); setBusy(false);
    setCreated(null); setShowCreatedPassword(true);
  };

  // Every opening starts fresh; the success screen (and its password) never
  // survives a close — it lives only in component state.
  useEffect(() => { if (open) resetForm(); }, [open ]);

  if (!open) return null;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!businessType) e.businessType = 'Choose a business type.';
    const bn = businessName.trim();
    if (bn.length < 2 || bn.length > 100) e.businessName = 'Business name must be 2–100 characters.';
    if (!/^[a-z0-9._-]{3,40}$/.test(username.trim())) e.username = '3–40 characters: a-z, 0-9, . _ - (no spaces).';
    if (phone.trim() && !/^[0-9+\- ]{7,20}$/.test(phone.trim())) e.phone = '7–20 characters: digits, +, - and spaces.';
    const em = email.trim().toLowerCase();
    if (em && (!em.includes('@') || em.endsWith('@myisp.local'))) e.email = 'Enter a valid email address.';
    const cnicDigits = cnic.replace(/[^0-9]/g, '');
    if (cnicDigits && cnicDigits.length !== 13) e.cnic = 'CNIC must be 13 digits (XXXXX-XXXXXXX-X).';
    if (password.length < 6 || password.length > 72) e.password = 'Password must be 6–72 characters.';
    return e;
  };

  const submit = async () => {
    if (busy) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setServerError('');
    const sessionErr = await checkAdminSession();
    if (sessionErr) { setServerError(sessionErr); setBusy(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) { setServerError('Session expired, please login again.'); setBusy(false); return; }
      const body: Record<string, string> = {
        username: username.trim().toLowerCase(),
        password,
        business_name: businessName.trim(),
        business_type: businessType as string,
      };
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim().toLowerCase();
      const cnicDigits = cnic.replace(/[^0-9]/g, '');
      if (cnicDigits) body.cnic = cnicDigits;
      const res = await fetch('/api/admin-maintenance?action=admin-create-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setServerError('Session expired, please login again.');
        return;
      }
      if (!res.ok || !result?.success) {
        setServerError(typeof result?.error === 'string' && result.error
          ? result.error
          : 'Account could not be created. Try again.');
        return;
      }
      setCreated({
        username: String(result.username || body.username),
        businessName: body.business_name,
        businessType: normalizeBusinessType(result.business_type),
        password,
        usesSyntheticEmail: result.uses_synthetic_email === true,
      });
      setMode('success');
      onCreated(String(result.username || body.username));
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Account could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const credentialsText = () => {
    if (!created) return '';
    return [
      'BillCollector account created',
      `Business: ${created.businessName}`,
      `Type: ${BUSINESS_TYPE_LABELS[created.businessType]}`,
      `Username: ${created.username}`,
      `Password: ${created.password}`,
      'Login with username + password at the normal login page.',
    ].join('\n');
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Create account">
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div className="absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto md:w-[420px] max-h-[92dvh] md:max-h-none overflow-y-auto rounded-t-[2rem] md:rounded-l-[2rem] md:rounded-tr-none bg-white dark:bg-[#0f172a] border-t md:border-t-0 md:border-l border-[#e2e8f0] dark:border-white/10 p-5 pb-8">
        <div className="w-10 h-1 rounded-full bg-[#e2e8f0] dark:bg-white/15 mx-auto mb-4 md:hidden" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-black text-[#0f172a] dark:text-white">
              {mode === 'form' ? 'Create Account' : 'Account created'}
            </h2>
            <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold">
              {mode === 'form' ? 'New manager account with login access' : `@${created?.username}`}
            </p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#475569] dark:text-[#94a3b8] flex items-center justify-center shrink-0">
            <IconClose />
          </button>
        </div>

        {mode === 'form' ? (
          <div>
            {serverError && (
              <div className="text-xs font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
                {serverError}
              </div>
            )}

            <span className={labelCls}>Business type *</span>
            <div className="grid grid-cols-2 gap-2 mb-1">
              {BUSINESS_TYPES.map(t => {
                const sel = businessType === t;
                const isIsp = t === 'isp';
                return (
                  <button key={t} type="button" aria-pressed={sel}
                    onClick={() => { setBusinessType(t); setErrors(prev => ({ ...prev, businessType: '' })); }}
                    className={`min-h-[52px] rounded-2xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors ${sel
                      ? isIsp
                        ? 'border-[#3b82f6] bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
                        : 'border-[#14b8a6] bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]'
                      : 'border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
                    {isIsp ? <IconWifi /> : <IconDrop />}{isIsp ? 'ISP' : 'Water'}
                  </button>
                );
              })}
            </div>
            {errors.businessType && <p className={errCls}>{errors.businessType}</p>}

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-business-name">Business name *</label>
              <input id="cm-business-name" type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. AquaFresh Water" autoComplete="off" className={inputCls} />
              {errors.businessName && <p className={errCls}>{errors.businessName}</p>}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-username">Username *</label>
              <input id="cm-username" type="text" value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                placeholder="e.g. aquafresh" autoComplete="off" autoCapitalize="off" spellCheck={false} className={inputCls} />
              <p className="text-[11px] text-[#94a3b8] ml-1 mt-1">3–40 characters: a-z, 0-9, . _ - (no spaces). This is the login ID.</p>
              {errors.username && <p className={errCls}>{errors.username}</p>}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-phone">Phone</label>
              <input id="cm-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 03001234567" autoComplete="off" className={inputCls} />
              {errors.phone && <p className={errCls}>{errors.phone}</p>}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-email">Email (optional)</label>
              <input id="cm-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="owner@example.com" autoComplete="off" autoCapitalize="off" spellCheck={false} className={inputCls} />
              <p className="text-[11px] text-[#94a3b8] ml-1 mt-1">Leave empty if the owner has no email. Password recovery by email will not work without one; admin can reset the password.</p>
              {errors.email && <p className={errCls}>{errors.email}</p>}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-cnic">CNIC (optional)</label>
              <input id="cm-cnic" type="text" value={cnic} onChange={e => setCnic(formatCnic(e.target.value))}
                placeholder="XXXXX-XXXXXXX-X" inputMode="numeric" autoComplete="off" className={inputCls} />
              {errors.cnic && <p className={errCls}>{errors.cnic}</p>}
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor="cm-password">Password *</label>
              <div className="relative">
                <input id="cm-password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters"
                  autoComplete="new-password" className={`${inputCls} pr-12`} />
                <button type="button" onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#64748b] dark:text-[#94a3b8]">
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => { setPassword(generatePassword()); setShowPassword(true); setErrors(prev => ({ ...prev, password: '' })); }}
                  className="flex-1 min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-xs font-bold text-[#0f172a] dark:text-white flex items-center justify-center gap-2">
                  <IconDice />Generate
                </button>
                <button type="button" onClick={() => copyText(password)} disabled={!password}
                  className="flex-1 min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-xs font-bold text-[#0f172a] dark:text-white flex items-center justify-center gap-2 disabled:opacity-40">
                  <IconCopy />Copy
                </button>
              </div>
              {errors.password && <p className={errCls}>{errors.password}</p>}
            </div>

            <button type="button" onClick={submit} disabled={busy || !businessType}
              className="w-full min-h-[52px] mt-5 rounded-2xl bg-[#1d4ed8] text-white text-sm font-black disabled:opacity-40">
              {busy ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        ) : (
          <div>
            <div className="rounded-3xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-9 h-9 rounded-2xl bg-[rgba(34,197,94,0.15)] text-[#15803d] dark:text-[#4ade80] flex items-center justify-center"><IconCheck /></span>
                <TypeBadge type={created?.businessType ?? 'isp'} />
              </div>
              <CredentialRow label="Business" value={created?.businessName ?? ''} />
              <CredentialRow label="Username" value={created?.username ?? ''} mono />
              <div className="py-2 border-b border-[#f1f5f9] dark:border-white/5 last:border-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1">Password</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0f172a] dark:text-white font-mono break-all">
                    {showCreatedPassword ? created?.password : '••••••••••'}
                  </span>
                  <button type="button" onClick={() => setShowCreatedPassword(s => !s)}
                    aria-label={showCreatedPassword ? 'Hide password' : 'Show password'}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#64748b] dark:text-[#94a3b8] shrink-0">
                    {showCreatedPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[#64748b] dark:text-[#94a3b8] font-semibold mt-3">
                Login with username + password at the normal login page.
              </p>
              {created?.usesSyntheticEmail && (
                <p className="text-[11px] text-[#b45309] dark:text-[#fbbf24] font-semibold mt-1">
                  No recovery email set. Admin can reset the password if forgotten.
                </p>
              )}
            </div>
            <p className="text-[11px] text-[#94a3b8] mb-4 ml-1">
              The password is shown only here. It will not be shown again after you close this.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button type="button" onClick={() => copyText(credentialsText())}
                  className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white flex items-center justify-center gap-2">
                  <IconCopy />Copy credentials
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(credentialsText())}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 min-h-[48px] rounded-2xl bg-[#16a34a] text-white text-sm font-bold flex items-center justify-center gap-2">
                  <IconWhatsApp />Share on WhatsApp
                </a>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={resetForm}
                  className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
                  Create another
                </button>
                <button type="button" onClick={onClose}
                  className="flex-1 min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-sm font-black">
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small pieces ── */
function CredentialRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-2 border-b border-[#f1f5f9] dark:border-white/5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{label}</div>
      <div className={`text-sm font-semibold text-[#0f172a] dark:text-white break-words ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: BusinessType }) {
  const isIsp = type === 'isp';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isIsp
      ? 'bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
      : 'bg-[#ccfbf1] text-[#0f766e] dark:bg-[rgba(45,212,191,0.15)] dark:text-[#5eead4]'}`}>
      {isIsp ? <IconWifi /> : <IconDrop />}{isIsp ? 'ISP' : 'Water'}
    </span>
  );
}

/* ── Inline SVG icons only (no emoji, no icon fonts, no images) ── */
function Ic({ children, className = 'w-5 h-5' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
  );
}
const IconClose = () => (<Ic><path d="M18 6 6 18M6 6l12 12" /></Ic>);
const IconEye = () => (<Ic><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Ic>);
const IconEyeOff = () => (<Ic><path d="M9.9 4.24A9.5 9.5 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.16 3.19M6.61 6.61A16.8 16.8 0 0 0 2 12s3.5 8 10 8a9.9 9.9 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></Ic>);
const IconWifi = () => (<Ic className="w-3.5 h-3.5"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 9.5a15 15 0 0 1 20 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></Ic>);
const IconDrop = () => (<Ic className="w-3.5 h-3.5"><path d="M12 2.7 6.7 8.6a7 7 0 1 0 10.6 0Z" /></Ic>);
const IconCopy = () => (<Ic className="w-4 h-4"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Ic>);
const IconDice = () => (<Ic className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" /></Ic>);
const IconCheck = () => (<Ic className="w-4 h-4"><path d="M20 6 9 17l-5-5" /></Ic>);
const IconWhatsApp = () => (<Ic className="w-4 h-4"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Ic>);
