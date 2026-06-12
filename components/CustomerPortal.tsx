import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mzmajmjzopmkzboizrbm.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw');

const CustomerPortal: React.FC = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const search = async () => {
    if (!username.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data, error: err } = await supabase.from('manager_data').select('data');
      if (err) throw err;
      const q = username.trim().toLowerCase();
      for (const row of (data || [])) {
        const users: any[] = row.data?.users || [];
        const found = users.find((u: any) =>
          (u.username || '').toLowerCase() === q && u.status !== 'deleted'
        );
        if (found) {
          // find company settings
          const companies: any[] = row.data?.companies || [];
          const companySettings = companies.find((c: any) => c.id === found.companyId)?.settings
            || row.data?.settings
            || companies[0]?.settings;
          setResult({ user: found, biz: companySettings });
          setLoading(false); return;
        }
      }
      setError('Username nahi mila. Apna username check karein.');
    } catch { setError('Network error. Dobara try karein.'); }
    setLoading(false);
  };

  const u = result?.user;
  const biz = result?.biz;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = u?.expiryDate ? new Date(u.expiryDate) : null;
  if (exp) exp.setHours(0,0,0,0);
  const diff = exp ? Math.ceil((exp.getTime() - today.getTime()) / 86400000) : 0;
  const expired = diff < 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f1a', color: '#ffffff' }}
      className="flex flex-col items-center justify-center p-4">

      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg">
            📡
          </div>
          <h1 style={{ color: '#ffffff', fontSize: '1.5rem', fontWeight: 900 }}>Customer Portal</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Apna account status check karein
          </p>
        </div>

        {!result ? (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '1.25rem' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
              Username
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="apna username likhein"
              style={{
                width: '100%', background: '#0f172a', border: '1px solid #334155',
                borderRadius: '0.75rem', padding: '0.75rem 1rem',
                color: '#ffffff', fontSize: '0.875rem', outline: 'none',
                boxSizing: 'border-box', marginBottom: '0.75rem',
                fontFamily: 'inherit'
              }}
            />
            {error && (
              <p style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '0.75rem' }}>{error}</p>
            )}
            <button
              onClick={search}
              disabled={loading}
              style={{
                width: '100%', background: loading ? '#4338ca' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                color: '#ffffff', fontWeight: 900, padding: '0.75rem',
                borderRadius: '0.75rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s'
              }}>
              {loading ? 'Searching...' : 'Check Status →'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Main card */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '1.25rem' }}>
              {/* User info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '3rem', height: '3rem', background: '#1e3a8a', border: '1px solid #3b82f6', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                  👤
                </div>
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 900, fontSize: '1.1rem', margin: 0 }}>{u.name}</p>
                  <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>@{u.username}</p>
                </div>
              </div>

              {/* Status badge */}
              <div style={{
                background: expired ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${expired ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center', marginBottom: '0.75rem'
              }}>
                <p style={{ color: expired ? '#f87171' : '#34d399', fontWeight: 900, fontSize: '1.1rem', margin: 0 }}>
                  {expired ? '❌ Expired' : '✅ Active'}
                </p>
                <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', marginBottom: 0 }}>
                  {expired ? `${Math.abs(diff)} din pehle expire hua` : `${diff} din baad expire hoga`}
                </p>
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  ['Package', u.plan],
                  ['Expiry', exp?.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })],
                  ['Balance', u.balance > 0 ? `Rs. ${u.balance?.toLocaleString()}` : 'Clear'],
                  ['Phone', u.phone || '—'],
                  ['Area', u.area || '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #1e293b' }}>
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{label}</span>
                    <span style={{ color: '#e2e8f0', fontSize: '0.75rem', fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ISP info */}
            {biz && (
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '1rem', padding: '0.75rem 1rem', textAlign: 'center' }}>
                <p style={{ color: '#64748b', fontSize: '0.7rem', margin: 0 }}>Provider</p>
                <p style={{ color: '#ffffff', fontWeight: 900, margin: '0.25rem 0 0' }}>{biz.businessName}</p>
                {biz.businessPhone && (
                  <a href={`tel:${biz.businessPhone}`} style={{ color: '#818cf8', fontSize: '0.75rem', textDecoration: 'none' }}>
                    {biz.businessPhone}
                  </a>
                )}
              </div>
            )}

            {/* Back button */}
            <button
              onClick={() => { setResult(null); setUsername(''); }}
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155',
                color: '#94a3b8', fontWeight: 700, padding: '0.75rem',
                borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.875rem'
              }}>
              ← Dobara Check Karein
            </button>
          </div>
        )}

        {/* Footer */}
        <p style={{ color: '#334155', fontSize: '0.7rem', textAlign: 'center', marginTop: '2rem' }}>
          Powered by MYISP
        </p>
      </div>
    </div>
  );
};

export default CustomerPortal;
