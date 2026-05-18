// ================================================================
// useSubManager Hook — Supabase Real-time
// ================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { SubManagerAccount, AttendanceLog } from '../types';
import {
  fetchSubManagers, fetchAttendanceLogs,
  updateDutyStatus as dbUpdateDutyStatus,
  addAttendanceLog as dbAddAttendanceLog,
  updateAttendanceLog as dbUpdateAttendanceLog,
  deleteAttendanceLog as dbDeleteAttendanceLog,
  updateAgent as dbUpdateAgent,
  deleteAgent as dbDeleteAgent,
  subscribeToSubManagers, subscribeToAttendance,
} from '../services/subManagerService';

export const useSubManager = (managerId: string) => {
  const [subManagers, setSubManagers]   = useState<SubManagerAccount[]>([]);
  const [logs, setLogs]                 = useState<AttendanceLog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const unsubAgents    = useRef<(() => void) | null>(null);
  const unsubAttendance = useRef<(() => void) | null>(null);

  // ── Initial Load ─────────────────────────────────────────────
  useEffect(() => {
    if (!managerId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const [agents, attendance] = await Promise.all([
          fetchSubManagers(managerId),
          fetchAttendanceLogs(managerId),
        ]);
        if (mounted) { setSubManagers(agents); setLogs(attendance); }
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    // Real-time subscriptions
    unsubAgents.current    = subscribeToSubManagers(managerId, (agents) => {
      if (mounted) setSubManagers(agents);
    });
    unsubAttendance.current = subscribeToAttendance(managerId, (attendance) => {
      if (mounted) setLogs(attendance);
    });

    return () => {
      mounted = false;
      unsubAgents.current?.();
      unsubAttendance.current?.();
    };
  }, [managerId]);

  // ── Duty Status Toggle ────────────────────────────────────────
  const updateDutyStatus = useCallback(async (
    subManagerId: string,
    status: 'online' | 'offline',
    location?: { lat: number; lng: number }
  ) => {
    // Optimistic UI update
    setSubManagers(prev => prev.map(sm =>
      sm.id === subManagerId
        ? {
            ...sm,
            dutyStatus: status,
            lastCheckIn:  status === 'online'  ? new Date().toISOString() : sm.lastCheckIn,
            lastCheckOut: status === 'offline' ? new Date().toISOString() : sm.lastCheckOut,
            lastLocation: location ? { ...location, timestamp: new Date().toISOString() } : sm.lastLocation,
          }
        : sm
    ));

    try {
      await dbUpdateDutyStatus(subManagerId, managerId, status, location);
    } catch (err: any) {
      setError(err.message);
      // Revert optimistic update on error
      const agents = await fetchSubManagers(managerId);
      setSubManagers(agents);
    }
  }, [managerId]);

  // ── Attendance CRUD ───────────────────────────────────────────
  const addAttendanceLog = useCallback(async (
    log: Omit<AttendanceLog, 'id'>
  ) => {
    try {
      const newLog = await dbAddAttendanceLog({
        sub_manager_id: log.subManagerId,
        manager_id:     managerId,
        type:           log.type,
        reason:         log.reason,
        location:       log.location,
        timestamp:      log.timestamp,
      });
      setLogs(prev => [newLog, ...prev]);
    } catch (err: any) {
      setError(err.message);
    }
  }, [managerId]);

  const updateAttendanceLog = useCallback(async (
    logId: string,
    updates: Partial<AttendanceLog>
  ) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, ...updates } : l));
    try {
      await dbUpdateAttendanceLog(logId, {
        type:     updates.type,
        reason:   updates.reason,
        location: updates.location,
      });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const deleteAttendanceLog = useCallback(async (logId: string) => {
    setLogs(prev => prev.filter(l => l.id !== logId));
    try {
      await dbDeleteAttendanceLog(logId);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ── Agent CRUD ────────────────────────────────────────────────
  const editAgent = useCallback(async (agentId: string, updates: any) => {
    try {
      const updated = await dbUpdateAgent(agentId, managerId, {
        name:          updates.name,
        username:      updates.username,
        email:         updates.email,
        contact:       updates.contact,
        assigned_area: updates.area,
        salary:        updates.salary,
      });
      setSubManagers(prev => prev.map(sm => sm.id === agentId ? updated : sm));
    } catch (err: any) {
      setError(err.message);
    }
  }, [managerId]);

  const removeAgent = useCallback(async (agentId: string) => {
    setSubManagers(prev => prev.filter(sm => sm.id !== agentId));
    try {
      await dbDeleteAgent(agentId, managerId);
    } catch (err: any) {
      setError(err.message);
      const agents = await fetchSubManagers(managerId);
      setSubManagers(agents);
    }
  }, [managerId]);

  const addAgent = useCallback((agent: SubManagerAccount) => {
    setSubManagers(prev => [agent, ...prev]);
  }, []);

  const updateLocation = useCallback(async (
    subManagerId: string,
    location: { lat: number; lng: number }
  ) => {
    setSubManagers(prev => prev.map(sm =>
      sm.id === subManagerId
        ? { ...sm, lastLocation: { ...location, timestamp: new Date().toISOString() } }
        : sm
    ));
  }, []);

  return {
    subManagers, logs, loading, error,
    updateDutyStatus, updateLocation,
    addAttendanceLog, updateAttendanceLog, deleteAttendanceLog,
    editAgent, removeAgent, addAgent,
  };
};
