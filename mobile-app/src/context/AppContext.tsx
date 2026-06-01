import React, { createContext, useState, useContext, useEffect } from 'react';
import { fetchHistory, setBackendUrl, getBackendUrl } from '../services/api';
import { ThemeType } from '../theme/theme';

interface AppContextProps {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  backendUrl: string;
  updateBackendUrl: (url: string) => void;
  historyList: any[];
  setHistoryList: React.Dispatch<React.SetStateAction<any[]>>;
  refreshHistory: () => Promise<void>;
  loadingHistory: boolean;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>('cyberpunk');
  const [backendUrl, setBackendUrlState] = useState<string>(getBackendUrl());
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const updateBackendUrl = (url: string) => {
    setBackendUrlState(url);
    setBackendUrl(url);
  };

  const refreshHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetchHistory();
      if (response.status === 'success') {
        setHistoryList(response.data);
      }
    } catch (e) {
      console.log('[AppContext] Failed to refresh history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    refreshHistory();
  }, [backendUrl]);

  return (
    <AppContext.Provider value={{
      theme,
      setTheme,
      backendUrl,
      updateBackendUrl,
      historyList,
      setHistoryList,
      refreshHistory,
      loadingHistory
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
