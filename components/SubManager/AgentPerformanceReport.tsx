import React, { useMemo } from 'react';
import { SubManagerAccount, Receipt, AttendanceLog } from '../../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  Award,
  Zap,
  Target
} from 'lucide-react';

interface AgentPerformanceReportProps {
  subManagers: SubManagerAccount[];
  recentReceipts: Receipt[];
  attendanceLogs: AttendanceLog[];
}

const AgentPerformanceReport: React.FC<AgentPerformanceReportProps> = ({
  subManagers,
  recentReceipts,
  attendanceLogs,
}) => {
  // Aggregate data per agent
  const performanceData = useMemo(() => {
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();

    return subManagers.map(agent => {
      // Collections
      const agentReceipts = recentReceipts.filter(r => {
        const isAgent = r.collectedBy === agent.id || r.collectedBy === agent.username;
        const receiptDate = new Date(r.date);
        const isCurrentMonth = receiptDate.getMonth() === currentMonthNum && receiptDate.getFullYear() === currentYearNum;
        return isAgent && isCurrentMonth;
      });
      const totalCollected = agentReceipts.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
      const transactionCount = agentReceipts.length;

      // Attendance
      const agentLogs = attendanceLogs.filter(l => {
        if (l.subManagerId !== agent.id) return false;
        const logDate = new Date(l.timestamp);
        return logDate.getMonth() === currentMonthNum && logDate.getFullYear() === currentYearNum;
      });
      const checkIns = agentLogs.filter(l => l.type === 'check-in').length;
      const leaves = agentLogs.filter(l => l.type === 'leave').length;
      
      // Calculate a rough "Engagement" score
      // Score = (Transactions * 2) + (Check-ins * 5)
      const engagementScore = (transactionCount * 2) + (checkIns * 5);

      return {
        id: agent.id,
        name: agent.name,
        username: agent.username,
        totalCollected,
        transactionCount,
        checkIns,
        leaves,
        engagementScore,
        avgTransaction: transactionCount > 0 ? totalCollected / transactionCount : 0
      };
    }).sort((a, b) => b.totalCollected - a.totalCollected);
  }, [subManagers, recentReceipts, attendanceLogs]);

  const todayStr = new Date().toDateString();
  const todayTeamCollection = useMemo(() => {
    return recentReceipts
      .filter(r => new Date(r.date).toDateString() === todayStr)
      .reduce((sum, r) => sum + (r.paidAmount || 0), 0);
  }, [recentReceipts, todayStr]);

  const totalTeamCollection = performanceData.reduce((sum, d) => sum + d.totalCollected, 0);
  const totalTeamTransactions = performanceData.reduce((sum, d) => sum + d.transactionCount, 0);
  const topAgent = performanceData[0];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-[#12162a] p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-2xl">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            Rs. {payload[0].value.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {payload[1]?.value} Total Transactions
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#0b1120] p-6 rounded-[2rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform">
            <DollarSign size={48} className="text-emerald-500" />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Today's Team Collection</p>
          <h3 className="text-3xl font-black text-white tracking-tight">Rs. {todayTeamCollection.toLocaleString()}</h3>
          <div className="mt-4 flex items-center gap-2 text-emerald-500">
            <TrendingUp size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Active Today</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <DollarSign size={48} className="text-indigo-500" />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Total Team Collection</p>
          <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Rs. {totalTeamCollection.toLocaleString()}</h3>
          <div className="mt-4 flex items-center gap-2 text-indigo-500">
            <TrendingUp size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Global Stream</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Award size={48} className="text-amber-500" />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Top Performer</p>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate pr-12">{topAgent?.name || 'N/A'}</h3>
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-1">Rs. {topAgent?.totalCollected.toLocaleString() || 0}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Target size={48} className="text-rose-500" />
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">Avg Efficiency</p>
          <h3 className="text-3xl font-black text-rose-500 tracking-tight">
            {totalTeamTransactions > 0 ? Math.round((totalTeamCollection / (subManagers.length * 50000)) * 100) : 0}%
          </h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Team Target Progression</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Collection Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Collection Overview</h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Revenue by Agent</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Revenue</span>
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.1} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                  tickFormatter={(val) => `Rs. ${val/1000}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }} />
                <Bar dataKey="totalCollected" radius={[10, 10, 0, 0]} barSize={40}>
                  {performanceData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={index === 0 ? '#6366f1' : '#cbd5e1'} 
                      fillOpacity={index === 0 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
                <Bar dataKey="transactionCount" hide />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-8 rounded-[2.5rem] shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Performance Scorecard</h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Deep metrics by individual</p>
            </div>
          </div>

          <div className="space-y-6">
            {performanceData.map((agent, index) => (
              <div key={agent.id} className="group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      index === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                    }`}>
                      #{index + 1}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{agent.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{agent.transactionCount} interactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Rs. {agent.totalCollected.toLocaleString()}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Score: {agent.engagementScore}</p>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ease-out ${
                      index === 0 ? 'bg-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-400'
                    }`}
                    style={{ width: `${(agent.totalCollected / (topAgent?.totalCollected || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            
            {performanceData.length === 0 && (
              <div className="py-12 text-center opacity-30">
                <p className="text-xs font-bold uppercase tracking-widest">No performance records</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analytics Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
          <h4 className="text-lg font-bold text-slate-900 dark:text-white">Monthly Analytics</h4>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Current Month</span>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-white/[0.02]">
              <tr>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Agent Info</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attendance</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Collected</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg Transaction</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
              {performanceData.map(agent => (
                <tr key={agent.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                  <td className="px-8 py-4">
                    <p className="font-bold text-slate-900 dark:text-white">{agent.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">@{agent.username}</p>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{agent.checkIns}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Present</p>
                      </div>
                      <div className="w-px h-8 bg-slate-100 dark:bg-white/5" />
                      <div>
                        <p className="text-xs font-bold text-rose-500">{agent.leaves}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Leaves</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-black text-emerald-500">Rs. {agent.totalCollected.toLocaleString()}</p>
                  </td>
                  <td className="px-8 py-4">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Rs. {Math.round(agent.avgTransaction).toLocaleString()}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Per Customer</p>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      {[...Array(5)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-1.5 h-6 rounded-full transition-all ${
                            i < Math.min(5, Math.ceil(agent.engagementScore / 10)) 
                              ? 'bg-indigo-500' 
                              : 'bg-slate-100 dark:bg-white/5'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AgentPerformanceReport;
