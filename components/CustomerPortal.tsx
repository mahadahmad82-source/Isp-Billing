import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mzmajmjzopmkzboizrbm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw'
);

/* ── month helpers (same format as RecoverySummary) ── */
const monthLabel = (offset = 0): string => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
};

/* ── colors ── */
const C = {
  bg: '#0b0f1a', card: '#131929', card2: '#1a2235',
  border: '#1e2d45', border2: '#243348',
  text: '#e2e8f0', muted: '#64748b', subtle: '#94a3b8',
};

const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: '1rem', padding: '1.1rem',
};

const Badge = ({ ok }: { ok: boolean }) => (
  <span style={{
    background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
    color: ok ? '#34d399' : '#f87171',
    border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    borderRadius: '0.4rem', padding: '0.15rem 0.45rem',
    fontSize: '0.62rem', fontWeight: 800, whiteSpace: 'nowrap' as const,
  }}>
    {ok ? 'PAID' : 'PENDING'}
  </span>
);

const Row = ({ label, val, accent }: { label: string; val: React.ReactNode; accent?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.42rem 0', borderBottom: `1px solid ${C.border}` }}>
    <span style={{ color: C.muted, fontSize: '0.72rem' }}>{label}</span>
    <span style={{ color: accent || C.text, fontSize: '0.75rem', fontWeight: 700 }}>{val}</span>
  </div>
);

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
      const { data, error: err } = await supabase.from('manager_data').select('data');
      if (err) throw err;

      const q = username.trim().toLowerCase();
      for (const row of (data || [])) {
        const users: any[]    = row.data?.users    || [];
        const receipts: any[] = row.data?.receipts || [];

        const found = users.find((u: any) =>
          (u.username || '').toLowerCase() === q && u.status !== 'deleted'
        );
        if (!found) continue;

        // company / ISP info
        const companies: any[] = row.data?.companies || [];
        const biz = companies.find((c: any) => c.id === found.companyId)?.settings
          || row.data?.settings
          || companies[0]?.settings;

        // All receipts for this user, newest first
        const allUserReceipts = receipts
          .filter((r: any) => r.userId === found.id || r.username === found.username)
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
  const expired = diff < 0;

  /* ════ RENDER ════ */
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}
      className="flex flex-col items-center justify-start p-4 pt-8 pb-16">
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', width: '3.5rem', height: '3.5rem',
            borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem', margin: '0 auto 0.75rem', boxShadow: '0 0 24px #4f46e580',
          }}>📡</div>
          <h1 style={{ color: C.text, fontSize: '1.35rem', fontWeight: 900, margin: 0 }}>Customer Portal</h1>
          <p style={{ color: C.muted, fontSize: '0.78rem', marginTop: '0.25rem' }}>
            Apna account aur payment history dekhein
          </p>
        </div>

        {/* ══ SEARCH ══ */}
        {!result ? (
          <div style={cardStyle}>
            <label style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block', marginBottom: '0.5rem' }}>
              Username
            </label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="apna username likhein"
              style={{ width: '100%', background: '#0f172a', border: `1px solid ${C.border2}`,
                borderRadius: '0.75rem', padding: '0.75rem 1rem', color: C.text,
                fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const,
                marginBottom: '0.75rem', fontFamily: 'inherit' }} />
            {error && <p style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>}
            <button onClick={search} disabled={loading}
              style={{ width: '100%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                color: '#fff', fontWeight: 900, padding: '0.75rem', borderRadius: '0.75rem',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Searching...' : 'Check Status →'}
            </button>
          </div>
        ) : (

          /* ══ RESULT ══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* 1 ── Account card */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
                <div style={{ width: '2.8rem', height: '2.8rem', background: '#1e3a8a',
                  border: '1px solid #3b82f6', borderRadius: '0.75rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', flexShrink: 0 }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: C.text, fontWeight: 900, fontSize: '1rem', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                  <p style={{ color: C.muted, fontSize: '0.72rem', margin: 0 }}>@{u.username}</p>
                </div>
                <span style={{
                  background: expired ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                  color: expired ? '#f87171' : '#34d399',
                  border: `1px solid ${expired ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                  borderRadius: '2rem', padding: '0.25rem 0.7rem',
                  fontSize: '0.63rem', fontWeight: 800, whiteSpace: 'nowrap' as const,
                }}>
                  {expired ? '❌ Expired' : '✅ Active'}
                </span>
              </div>
              <Row label="Package"   val={u.plan} />
              <Row label="Monthly Fee" val={`Rs. ${(u.monthlyFee || 0).toLocaleString()}`} />
              <Row label="Expiry"    val={exp?.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <Row label="Days"
                val={expired ? `${Math.abs(diff)} din overdue` : `${diff} din remaining`}
                accent={expired ? '#f87171' : '#34d399'} />
              <Row label="Phone"     val={u.phone || '—'} />
              {u.area && <Row label="Area" val={u.area} />}
            </div>

            {/* 2 ── Source indicator */}
            <div style={{
              background: result.source === 'current' ? 'rgba(79,70,229,0.08)'
                : result.source === 'prev' ? 'rgba(234,179,8,0.08)' : 'rgba(100,116,139,0.08)',
              border: `1px solid ${result.source === 'current' ? 'rgba(79,70,229,0.25)'
                : result.source === 'prev' ? 'rgba(234,179,8,0.25)' : 'rgba(100,116,139,0.2)'}`,
              borderRadius: '0.75rem', padding: '0.6rem 0.9rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ fontSize: '0.9rem' }}>
                {result.source === 'current' ? '🟢' : result.source === 'prev' ? '🟡' : '📋'}
              </span>
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

            {/* 3 ── Financial summary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {[
                {
                  label: 'Pending Due',
                  value: result.balanceDue > 0 ? `Rs. ${result.balanceDue.toLocaleString()}` : 'Clear ✓',
                  color: result.balanceDue > 0 ? '#f87171' : '#34d399',
                  bg: result.balanceDue > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.06)',
                  border: result.balanceDue > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                },
                {
                  label: 'Advance',
                  value: result.advanceAmt > 0 ? `Rs. ${result.advanceAmt.toLocaleString()}` : '—',
                  color: result.advanceAmt > 0 ? '#34d399' : C.muted,
                  bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.15)',
                },
                {
                  label: 'Paid (period)',
                  value: result.hasPaid ? `Rs. ${result.paidThisPeriod.toLocaleString()}` : '—',
                  color: result.hasPaid ? '#818cf8' : C.muted,
                  bg: 'rgba(79,70,229,0.07)', border: 'rgba(79,70,229,0.18)',
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
                  textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: 0 }}>
                  💳 Payment Ledger
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
                        borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.subtle, fontSize: '0.7rem', fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {r.period || r.activatedMonth || '—'}
                        </span>
                        <span style={{ color: C.muted, fontSize: '0.68rem' }}>{rDate}</span>
                        <div>
                          <span style={{ color: isPaid ? C.text : '#fbbf24', fontSize: '0.7rem', fontWeight: 700 }}>
                            Rs.{netPaid.toLocaleString()}
                          </span>
                          {(r.advanceAmount || 0) > 0 && (
                            <span style={{ color: '#34d399', fontSize: '0.58rem',
                              display: 'block', marginTop: '0.05rem' }}>
                              +Rs.{r.advanceAmount} adv
                            </span>
                          )}
                          {(r.balanceAmount || 0) > 0 && (
                            <span style={{ color: '#f87171', fontSize: '0.58rem',
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
                        color: '#818cf8', fontSize: '0.75rem', fontWeight: 700,
                        cursor: 'pointer', paddingTop: '0.65rem', textAlign: 'center' }}>
                      {showAll ? '▲ Kam dikhao' : `▼ Aur ${allReceipts.length - 6} dekhein`}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 5 ── Pending alert */}
            {allReceipts.some((r: any) => r.status !== 'Success') && (
              <div style={{ background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.22)', borderRadius: '1rem', padding: '0.9rem' }}>
                <p style={{ color: '#f87171', fontWeight: 800, fontSize: '0.75rem',
                  textTransform: 'uppercase' as const, letterSpacing: '0.07em', margin: '0 0 0.6rem' }}>
                  ⚠️ Pending Dues
                </p>
                {allReceipts.filter((r: any) => r.status !== 'Success').map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', padding: '0.38rem 0',
                    borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
                    <div>
                      <p style={{ color: '#fca5a5', fontSize: '0.74rem', fontWeight: 700, margin: 0 }}>
                        {r.period || r.activatedMonth || '—'}
                      </p>
                      <p style={{ color: '#f87171', fontSize: '0.64rem', margin: 0 }}>
                        Balance: Rs. {(r.balanceAmount || r.totalAmount || 0).toLocaleString()}
                      </p>
                    </div>
                    <span style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 900 }}>
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
                    style={{ color: '#818cf8', fontSize: '0.75rem', textDecoration: 'none', display: 'block', marginTop: '0.2rem' }}>
                    📞 {result.biz.businessPhone}
                  </a>
                )}
              </div>
            )}

            {/* Back */}
            <button onClick={() => { setResult(null); setUsername(''); setShowAll(false); }}
              style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`,
                color: C.subtle, fontWeight: 700, padding: '0.75rem', borderRadius: '0.75rem',
                cursor: 'pointer', fontSize: '0.85rem' }}>
              ← Dobara Check Karein
            </button>
          </div>
        )}

        <p style={{ color: '#1e2d45', fontSize: '0.62rem', textAlign: 'center', marginTop: '1.5rem' }}>
          Powered by MYISP
        </p>
      </div>
    </div>
  );
};

export default CustomerPortal;
