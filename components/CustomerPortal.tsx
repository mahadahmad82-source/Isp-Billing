import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mzmajmjzopmkzboizrbm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw'
);

/* ── tiny helpers ── */
const C = {
  bg:      '#0b0f1a',
  card:    '#131929',
  card2:   '#1a2235',
  border:  '#1e2d45',
  border2: '#243348',
  text:    '#e2e8f0',
  muted:   '#64748b',
  subtle:  '#94a3b8',
};

const Row = ({ label, val, accent }: { label: string; val: React.ReactNode; accent?: string }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'0.45rem 0', borderBottom:`1px solid ${C.border}` }}>
    <span style={{ color: C.muted, fontSize:'0.72rem' }}>{label}</span>
    <span style={{ color: accent || C.text, fontSize:'0.75rem', fontWeight:700 }}>{val}</span>
  </div>
);

const Badge = ({ ok }: { ok: boolean }) => (
  <span style={{
    background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
    color: ok ? '#34d399' : '#f87171',
    border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
    borderRadius:'0.4rem', padding:'0.15rem 0.5rem', fontSize:'0.65rem', fontWeight:800,
    letterSpacing:'0.03em'
  }}>
    {ok ? 'PAID' : 'PENDING'}
  </span>
);

/* ── main component ── */
const CustomerPortal: React.FC = () => {
  const [username, setUsername]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<any>(null);
  const [error, setError]         = useState('');
  const [showAll, setShowAll]     = useState(false);

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
        if (found) {
          const companies: any[] = row.data?.companies || [];
          const biz = companies.find((c: any) => c.id === found.companyId)?.settings
            || row.data?.settings
            || companies[0]?.settings;

          // receipts for this user, newest first
          const userReceipts = receipts
            .filter((r: any) => r.userId === found.id || r.username === found.username)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // latest receipt for current dues / advance
          const latest = userReceipts[0] || null;

          setResult({ user: found, biz, receipts: userReceipts, latest });
          setLoading(false); return;
        }
      }
      setError('Username nahi mila. Apna username check karein.');
    } catch { setError('Network error. Dobara try karein.'); }
    setLoading(false);
  };

  /* ── derived values ── */
  const u        = result?.user;
  const biz      = result?.biz;
  const receipts: any[] = result?.receipts || [];
  const latest   = result?.latest;

  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = u?.expiryDate ? new Date(u.expiryDate) : null;
  if (exp) exp.setHours(0,0,0,0);
  const diff    = exp ? Math.ceil((exp.getTime()-today.getTime())/86400000) : 0;
  const expired = diff < 0;

  const pendingDue  = latest ? (latest.balanceAmount || 0) : (u?.balance || 0);
  const advance     = latest?.advanceAmount || 0;
  const totalPaid   = receipts.filter((r:any) => r.status === 'Success').reduce((s:number,r:any)=>s+(r.paidAmount||0),0);
  const visibleList = showAll ? receipts : receipts.slice(0, 5);

  /* ── styles ── */
  const inputStyle: React.CSSProperties = {
    width:'100%', background:'#0f172a', border:`1px solid ${C.border2}`,
    borderRadius:'0.75rem', padding:'0.75rem 1rem', color:C.text,
    fontSize:'0.875rem', outline:'none', boxSizing:'border-box',
    marginBottom:'0.75rem', fontFamily:'inherit'
  };
  const cardStyle: React.CSSProperties = {
    background: C.card, border:`1px solid ${C.border}`,
    borderRadius:'1rem', padding:'1.1rem'
  };
  const btnPrimary: React.CSSProperties = {
    width:'100%', background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
    color:'#fff', fontWeight:900, padding:'0.75rem', borderRadius:'0.75rem',
    border:'none', cursor:'pointer', fontSize:'0.9rem'
  };

  /* ── render ── */
  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text }}
      className="flex flex-col items-center justify-start p-4 pt-8 pb-16">

      <div style={{ width:'100%', maxWidth:'420px' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:'1.75rem' }}>
          <div style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', width:'3.5rem',
            height:'3.5rem', borderRadius:'1rem', display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:'1.6rem', margin:'0 auto 0.75rem', boxShadow:'0 0 24px #4f46e580' }}>
            📡
          </div>
          <h1 style={{ color:C.text, fontSize:'1.4rem', fontWeight:900, margin:0 }}>Customer Portal</h1>
          <p style={{ color:C.muted, fontSize:'0.8rem', marginTop:'0.25rem' }}>
            Apna account status aur payment history dekhein
          </p>
        </div>

        {/* ── SEARCH ── */}
        {!result ? (
          <div style={cardStyle}>
            <label style={{ color:C.muted, fontSize:'0.68rem', fontWeight:700,
              letterSpacing:'0.1em', textTransform:'uppercase', display:'block', marginBottom:'0.5rem' }}>
              Username
            </label>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&search()}
              placeholder="apna username likhein"
              style={inputStyle} />
            {error && <p style={{ color:'#f87171', fontSize:'0.75rem', marginBottom:'0.75rem' }}>{error}</p>}
            <button onClick={search} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Searching...' : 'Check Status →'}
            </button>
          </div>
        ) : (

          /* ── RESULT ── */
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

            {/* ── 1. ACCOUNT CARD ── */}
            <div style={cardStyle}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.9rem' }}>
                <div style={{ width:'2.8rem', height:'2.8rem', background:'#1e3a8a',
                  border:'1px solid #3b82f6', borderRadius:'0.75rem',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1.2rem', flexShrink:0 }}>👤</div>
                <div>
                  <p style={{ color:C.text, fontWeight:900, fontSize:'1rem', margin:0 }}>{u.name}</p>
                  <p style={{ color:C.muted, fontSize:'0.72rem', margin:0 }}>@{u.username}</p>
                </div>
                {/* status pill */}
                <div style={{ marginLeft:'auto' }}>
                  <span style={{
                    background: expired ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    color: expired ? '#f87171' : '#34d399',
                    border: `1px solid ${expired ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    borderRadius:'2rem', padding:'0.25rem 0.75rem',
                    fontSize:'0.65rem', fontWeight:800
                  }}>
                    {expired ? '❌ Expired' : '✅ Active'}
                  </span>
                </div>
              </div>

              <Row label="Package"  val={u.plan} />
              <Row label="Expiry"   val={exp?.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})} />
              <Row label="Days Left" val={expired ? `${Math.abs(diff)} din overdue` : `${diff} din remaining`}
                accent={expired ? '#f87171' : '#34d399'} />
              <Row label="Phone"    val={u.phone || '—'} />
              <Row label="Area"     val={u.area  || '—'} />
            </div>

            {/* ── 2. FINANCIAL SUMMARY ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem' }}>
              {[
                { label:'Pending Due', value: pendingDue > 0 ? `Rs.${pendingDue.toLocaleString()}` : 'Clear',
                  color: pendingDue > 0 ? '#f87171' : '#34d399',
                  bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.2)' },
                { label:'Advance',     value: advance > 0 ? `Rs.${advance.toLocaleString()}` : '—',
                  color: advance > 0 ? '#34d399' : C.muted,
                  bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)' },
                { label:'Total Paid',  value:`Rs.${totalPaid.toLocaleString()}`,
                  color:'#818cf8', bg:'rgba(79,70,229,0.08)', border:'rgba(79,70,229,0.2)' },
              ].map(s => (
                <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`,
                  borderRadius:'0.75rem', padding:'0.65rem 0.5rem', textAlign:'center' }}>
                  <p style={{ color:s.color, fontWeight:900, fontSize:'0.8rem', margin:0 }}>{s.value}</p>
                  <p style={{ color:C.muted, fontSize:'0.6rem', margin:'0.2rem 0 0',
                    letterSpacing:'0.03em', textTransform:'uppercase' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* ── 3. PAYMENT LEDGER ── */}
            <div style={cardStyle}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
                <h3 style={{ color:C.text, fontWeight:800, fontSize:'0.82rem',
                  textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>
                  💳 Payment Ledger
                </h3>
                <span style={{ color:C.muted, fontSize:'0.68rem' }}>
                  {receipts.length} record{receipts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {receipts.length === 0 ? (
                <p style={{ color:C.muted, fontSize:'0.78rem', textAlign:'center', padding:'1.5rem 0' }}>
                  Koi payment record nahi mila
                </p>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 0.9fr 0.9fr 0.7fr',
                    gap:'0.3rem', padding:'0.3rem 0', borderBottom:`1px solid ${C.border2}`,
                    marginBottom:'0.3rem' }}>
                    {['Period','Date','Paid','Status'].map(h => (
                      <span key={h} style={{ color:C.muted, fontSize:'0.62rem',
                        fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>
                    ))}
                  </div>

                  {/* Rows */}
                  {visibleList.map((r: any) => {
                    const isPaid = r.status === 'Success';
                    const rDate  = r.date ? new Date(r.date).toLocaleDateString('en-PK',
                      { day:'2-digit', month:'short' }) : '—';
                    return (
                      <div key={r.id} style={{ display:'grid',
                        gridTemplateColumns:'1fr 0.9fr 0.9fr 0.7fr',
                        gap:'0.3rem', padding:'0.45rem 0',
                        borderBottom:`1px solid ${C.border}` }}>
                        <span style={{ color:C.subtle, fontSize:'0.72rem', fontWeight:600 }}>
                          {r.period || r.activatedMonth || '—'}
                        </span>
                        <span style={{ color:C.muted, fontSize:'0.7rem' }}>{rDate}</span>
                        <span style={{ color: isPaid ? C.text : '#fbbf24', fontSize:'0.72rem', fontWeight:700 }}>
                          Rs.{(r.paidAmount||0).toLocaleString()}
                        </span>
                        <Badge ok={isPaid} />
                      </div>
                    );
                  })}

                  {/* Show more / less */}
                  {receipts.length > 5 && (
                    <button onClick={() => setShowAll(v=>!v)}
                      style={{ width:'100%', background:'none', border:'none', color:'#818cf8',
                        fontSize:'0.75rem', fontWeight:700, cursor:'pointer',
                        paddingTop:'0.6rem', textAlign:'center' }}>
                      {showAll ? '▲ Less dikhao' : `▼ Aur ${receipts.length-5} dekhein`}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ── 4. PENDING RECEIPTS DETAIL ── */}
            {receipts.some((r:any) => r.status !== 'Success') && (
              <div style={{ background:'rgba(239,68,68,0.06)',
                border:'1px solid rgba(239,68,68,0.2)', borderRadius:'1rem', padding:'1rem' }}>
                <h3 style={{ color:'#f87171', fontWeight:800, fontSize:'0.78rem',
                  textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 0.65rem' }}>
                  ⚠️ Pending Payments
                </h3>
                {receipts.filter((r:any)=>r.status!=='Success').map((r:any) => (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', padding:'0.4rem 0', borderBottom:`1px solid rgba(239,68,68,0.1)` }}>
                    <div>
                      <p style={{ color:'#fca5a5', fontSize:'0.75rem', fontWeight:700, margin:0 }}>
                        {r.period || r.activatedMonth || '—'}
                      </p>
                      <p style={{ color:'#f87171', fontSize:'0.65rem', margin:0 }}>
                        Due: Rs.{(r.balanceAmount||r.totalAmount||0).toLocaleString()}
                      </p>
                    </div>
                    <span style={{ color:'#f87171', fontSize:'0.72rem', fontWeight:900 }}>
                      Rs.{(r.totalAmount||0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── 5. ISP INFO ── */}
            {biz && (
              <div style={{ ...cardStyle, textAlign:'center' }}>
                <p style={{ color:C.muted, fontSize:'0.68rem', margin:0 }}>Service Provider</p>
                <p style={{ color:C.text, fontWeight:900, margin:'0.25rem 0 0', fontSize:'0.95rem' }}>
                  {biz.businessName}
                </p>
                {biz.businessPhone && (
                  <a href={`tel:${biz.businessPhone}`}
                    style={{ color:'#818cf8', fontSize:'0.75rem', textDecoration:'none', display:'block', marginTop:'0.2rem' }}>
                    📞 {biz.businessPhone}
                  </a>
                )}
              </div>
            )}

            {/* Back */}
            <button onClick={() => { setResult(null); setUsername(''); setShowAll(false); }}
              style={{ width:'100%', background:C.card, border:`1px solid ${C.border}`,
                color:C.subtle, fontWeight:700, padding:'0.75rem',
                borderRadius:'0.75rem', cursor:'pointer', fontSize:'0.85rem' }}>
              ← Dobara Check Karein
            </button>
          </div>
        )}

        <p style={{ color:C.border2, fontSize:'0.65rem', textAlign:'center', marginTop:'1.5rem' }}>
          Powered by MYISP
        </p>
      </div>
    </div>
  );
};

export default CustomerPortal;
