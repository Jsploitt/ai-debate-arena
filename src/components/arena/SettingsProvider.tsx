import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
} from "@/lib/debate/presets";
import type { ArenaSettings } from "@/lib/debate/types";

interface SettingsContextValue {
  settings: ArenaSettings;
  /** Shallow patch of top-level keys; nested objects must be spread by the caller. */
  updateSettings: (patch: Partial<ArenaSettings>) => void;
  resetSettings: () => void;
  /** False until persisted settings have been read on the client. */
  hydrated: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Holds the persisted arena settings for the whole app.
 *
 * Initialised from DEFAULT_SETTINGS and only replaced from localStorage inside
 * an effect — reading storage during render would produce a different tree on
 * the server than on the client and break hydration.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);

    // `storage` fires in every OTHER tab of this origin, so a change made in one
    // tab reaches the rest. Without this, a second tab kept rendering — and
    // re-saving — the configuration as it was when that tab was opened.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SETTINGS_STORAGE_KEY) return;
      setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSettings = useCallback((patch: Partial<ArenaSettings>) => {
    // Merge onto what is actually persisted, not onto this tab's copy. Merging
    // onto a stale copy meant a second tab's next edit silently reverted every
    // unrelated setting another tab had changed in the meantime.
    const next = { ...loadSettings(), ...patch };
    saveSettings(next);
    setSettings(next);
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, hydrated }),
    [settings, updateSettings, resetSettings, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside a SettingsProvider");
  }
  return context;
}
