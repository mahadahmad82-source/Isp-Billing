
import React, { useState, useEffect, useMemo } from 'react';
import { UserRecord, Receipt, AppSettings } from '../types';
import { analyzeTrends } from '../services/geminiService';

interface InsightsProps {
  users: UserRecord[];
  receipts: Receipt[];
}

const Insights: React.FC<InsightsProps> = ({ users, receipts }) => {
  const [insight, setInsight] = useState('Generating strategic insights...');
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchInsight = async () => {
      setLoading(true);
      const res = await analyzeTrends(receipts);
      setInsight(res || 'Unable to generate analysis at this time.');
      setLoading(false);
    };
    fetchInsight();
  }, [receipts]);

  // Extract available years from receipts
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    (receipts || []).forEach(r => {
      const year = new Date(r.date).getFullYear();
      if (!isNaN(year)) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [receipts]);

  // Calculate Yearly Report Data
  const yearlyReport = useMemo(() => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const monthlyData = months.map(month => {
      const filtered = (receipts || []).filter(r => {
        const rDate = new Date(r.date);
        return rDate.getFullYear() === selectedYear && (r.period || '').includes(month);
      });

      const collected = filtered.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
      const count = filtered.length;

      return {
        month,
        collected,
        count
      };
    });

    const totalAnnual = monthlyData.reduce((sum, m) => sum + m.collected, 0);
    const avgMonthly = totalAnnual / (new Date().getFullYear() === selectedYear ? (new Date().getMonth() + 1) : 12);
    const peakMonth = [...monthlyData].sort((a, b) => b.collected - a.collected)[0];

    return {
      monthlyData,
      totalAnnual,
      avgMonthly,
      peakMonth
    };
  }, [receipts, selectedYear]);

  return (
    <div className="space-y-6 md:space-y-10 pb-24 animate-in fade-in duration-700">
      {/* AI Strategy Header - Mobile Friendly */}
      <div className="bg-indigo-900 dark:bg-indigo-950 p-6 md:p-12 rounded-[2rem] md:rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row gap-8 md:gap-12 items-start md:items-center">
          <div className="flex-1">
            <div className="inline-block px-4 py-1.5 bg-indigo-500/30 rounded-full text-[9px] font-black uppercase tracking-[0.2em] mb-4 border border-indigo-400/20">
              Enterprise Intelligence
            </div>
            <h3 className="text-3xl md:text-4xl font-black mb-4 tracking-tight leading-none uppercase">Business <br/>Performance</h3>
            <p className="text-white opacity-70 text-xs md:text-sm font-medium leading-relaxed max-w-xl">
              Analyzing recovery cycles to optimize bandwidth allocation and subscription pricing strategies for your local network.
            </p>
          </div>
          <div className="w-full md:w-auto bg-white/10 backdrop-blur-xl border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">🤖</div>
              <div>
                <p className="font-black text-sm uppercase tracking-tight text-white">Financial AI</p>
                <p className="text-[9px] font-black text-white opacity-80 uppercase tracking-widest">Real-time Analysis</p>
              </div>
            </div>
            <div className="text-xs text-white opacity-90 leading-relaxed italic">
              {loading ? (
                <div className="flex gap-2 py-2">
                  <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-200"></div>
                </div>
              ) : insight}
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
      </div>

      {/* Annual Revenue Professional Report */}
      <section className="bg-white dark:bg-[#0f172a] rounded-[2rem] md:rounded-[3.5rem] shadow-xl border border-slate-100 dark:border-white/5 overflow-hidden">
        {/* Report Header */}
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
               <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            </div>
            <div>
               <h4 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Yearly Ledger</h4>
               <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue Year {selectedYear}</p>
            </div>
          </div>
          <div className="w-full sm:w-auto flex items-center gap-3 bg-slate-50 dark:bg-[#030712] p-2 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs outline-none cursor-pointer appearance-none text-center"
            >
              {availableYears.map(y => <option key={y} value={y}>YEAR {y}</option>)}
            </select>
          </div>
        </div>

        {/* Top Analytics Cards - Mobile Stack */}
        <div className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
           <div className="bg-slate-50 dark:bg-[#030712] p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-white/5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gross Annual Revenue</p>
              <p className="text-3xl md:text-4xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">Rs. {yearlyReport.totalAnnual.toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                 <span className="text-[8px] font-black text-indigo-600/60 uppercase tracking-widest italic">Consolidated</span>
              </div>
           </div>
           <div className="bg-slate-50 dark:bg-[#030712] p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-white/5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Average Monthly Yield</p>
              <p className="text-3xl md:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">Rs. {Math.round(yearlyReport.avgMonthly).toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-2 text-emerald-600/60">
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                 <span className="text-[8px] font-black uppercase tracking-widest italic">Growth Factor</span>
              </div>
           </div>
           <div className="bg-slate-800 dark:bg-indigo-600 p-6 md:p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-500/10">
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-1">Peak Collection</p>
              <p className="text-3xl md:text-4xl font-black tracking-tighter uppercase">{yearlyReport.peakMonth.month}</p>
              <p className="text-xs font-black mt-1 opacity-90">Rs. {yearlyReport.peakMonth.collected.toLocaleString()}</p>
           </div>
        </div>

        {/* Detailed Monthly Scrollable Ledger */}
        <div className="px-6 md:px-10 pb-10">
          <div className="bg-slate-50 dark:bg-[#030712] rounded-[2rem] border border-slate-100 dark:border-white/5 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[500px]">
                <thead className="bg-white/50 dark:bg-white/5 text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-5">Month</th>
                    <th className="px-6 py-5">Trend</th>
                    <th className="px-6 py-5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {yearlyReport.monthlyData.map((data) => {
                    const percentage = yearlyReport.totalAnnual > 0 ? (data.collected / yearlyReport.totalAnnual) * 100 : 0;
                    return (
                      <tr key={data.month} className="hover:bg-white dark:hover:bg-indigo-500/5 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight">{data.month}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-24 md:w-32 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full transition-all duration-1000" 
                              style={{ width: `${Math.max(2, percentage)}%` }}
                            ></div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-slate-900 dark:text-slate-100">Rs. {data.collected.toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-slate-400">{data.count} Payments</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Snapshot Cards - Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0f172a] p-8 md:p-10 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl">
          <h4 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3 uppercase tracking-tight">
            <span className="w-8 h-8 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center text-sm">📈</span> Growth Metrics
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-[#030712] rounded-2xl border border-slate-100 dark:border-white/5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Avg Payment / Unit</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">Rs. {Math.round((receipts || []).length > 0 ? (receipts || []).reduce((s,r) => s + (r.paidAmount || 0), 0) / receipts.length : 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-[#030712] rounded-2xl border border-slate-100 dark:border-white/5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Retention Target</span>
              <span className="text-sm font-black text-emerald-500">95%</span>
            </div>
            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-[#030712] rounded-2xl border border-slate-100 dark:border-white/5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Receivables</span>
              <span className="text-sm font-black text-rose-500">Rs. {(users || []).filter(u => u.status === 'expired').reduce((s,u) => s + (u.balance || 0), 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-8 md:p-10 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl flex flex-col items-center">
          <h4 className="w-full text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3 uppercase tracking-tight">
            <span className="w-8 h-8 bg-purple-500/10 text-purple-500 rounded-lg flex items-center justify-center text-sm">🛡️</span> Recovery Status
          </h4>
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <circle className="stroke-slate-100 dark:stroke-slate-800 stroke-[3]" fill="none" cx="18" cy="18" r="16" />
              <circle className="stroke-indigo-600 dark:stroke-indigo-400 stroke-[3] transition-all duration-1000" strokeDasharray="80, 100" strokeLinecap="round" fill="none" cx="18" cy="18" r="16" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">80%</span>
              <span className="text-[8px] text-slate-400 font-black uppercase tracking-[0.2em]">HEALTH</span>
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-6 w-full">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              <span className="text-[9px] font-black text-slate-500 uppercase">ACTIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              <span className="text-[9px] font-black text-slate-500 uppercase">PENDING</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Insights;
