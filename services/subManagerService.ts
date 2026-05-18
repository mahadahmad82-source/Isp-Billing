// ================================================================
// SubManager Service — Supabase Real-time Backend
// ================================================================
import { supabase } from '../lib/supabase';
import { SubManagerAccount, AttendanceLog } from '../types';

// ── TYPE HELPERS ─────────────────────────────────────────────────
const dbToSubManager = (row: any): SubManagerAccount => ({
  id:            row.id,
  username:      row.username,
  name:          row.name,
  managerUsername: row.manager_id,
  dutyStatus:    row.duty_status === 'online' ? 'online' : 'offline',
  lastCheckIn:   row.last_check_in,
  lastCheckOut:  row.last_check_out,
  lastLocation:  row.last_location,
  area:          row.assigned_area,
  isLeave:       row.is_leave,
  email:         row.email,
  contact:       row.contact,
  commissionRate: row.commission_rate,
  salary:        row.salary,
  totalCollections: row.total_collections,
  authUserId:    row.auth_user_id,
});

const dbToAttendanceLog = (row: any): AttendanceLog => ({
  id:           row.id,
  subManagerId: row.sub_manager_id,
  type:         row.type,
  timestamp:    row.timestamp,
  reason:       row.reason,
  location:     row.location,
});

// ── FETCH ALL SUB MANAGERS for a manager ─────────────────────────
export const fetchSubManagers = async (managerId: string): Promise<SubManagerAccount[]> => {
  const { data, error } = await supabase
    .from('sub_managers')
    .select('*')
    .eq('manager_id', managerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbToSubManager);
};

// ── RECRUIT NEW AGENT ─────────────────────────────────────────────
export const recruitAgent = async (
  managerId: string,
  agentData: {
    name: string; username: string; email: string;
    password: string; contact: string; area: string;
    salary: number; commissionRate?: number;
  }
): Promise<SubManagerAccount> => {
  // 1) Create Supabase Auth user for agent
  let authUserId: string | null = null;
  if (agentData.email) {
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: agentData.email,
      password: agentData.password,
      options: { data: { full_name: agentData.name, role: 'agent', manager_id: managerId } }
    });
    if (!authErr && authData.user) authUserId = authData.user.id;
  }

  // 2) Insert into sub_managers table
  const { data, error } = await supabase
    .from('sub_managers')
    .insert({
      manager_id:      managerId,
      auth_user_id:    authUserId,
      username:        agentData.username,
      name:            agentData.name,
      email:           agentData.email,
      contact:         agentData.contact,
      assigned_area:   agentData.area,
      salary:          agentData.salary,
      commission_rate: agentData.commissionRate ?? 0,
      role:            'agent',
      duty_status:     'offline',
    })
    .select()
    .single();

  if (error) throw error;

  // 3) Log activity
  await logActivity(data.id, managerId, 'recruited', `New agent ${agentData.name} recruited`);

  return dbToSubManager(data);
};

// ── UPDATE AGENT ──────────────────────────────────────────────────
export const updateAgent = async (
  agentId: string,
  managerId: string,
  updates: Partial<{
    name: string; username: string; email: string;
    contact: string; assigned_area: string;
    salary: number; commission_rate: number;
  }>
): Promise<SubManagerAccount> => {
  const { data, error } = await supabase
    .from('sub_managers')
    .update(updates)
    .eq('id', agentId)
    .eq('manager_id', managerId)
    .select()
    .single();

  if (error) throw error;
  await logActivity(agentId, managerId, 'profile-updated', 'Agent profile updated');
  return dbToSubManager(data);
};

// ── DELETE AGENT ──────────────────────────────────────────────────
export const deleteAgent = async (agentId: string, managerId: string): Promise<void> => {
  const { error } = await supabase
    .from('sub_managers')
    .delete()
    .eq('id', agentId)
    .eq('manager_id', managerId);
  if (error) throw error;
};

// ── DUTY STATUS TOGGLE (Check-in / Check-out) ─────────────────────
export const updateDutyStatus = async (
  agentId: string,
  managerId: string,
  status: 'online' | 'offline',
  location?: { lat: number; lng: number }
): Promise<void> => {
  const now = new Date().toISOString();
  const updates: any = {
    duty_status: status,
    last_location: location ? { ...location, timestamp: now } : undefined,
  };
  if (status === 'online')  updates.last_check_in  = now;
  if (status === 'offline') updates.last_check_out = now;

  const { error: updateErr } = await supabase
    .from('sub_managers')
    .update(updates)
    .eq('id', agentId);
  if (updateErr) throw updateErr;

  // Log attendance
  await addAttendanceLog({
    sub_manager_id: agentId,
    manager_id:     managerId,
    type:           status === 'online' ? 'check-in' : 'check-out',
    location,
    timestamp:      now,
  });

  await logActivity(
    agentId, managerId,
    status === 'online' ? 'check-in' : 'check-out',
    status === 'online' ? 'Agent checked in' : 'Agent checked out',
    location ? { location } : {}
  );
};

