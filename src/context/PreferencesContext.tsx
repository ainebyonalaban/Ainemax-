import React, { createContext, useContext, useEffect, useState } from 'react';

export type VideoPreloadMode = 'off' | 'standard' | 'high';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserPreferences {
  theme: ThemeMode;
  autoplayVideos: boolean;
  preloadMode: VideoPreloadMode;
  autoDownloadNextVideos: boolean;
  autoPlayNextMovie: boolean;
  dataSaverMode: boolean;
  compactDensity: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  language: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  autoplayVideos: true,
  preloadMode: 'standard',
  autoDownloadNextVideos: true,
  autoPlayNextMovie: true,
  dataSaverMode: false,
  compactDensity: false,
  reducedMotion: false,
  largeText: false,
  language: 'English (Global)',
};

const STORAGE_KEY = 'ainemax_ui_preferences_v1';

interface PreferencesContextValue {
  preferences: UserPreferences;
  resolvedTheme: 'light' | 'dark';
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function isValidPreloadMode(value: unknown): value is VideoPreloadMode {
  return value === 'off' || value === 'standard' || value === 'high';
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return DEFAULT_PREFERENCES;
      const parsed = JSON.parse(saved) as Partial<UserPreferences>;
      return {
        theme: isValidThemeMode(parsed.theme) ? parsed.theme : DEFAULT_PREFERENCES.theme,
        autoplayVideos:
          typeof parsed.autoplayVideos === 'boolean'
            ? parsed.autoplayVideos
            : DEFAULT_PREFERENCES.autoplayVideos,
        preloadMode: isValidPreloadMode(parsed.preloadMode)
          ? parsed.preloadMode
          : DEFAULT_PREFERENCES.preloadMode,
        autoDownloadNextVideos:
          typeof parsed.autoDownloadNextVideos === 'boolean'
            ? parsed.autoDownloadNextVideos
            : DEFAULT_PREFERENCES.autoDownloadNextVideos,
        autoPlayNextMovie:
          typeof parsed.autoPlayNextMovie === 'boolean'
            ? parsed.autoPlayNextMovie
            : DEFAULT_PREFERENCES.autoPlayNextMovie,
        dataSaverMode:
          typeof parsed.dataSaverMode === 'boolean'
            ? parsed.dataSaverMode
            : DEFAULT_PREFERENCES.dataSaverMode,
        compactDensity:
          typeof parsed.compactDensity === 'boolean'
            ? parsed.compactDensity
            : DEFAULT_PREFERENCES.compactDensity,
        reducedMotion:
          typeof parsed.reducedMotion === 'boolean'
            ? parsed.reducedMotion
            : DEFAULT_PREFERENCES.reducedMotion,
        largeText:
          typeof parsed.largeText === 'boolean'
            ? parsed.largeText
            : DEFAULT_PREFERENCES.largeText,
        language:
          typeof parsed.language === 'string' ? parsed.language : DEFAULT_PREFERENCES.language,
      };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    setSystemPrefersDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    preferences.theme === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : preferences.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    if (preferences.reducedMotion) {
      root.setAttribute('data-reduced-motion', 'true');
    } else {
      root.removeAttribute('data-reduced-motion');
    }
    if (preferences.largeText) {
      root.setAttribute('data-large-text', 'true');
    } else {
      root.removeAttribute('data-large-text');
    }
  }, [resolvedTheme, preferences.reducedMotion, preferences.largeText]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore storage quota errors in restricted browser contexts
    }
  }, [preferences]);

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  return (
    <PreferencesContext.Provider
      value={{ preferences, resolvedTheme, updatePreference, resetPreferences }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
