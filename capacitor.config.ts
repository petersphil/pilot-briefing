import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ca.empressaero.pilotbriefing",
  appName: "Pilot Briefing",
  webDir: "out",
  server: {
    // All briefing APIs are HTTPS; no cleartext needed
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // We call CapacitorHttp explicitly via nativeAwareFetch — do not globally patch fetch
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
