import { useState, useEffect } from 'react';

export const useIsDark = (): boolean => {
  const getTheme = (): boolean => {
    try {
      const session = localStorage.getItem('mahadnet_active_session');
      if (!session) return true;
      const raw = localStorage.getItem(`mahadnet_data_${session}`);
      if (!raw) return true;
      return JSON.parse(raw).theme !== 'light';
    } catch {
      return true;
    }
  };

  const [isDark, setIsDark] = useState<boolean>(getTheme);

  useEffect(() => {
    const handler = () => setIsDark(getTheme());
    window.addEventListener('storage', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  return isDark;
};
