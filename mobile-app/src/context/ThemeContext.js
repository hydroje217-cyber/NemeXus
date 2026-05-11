import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { themes } from '../theme';

const THEME_STORAGE_KEY = 'nemexus-theme-mode';

const ThemeContext = createContext({
  mode: 'light',
  isDark: false,
  palette: themes.light.palette,
  shadows: themes.light.shadows,
  statusBar: themes.light.statusBar,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');

  useEffect(() => {
    let mounted = true;

    async function loadMode() {
      try {
        const storedMode = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
        if (mounted && (storedMode === 'light' || storedMode === 'dark')) {
          setMode(storedMode);
        }
      } catch {
        // Ignore storage failures and keep the default theme.
      }
    }

    loadMode();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(() => {
    const theme = themes[mode] || themes.light;

    return {
      ...theme,
      toggleTheme: async () => {
        const nextMode = mode === 'dark' ? 'light' : 'dark';
        setMode(nextMode);

        try {
          await SecureStore.setItemAsync(THEME_STORAGE_KEY, nextMode);
        } catch {
          // Ignore storage failures and keep the current in-memory theme.
        }
      },
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
