import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const KEY = 'aiw-ui-theme-v1';
const ThemeContext = createContext<{theme: Theme; setTheme: (theme: Theme) => void}>({theme: 'light', setTheme: () => {}});

export function ThemeProvider({children}: {children: ReactNode}) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.aiwTheme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c121a' : '#f5f7fb');
    try { localStorage.setItem(KEY, theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);
  return <ThemeContext.Provider value={{theme, setTheme}}>{children}</ThemeContext.Provider>;
}
export function useThemeClass() {
  const {theme} = useContext(ThemeContext);
  return theme === 'dark' ? 'aiw-dark-workspace' : 'aiw-light-workspace';
}
export function ThemeSwitch({compact = false}: {compact?: boolean}) {
  const {theme, setTheme} = useContext(ThemeContext);
  return <button type="button" role="switch" aria-label="Dark theme" aria-checked={theme === 'dark'}
    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    className="aiw-theme-switch inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs">
    {theme === 'dark' ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
    {!compact && <span>{theme === 'dark' ? 'Switch to light' : 'Switch to dark'}</span>}
  </button>;
}