// ── ATTENDANCE LOGS ───────────────────────────────────────────────
export const fetchAttendanceLogs = async (
  managerId: string,
  agentId?: string
): Promise<AttendanceLog[]> => {
  let query = supabase
    .from('attendance_logs')
    .select('*')
    .eq('manager_id', managerId)
    .order('timestamp', { ascending: false })
    .limit(500);

  if (agentId) query = query.eq('sub_manager_id', agentId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(dbToAttendanceLog);
};

export const addAttendanceLog = async (log: {
  sub_manager_id: string; manager_id: string;
  type: 'check-in' | 'check-out' | 'leave';
  timestamp?: string; reason?: string;
  location?: { lat: number; lng: number };
}): Promise<AttendanceLog> => {
  const { data, error } = await supabase
    .from('attendance_logs')
    .insert({ ...log, timestamp: log.timestamp || new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return dbToAttendanceLog(data);
};

export const updateAttendanceLog = async (
  logId: string,
  updates: Partial<{ type: string; reason: string; location: any }>
): Promise<void> => {
  const { error } = await supabase
    .from('attendance_logs')
    .update(updates)
    .eq('id', logId);
  if (error) throw error;
};

export const deleteAttendanceLog = async (logId: string): Promise<void> => {
  const { error } = await supabase
    .from('attendance_logs')
    .delete()
    .eq('id', logId);
  if (error) throw error;
};

// ── ACTIVITY LOGS ─────────────────────────────────────────────────
export const logActivity = async (
  subManagerId: string,
  managerId: string,
  actionType: string,
  description: string,
  metadata: any = {}
): Promise<void> => {
  await supabase.from('activity_logs').insert({
    sub_manager_id: subManagerId,
    manager_id:     managerId,
    action_type:    actionType,
    description,
    metadata,
    timestamp:      new Date().toISOString(),
  });
};

export const fetchActivityLogs = async (
  managerId: string,
  agentId?: string,
  limit = 100
): Promise<any[]> => {
  let query = supabase
    .from('activity_logs')
    .select('*, sub_managers(name, username)')
    .eq('manager_id', managerId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (agentId) query = query.eq('sub_manager_id', agentId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// ── PERFORMANCE DATA ──────────────────────────────────────────────
export const fetchAgentPerformance = async (
  managerId: string,
  agentId: string
): Promise<{ checkIns: number; checkOuts: number; leaves: number; totalHours: number }> => {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('type, timestamp')
    .eq('manager_id', managerId)
    .eq('sub_manager_id', agentId);

  if (error) throw error;
  const logs = data || [];
  const checkIns  = logs.filter(l => l.type === 'check-in').length;
  const checkOuts = logs.filter(l => l.type === 'check-out').length;
  const leaves    = logs.filter(l => l.type === 'leave').length;

  // Estimate total hours (check-in / check-out pairs)
  let totalHours = 0;
  const ins  = logs.filter(l => l.type === 'check-in').map(l => new Date(l.timestamp).getTime());
  const outs = logs.filter(l => l.type === 'check-out').map(l => new Date(l.timestamp).getTime());
  const pairs = Math.min(ins.length, outs.length);
  for (let i = 0; i < pairs; i++) {
    const diff = outs[i] - ins[i];
    if (diff > 0) totalHours += diff / (1000 * 60 * 60);
  }

  return { checkIns, checkOuts, leaves, totalHours: Math.round(totalHours * 10) / 10 };
};

// ── ASSIGN CUSTOMER TO AGENT ──────────────────────────────────────
export const assignCustomerToAgent = async (
  customerId: string,
  agentId: string | null
): Promise<void> => {
  const { error } = await supabase
    .from('customers')
    .update({ sub_manager_id: agentId })
    .eq('id', customerId);
  if (error) throw error;
};

// ── REAL-TIME SUBSCRIPTION ────────────────────────────────────────
export const subscribeToSubManagers = (
  managerId: string,
  onUpdate: (agents: SubManagerAccount[]) => void
) => {
  const channel = supabase
    .channel(`sub_managers_${managerId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sub_managers',
      filter: `manager_id=eq.${managerId}`,
    }, async () => {
      // Re-fetch on any change
      const agents = await fetchSubManagers(managerId);
      onUpdate(agents);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
};

export const subscribeToAttendance = (
  managerId: string,
  onUpdate: (logs: AttendanceLog[]) => void
) => {
  const channel = supabase
    .channel(`attendance_${managerId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'attendance_logs',
      filter: `manager_id=eq.${managerId}`,
    }, async () => {
      const logs = await fetchAttendanceLogs(managerId);
      onUpdate(logs);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
};
