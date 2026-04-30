import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// Save app state to Supabase
export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  try {
    await supabase
      .from('manager_data')
      .upsert(
        { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
        { onConflict: 'manager_id' }
      );
  } catch (err) {
    console.error('Supabase save error:', err);
  }
};

// Load app state from Supabase
export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  try {
    const { data, error } = await supabase
      .from('manager_data')
      .select('data')
      .eq('manager_id', managerId)
      .single();

    if (error || !data) return null;
    return data.data as AppState;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
};
