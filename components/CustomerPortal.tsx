import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';

/* ── month helpers (same format as RecoverySummary) ── */
const monthLabel = (offset = 0): string => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
};

/* ── colors (light Mahadnet theme) ── */
const C = {
  text: '#0f172a', muted: '#64748b', subtle: '#94a3b8',
  card: 'rgba(255,255,255,0.75)',
  border: 'rgba(99,102,241,0.18)', border2: 'rgba(100,116,139,0.3)',
};

const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: '1rem', padding: '1.1rem',
};

const Badge = ({ ok }: { ok: boolean }) => (
  <span style={{
    background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
    color: ok ? '#059669' : '#d97706',
    border: `1px solid ${ok ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
    borderRadius: '0.4rem', padding: '0.15rem 0.45rem',
    fontSize: '0.62rem', fontWeight: 800, whiteSpace: 'nowrap' as const,
  }}>
    {ok ? 'PAID' : 'PENDING'}
  </span>
);

const Row = ({ label, val, accent }: { label: string; val: React.ReactNode; accent?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.42rem 0', borderBottom: `1px solid rgba(100,116,139,0.2)` }}>
    <span style={{ color: C.muted, fontSize: '0.72rem' }}>{label}</span>
    <span style={{ color: accent || C.text, fontSize: '0.75rem', fontWeight: 700 }}>{val}</span>
  </div>
);

/* ── Icons (outside component to prevent re-render remounting) ── */
const SearchIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m1.6-4.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" /></svg>);
const UserIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>);
const CreditCardIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>);
const AlertIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>);
const PhoneIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" /></svg>);
const ArrowLeftIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>);
const ChevronDownIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>);
const ChevronUpIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>);
const CheckCircleIcon = () => (<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.62-2.12A10 10 0 113.5 8.38 10 10 0 0120.62 5.88z" /></svg>);
const XCircleIcon = () => (<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const ClockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const DatabaseIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zM4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" /></svg>);

/* ════════════════════════════════════ COMPONENT ════════════════════════════════════ */
const CustomerPortal: React.FC = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<any>(null);
  const [error, setError]       = useState('');
  const [showAll, setShowAll]   = useState(false);

  /* ── search ── */
  const search = async () => {
    if (!username.trim()) return;
    setLoading(true); setError(''); setResult(null); setShowAll(false);
    try {
      // Server-side scoped lookup (RPC) — no longer pulls every manager's
      // full users/receipts table down to the browser to search client-side.
      const { data, error: err } = await supabase.rpc('find_customer_by_username', {
        p_username: username.trim(),
      });
      if (err) throw err;

      if (data) {
        const found = data.user;
        const biz = data.biz;

        // Receipts already scoped to this user + company by the RPC
        const allUserReceipts: any[] = (data.receipts || [])
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        /* ── PRIORITY LOGIC (mirrors RecoverySummary) ──
           1. Current month recovery ledger
           2. Previous month recovery ledger
           3. Master directory (user record itself)
        ── */
        const curMonth  = monthLabel(0);   // e.g. "June 2026"
        const prevMonth = monthLabel(-1);  // e.g. "May 2026"

        const curReceipts  = allUserReceipts.filter((r: any) => r.period === curMonth);
        const prevReceipts = allUserReceipts.filter((r: any) => r.period === prevMonth);

        let source: 'current' | 'prev' | 'master';
        let sourceReceipts: any[];

        if (curReceipts.length > 0) {
          source = 'current'; sourceReceipts = curReceipts;
        } else if (prevReceipts.length > 0) {
          source = 'prev'; sourceReceipts = prevReceipts;
        } else {
          source = 'master'; sourceReceipts = [];
        }

        // Aggregate exactly like RecoverySummary detailedList
        const hasPaid      = sourceReceipts.length > 0;
        const lastReceipt  = hasPaid ? sourceReceipts[sourceReceipts.length - 1] : null;
        const paidThisPeriod = sourceReceipts.reduce(
          (s: number, r: any) => s + ((r.paidAmount || 0) - (r.advanceAmount || 0)), 0);
        const advanceAmt   = sourceReceipts.reduce((s: number, r: any) => s + (r.advanceAmount || 0), 0);
        const balanceDue   = hasPaid ? (lastReceipt?.balanceAmount ?? 0) : (found.balance ?? 0);
        const totalEverPaid = allUserReceipts
          .filter((r: any) => r.status === 'Success')
          .reduce((s: number, r: any) => s + (r.paidAmount || 0), 0);

        const isActivatedCur = (found.activatedMonths || []).includes(curMonth);

        setResult({
          user: found, biz,
          allReceipts: allUserReceipts,
          source, sourceLabel: source === 'current' ? curMonth : source === 'prev' ? prevMonth : 'Master Directory',
          hasPaid, paidThisPeriod, advanceAmt, balanceDue, totalEverPaid,
          isActivatedCur, curMonth,
        });
        setLoading(false);
        return;
      }
      setError('Username nahi mila. Apna username check karein.');
    } catch { setError('Network error. Dobara try karein.'); }
    setLoading(false);
  };

  /* ── shortcuts ── */
  const u = result?.user;
  const allReceipts: any[] = result?.allReceipts || [];
  const visibleList = showAll ? allReceipts : allReceipts.slice(0, 6);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = u?.expiryDate ? new Date(u.expiryDate) : null;
  if (exp) exp.setHours(0, 0, 0, 0);
  const diff    = exp ? Math.ceil((exp.getTime() - today.getTime()) / 86400000) : 0;
  // isActivatedCur = paid this month → always Active regardless of expiryDate
  const expired = !result?.isActivatedCur && diff < 0;

  const srcCfg = result ? (
    result.source === 'current' ? { bg: 'rgba(99,102,241,0.08)', bd: 'rgba(99,102,241,0.28)', txt: '#4f46e5', Icon: CheckCircleIcon }
    : result.source === 'prev' ? { bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.28)', txt: '#d97706', Icon: ClockIcon }
    : { bg: 'rgba(100,116,139,0.08)', bd: 'rgba(100,116,139,0.28)', txt: '#64748b', Icon: DatabaseIcon }
  ) : null;

  /* ════ RENDER ════ */
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fc', color: C.text, position: 'relative' }}
      className="flex flex-col items-center justify-center p-4 py-8">
      <div className="absolute inset-0 z-0"><VideoBackground variant="light" /></div>
      <div className="absolute inset-0 z-[1] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, rgba(15,23,42,0.06) 100%)' }} />

      <div style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 10 }}>

        {/* Logo + back */}
        <div className="text-center mb-6 relative">
          <Link to="/" aria-label="Back to home"
            className="absolute left-0 top-0 p-2 text-slate-400 hover:text-indigo-500 transition-colors">
            <ArrowLeftIcon />
          </Link>
          {logoBase64 && <img src={logoBase64} alt="MYISP Logo" className="w-[135px] h-auto object-contain mx-auto" />}
        </div>

        {/* Main glass card */}
        <div className="relative rounded-[2rem] overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.35)',
            boxShadow: '0 24px 64px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}>
          <div className="p-6 sm:p-8">

            {/* ══ SEARCH ══ */}
            {!result ? (
              <>
                {/* Card header */}
                <div className="text-center mb-7">
                  <h2 className="text-2xl font-black tracking-tight mb-1">
                    <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Customer Portal</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">Apna account aur payment history dekhein</p>
                  <div className="w-12 h-1 rounded-full mx-auto mt-3 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500" />
                </div>

                <label style={{ color: C.muted, fontSize: '0.66rem', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: '0.5rem' }}>
                  Username
                </label>
                <div className="flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all duration-300"
                  style={{ background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(99,102,241,0.18)' }}>
                  <span className="text-indigo-400 flex-shrink-0"><SearchIcon /></span>
                  <input value={username} onChange={e => setUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder="apna username likhein"
                    className="flex-1 bg-transparent text-slate-900 text-sm font-medium placeholder:text-slate-400 outline-none min-w-0"
                    style={{ caretColor: '#818cf8', fontFamily: 'inherit' }} />
                </div>

                {error && <p style={{ color: '#dc2626', fontSize: '0.75rem', marginBottom: '0.75rem', marginTop: '0.6rem' }}>{error}</p>}

                <button onClick={search} disabled={loading}
                  style={{ width: '100%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)',
                    color: '#fff', fontWeight: 900, padding: '0.9rem', borderRadius: '1rem',
                    border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem', opacity: loading ? 0.7 : 1, marginTop: '1.15rem',
                    boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
                  {loading ? 'Searching...' : 'Check Status →'}
                </button>
              </>
            ) : (

              /* ══ RESULT ══ */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* 1 ── Account card */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
                    <div style={{ width: '2.8rem', height: '2.8rem', background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.75rem', color: '#4f46e5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UserIcon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: C.text, fontWeight: 900, fontSize: '1rem', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                      <p style={{ color: C.muted, fontSize: '0.72rem', margin: 0 }}>@{u.username}</p>
                    </div>
                    <span style={{
                      background: expired ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                      color: expired ? '#dc2626' : '#059669',
                      border: `1px solid ${expired ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                      borderRadius: '2rem', padding: '0.25rem 0.7rem',
                      fontSize: '0.63rem', fontWeight: 800, whiteSpace: 'nowrap' as const,
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    }}>
                      {expired ? <XCircleIcon /> : <CheckCircleIcon />}
                      {expired ? 'Expired' : 'Active'}
                    </span>
                  </div>
                  <Row label="Package"   val={u.plan} />
                  <Row label="Monthly Fee" val={`Rs. ${(u.monthlyFee || 0).toLocaleString()}`} />
                  <Row label="Expiry"    val={exp?.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} />
                  <Row label="Days"
                    val={expired ? `${Math.abs(diff)} din overdue` : `${diff} din remaining`}
                    accent={expired ? '#dc2626' : '#059669'} />
                  <Row label="Phone"     val={u.phone || '—'} />
                  {u.area && <Row label="Area" val={u.area} />}
                </div>

                {/* 2 ── Source indicator */}
                {srcCfg && (
                  <div style={{
                    background: srcCfg.bg, border: `1px solid ${srcCfg.bd}`,
                    borderRadius: '0.75rem', padding: '0.6rem 0.9rem',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <span style={{ color: srcCfg.txt, display: 'flex' }}><srcCfg.Icon /></span>
                    <div>
                      <p style={{ color: C.subtle, fontSize: '0.65rem', fontWeight: 700,
                        textTransform: 'uppercase' as const, letterSpacing: '0.07em', margin: 0 }}>
                        Payment source
                      </p>
                      <p style={{ color: C.text, fontSize: '0.75rem', fontWeight: 800, margin: 0 }}>
                        {result.sourceLabel}
                        {result.source === 'master' && ' (no receipt found)'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 3 ── Financial summary tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    {
                      label: 'Pending Due',
                      value: result.balanceDue > 0 ? `Rs. ${result.balanceDue.toLocaleString()}` : 'Clear ✓',
                      color: result.balanceDue > 0 ? '#dc2626' : '#059669',
                      bg: result.balanceDue > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                      border: result.balanceDue > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                    },
                    {
                      label: 'Advance',
                      value: result.advanceAmt > 0 ? `Rs. ${result.advanceAmt.toLocaleString()}` : '—',
                      color: result.advanceAmt > 0 ? '#059669' : C.muted,
                      bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)',
                    },
                    {
                      label: 'Paid (period)',
                      value: result.hasPaid ? `Rs. ${result.paidThisPeriod.toLocaleString()}` : '—',
                      color: result.hasPaid ? '#4f46e5' : C.muted,
                      bg: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.22)',
                    },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`,
                      borderRadius: '0.75rem', padding: '0.6rem 0.4rem', textAlign: 'center' }}>
                      <p style={{ color: s.color, fontWeight: 900, fontSize: '0.75rem', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.value}</p>
                      <p style={{ color: C.muted, fontSize: '0.58rem', margin: '0.2rem 0 0',
                        textTransform: 'uppercase' as const, letterSpacing: '0.03em' }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* 4 ── Payment Ledger */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                    <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.8rem',
                      textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0,
                      display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ color: '#4f46e5', display: 'flex' }}><CreditCardIcon /></span>
                      Payment Ledger
                    </h3>
                    <span style={{ color: C.muted, fontSize: '0.68rem' }}>
                      {allReceipts.length} record{allReceipts.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {allReceipts.length === 0 ? (
                    <p style={{ color: C.muted, fontSize: '0.78rem', textAlign: 'center', padding: '1.5rem 0' }}>
                      Koi payment record nahi mila
                    </p>
                  ) : (
                    <>
                      {/* Table header */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 0.85fr 0.7fr',
                        gap: '0.25rem', padding: '0.3rem 0', borderBottom: `1px solid ${C.border2}`,
                        marginBottom: '0.25rem' }}>
                        {['Period', 'Date', 'Paid', 'Status'].map(h => (
                          <span key={h} style={{ color: C.muted, fontSize: '0.6rem',
                            fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</span>
                        ))}
                      </div>

                      {/* Rows */}
                      {visibleList.map((r: any) => {
                        const isPaid = r.status === 'Success';
                        const rDate  = r.date
                          ? new Date(r.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
                          : '—';
                        const netPaid = (r.paidAmount || 0) - (r.advanceAmount || 0);
                        return (
                          <div key={r.id} style={{ display: 'grid',
                            gridTemplateColumns: '1.1fr 0.8fr 0.85fr 0.7fr',
                            gap: '0.25rem', padding: '0.45rem 0',
                            borderBottom: `1px solid rgba(100,116,139,0.18)` }}>
                            <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {r.period || r.activatedMonth || '—'}
                            </span>
                            <span style={{ color: C.muted, fontSize: '0.68rem' }}>{rDate}</span>
                            <div>
                              <span style={{ color: isPaid ? C.text : '#d97706', fontSize: '0.7rem', fontWeight: 700 }}>
                                Rs.{netPaid.toLocaleString()}
                              </span>
                              {(r.advanceAmount || 0) > 0 && (
                                <span style={{ color: '#059669', fontSize: '0.58rem',
                                  display: 'block', marginTop: '0.05rem' }}>
                                  +Rs.{r.advanceAmount} adv
                                </span>
                              )}
                              {(r.balanceAmount || 0) > 0 && (
                                <span style={{ color: '#dc2626', fontSize: '0.58rem',
                                  display: 'block', marginTop: '0.05rem' }}>
                                  Rs.{r.balanceAmount} due
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                              <Badge ok={isPaid} />
                            </div>
                          </div>
                        );
                      })}

                      {allReceipts.length > 6 && (
                        <button onClick={() => setShowAll(v => !v)}
                          style={{ width: '100%', background: 'none', border: 'none',
                            color: '#4f46e5', fontSize: '0.75rem', fontWeight: 700,
                            cursor: 'pointer', paddingTop: '0.65rem', textAlign: 'center',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                          {showAll ? (<><ChevronUpIcon /> Kam dikhao</>) : (<><ChevronDownIcon /> Aur {allReceipts.length - 6} dekhein</>)}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* 5 ── Pending alert */}
                {allReceipts.some((r: any) => r.status !== 'Success') && (
                  <div style={{ background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.25)', borderRadius: '1rem', padding: '0.9rem' }}>
                    <p style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.75rem',
                      textTransform: 'uppercase' as const, letterSpacing: '0.07em', margin: '0 0 0.6rem',
                      display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ display: 'flex' }}><AlertIcon /></span>
                      Pending Dues
                    </p>
                    {allReceipts.filter((r: any) => r.status !== 'Success').map((r: any) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '0.38rem 0',
                        borderBottom: '1px solid rgba(239,68,68,0.12)' }}>
                        <div>
                          <p style={{ color: '#b91c1c', fontSize: '0.74rem', fontWeight: 700, margin: 0 }}>
                            {r.period || r.activatedMonth || '—'}
                          </p>
                          <p style={{ color: '#dc2626', fontSize: '0.64rem', margin: 0 }}>
                            Balance: Rs. {(r.balanceAmount || r.totalAmount || 0).toLocaleString()}
                          </p>
                        </div>
                        <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 900 }}>
                          Rs. {(r.totalAmount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 6 ── ISP info */}
                {result.biz && (
                  <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <p style={{ color: C.muted, fontSize: '0.67rem', margin: 0 }}>Service Provider</p>
                    <p style={{ color: C.text, fontWeight: 900, margin: '0.25rem 0 0' }}>
                      {result.biz.businessName}
                    </p>
                    {result.biz.businessPhone && (
                      <a href={`tel:${result.biz.businessPhone}`}
                        style={{ color: '#4f46e5', fontSize: '0.75rem', textDecoration: 'none',
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                        <span style={{ display: 'flex' }}><PhoneIcon /></span>
                        {result.biz.businessPhone}
                      </a>
                    )}
                  </div>
                )}

                {/* Back */}
                <button onClick={() => { setResult(null); setUsername(''); setShowAll(false); }}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.75)', border: `1px solid ${C.border}`,
                    color: '#64748b', fontWeight: 700, padding: '0.75rem', borderRadius: '0.75rem',
                    cursor: 'pointer', fontSize: '0.85rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <ArrowLeftIcon />
                  Dobara Check Karein
                </button>
              </div>
            )}

          </div>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.62rem', textAlign: 'center', marginTop: '1.5rem' }}>
          Powered by MYISP
        </p>
      </div>
    </div>
  );
};

export default CustomerPortal;
