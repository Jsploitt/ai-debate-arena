import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/lib/debate/presets";
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

    // `storage` fires in the *other* tabs/windows for the same origin. Reload
    // through loadSettings so migrations/default merges stay in one place.
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSettings = useCallback((patch: Partial<ArenaSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
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
