import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterRouteSheet } from './waterTypes';

interface Props {
  planId: string;
  onClose: () => void;
}

// Print CSS is injected by this component only (removed on unmount).
// The app's global `.no-print` rule hides the on-screen chrome in print;
// the visibility trick below hides everything except the sheet itself.
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body.water-printing * { visibility: hidden !important; }
  body.water-printing #water-print-sheet,
  body.water-printing #water-print-sheet * { visibility: visible !important; }
  body.water-printing #water-print-sheet {
    position: absolute !important; left: 0 !important; top: 0 !important;
    width: 100% !important; margin: 0 !important; padding: 0 !important;
    box-shadow: none !important;
  }
}
`;

const th: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px', fontSize: '11pt',
  fontWeight: 700, textAlign: 'left', background: '#fff', color: '#000',
};
const td: React.CSSProperties = {
  border: '1px solid #000', padding: '4px 6px', fontSize: '11pt', color: '#000',
  verticalAlign: 'top', background: '#fff',
};
const tdEmpty: React.CSSProperties = { ...td, minHeight: '28px', height: '28px' };

export default function PrintRouteSheet({ planId, onClose }: Props): React.JSX.Element {
  const [sheet, setSheet] = useState<WaterRouteSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_route_sheet', { p_plan_id: planId });
      if (error) throw new Error(error.message);
      if (!data || !data.success) {
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(payload || 'Could not load route sheet.');
      }
      setSheet(data as WaterRouteSheet);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load route sheet.');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    document.body.classList.add('water-printing');
    return () => { document.body.classList.remove('water-printing'); };
  }, []);

  const planDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Print route sheet">
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-[#e2e8f0]">
        <button type="button" onClick={onClose} aria-label="Close print preview"
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-[#f1f5f9] text-[#0f172a] flex items-center justify-center text-xl font-black">
          ‹
        </button>
        <div className="flex-1 text-base font-black text-[#0f172a]">Route sheet</div>
        <button type="button" onClick={() => window.print()} disabled={loading || !sheet}
          className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
          Print
        </button>
      </div>

      <div className="p-4">
        {loading && <p className="no-print text-sm text-[#64748b] text-center py-8">Loading sheet…</p>}
        {!loading && error && (
          <div className="no-print rounded-3xl border border-[#e2e8f0] p-8 text-center max-w-md mx-auto">
            <p className="text-base font-bold text-[#0f172a] mb-1">Could not load sheet</p>
            <p className="text-sm text-[#64748b] mb-4 break-words">{error}</p>
            <button type="button" onClick={load} className="min-h-[48px] px-6 rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
              Retry
            </button>
          </div>
        )}
        {!loading && !error && sheet && (
          <div id="water-print-sheet" style={{ background: '#fff', color: '#000', maxWidth: '190mm', margin: '0 auto' }}>
            {/* Heading */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '18pt', fontWeight: 800, color: '#000' }}>
                {sheet.route.name}{sheet.route.area ? ` — ${sheet.route.area}` : ''}
              </div>
              <div style={{ fontSize: '11pt', color: '#000', marginTop: '4px' }}>
                Date: <b>{planDate(sheet.plan.date)}</b>
                {sheet.plan.rider ? <span> &nbsp;•&nbsp; Rider: <b>{sheet.plan.rider}</b></span> : null}
                {sheet.vehicle ? <span> &nbsp;•&nbsp; Vehicle: <b>{sheet.vehicle.name}{sheet.vehicle.plate ? ` (${sheet.vehicle.plate})` : ''}</b></span> : null}
                <span> &nbsp;•&nbsp; Loaded: <b>{sheet.plan.loaded_bottles}</b> bottles</span>
              </div>
            </div>

            {/* Stops table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '28px' }}>#</th>
                  <th style={{ ...th, width: '30%' }}>Customer</th>
                  <th style={{ ...th, width: '44px' }}>Usual</th>
                  <th style={{ ...th, width: '52px' }}>Balance</th>
                  <th style={th}>Delivered<br /><span style={{ fontWeight: 400 }}>دی گئی</span></th>
                  <th style={th}>Empty<br /><span style={{ fontWeight: 400 }}>خالی واپس</span></th>
                  <th style={th}>Cash<br /><span style={{ fontWeight: 400 }}>رقم</span></th>
                  <th style={th}>Sign<br /><span style={{ fontWeight: 400 }}>دستخط</span></th>
                </tr>
              </thead>
              <tbody>
                {sheet.stops.map(s => (
                  <tr key={s.customer_id} style={{ breakInside: 'avoid' }}>
                    <td style={td}>{s.position}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{s.name || '(deleted customer)'}</div>
                      {[s.phone, s.address].filter(Boolean).join(' • ')}
                    </td>
                    <td style={td}>{s.usual_bottles}</td>
                    <td style={td}>{s.bottles_out}</td>
                    <td style={tdEmpty} />
                    <td style={tdEmpty} />
                    <td style={tdEmpty} />
                    <td style={tdEmpty} />
                  </tr>
                ))}
                <tr style={{ breakInside: 'avoid' }}>
                  <td style={td} colSpan={4}><b>Totals</b></td>
                  <td style={tdEmpty} />
                  <td style={tdEmpty} />
                  <td style={tdEmpty} />
                  <td style={tdEmpty} />
                </tr>
              </tbody>
            </table>

            {/* Footer */}
            <div style={{ marginTop: '14px', fontSize: '11pt', color: '#000' }}>
              <div style={{ marginBottom: '10px' }}>Returned bottles: ____________________</div>
              <div>Supervisor sign: ____________________</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
