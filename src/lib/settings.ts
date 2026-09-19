/** Device-local settings (RapidAPI key). localStorage + optional Capacitor Preferences. */

const RAPIDAPI_KEY_LS = "pilotBriefing.rapidApiKey";

export async function getRapidApiKey(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: RAPIDAPI_KEY_LS });
      if (value) return value;
    }
  } catch {
    /* Preferences unavailable — fall through */
  }
  try {
    return localStorage.getItem(RAPIDAPI_KEY_LS) || "";
  } catch {
    return "";
  }
}

export async function setRapidApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (typeof window === "undefined") return;
  try {
    if (trimmed) localStorage.setItem(RAPIDAPI_KEY_LS, trimmed);
    else localStorage.removeItem(RAPIDAPI_KEY_LS);
  } catch {
    /* ignore quota */
  }
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import("@capacitor/preferences");
      if (trimmed) await Preferences.set({ key: RAPIDAPI_KEY_LS, value: trimmed });
      else await Preferences.remove({ key: RAPIDAPI_KEY_LS });
    }
  } catch {
    /* ignore */
  }
}
