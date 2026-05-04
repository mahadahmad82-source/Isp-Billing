import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadState, saveState } from '../utils/storage';
import { saveStateToSupabase } from '../utils/supabaseSync';
import EmployeePanel from './EmployeePanel';
import { AppState, Receipt } from '../types';

interface Props {
  session: { managerName: string; employeeName: string };
  theme: 'light' | 'dark';
  onLogout: () => void;
}

const EmployeeSessionLoader: React.FC<Props> = ({ session, theme, onLogout }) => {
  const [managerState, setManagerState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadManagerData = async () => {
      try {
        // Try Supabase first
        const { data } = await supabase
          .from('manager_data')
          .select('data')
          .eq('manager_id', session.managerName)
          .maybeSingle();

        if (data?.data) {
          setManagerState(data.data as AppState);
        } else {
          // Fallback to localStorage
          const localState = loadState(session.managerName);
          setManagerState(localState);
        }
      } catch {
        const localState = loadState(session.managerName);
        setManagerState(localState);
      } finally {
        setLoading(false);
      }
    };

    loadManagerData();
  }, [session.managerName]);

  const handleAddReceipt = (receipt: Receipt) => {
    if (!managerState) return;
    const updated = {
      ...managerState,
      receipts: [...(managerState.receipts || []), receipt],
      currentManager: session.managerName,
    };
    setManagerState(updated);
    saveState(updated);
    saveStateToSupabase(session.managerName, updated);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className={`text-xs font-black uppercase tracking-widest ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <EmployeePanel
      managerName={session.managerName}
      employeeName={session.employeeName}
      users={managerState?.users || []}
      receipts={managerState?.receipts || []}
      settings={managerState?.settings || {} as any}
      onAddReceipt={handleAddReceipt}
      onLogout={onLogout}
      theme={theme}
    />
  );
};

export default EmployeeSessionLoader;
