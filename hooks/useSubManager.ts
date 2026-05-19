import { useState, useCallback } from 'react';
import { SubManagerAccount, AttendanceLog, Receipt } from '../types';

export const useSubManager = (
  initialSubManagers: SubManagerAccount[] = [],
  initialLogs: AttendanceLog[] = []
) => {
  const [subManagers, setSubManagers] = useState<SubManagerAccount[]>(initialSubManagers);
  const [logs, setLogs] = useState<AttendanceLog[]>(initialLogs);

  const updateDutyStatus = useCallback((
    subManagerId: string, 
    status: 'online' | 'offline', 
    location?: { lat: number, lng: number }
  ) => {
    setSubManagers(prev => prev.map(sm => {
      if (sm.id === subManagerId) {
        return {
          ...sm,
          dutyStatus: status,
          lastCheckIn: status === 'online' ? new Date().toISOString() : sm.lastCheckIn,
          lastCheckOut: status === 'offline' ? new Date().toISOString() : sm.lastCheckOut,
          lastLocation: location ? { ...location, timestamp: new Date().toISOString() } : sm.lastLocation
        };
      }
      return sm;
    }));

    const newLog: AttendanceLog = {
      id: `log_${Date.now()}`,
      subManagerId,
      type: status === 'online' ? 'check-in' : 'check-out',
      timestamp: new Date().toISOString(),
      location
    };
    setLogs(prev => [newLog, ...prev]);
  }, []);

  const updateLocation = useCallback((subManagerId: string, location: { lat: number, lng: number }) => {
    setSubManagers(prev => prev.map(sm => {
      if (sm.id === subManagerId) {
        return {
          ...sm,
          lastLocation: { ...location, timestamp: new Date().toISOString() }
        };
      }
      return sm;
    }));
  }, []);

  return {
    subManagers,
    logs,
    updateDutyStatus,
    updateLocation
  };
};
