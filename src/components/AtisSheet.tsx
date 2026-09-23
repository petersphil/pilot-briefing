"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import type { AtisLink } from "@/lib/atis";

type Props = {
  link: AtisLink | null;
  onClose: () => void;
};

/**
 * Full-screen in-app ATIS / AeroView sheet. Close returns to the briefing
 * without navigating away from the app. If the site blocks embedding,
 * fall back to Capacitor Browser (Custom Tabs) / a new tab.
 */
export function AtisSheet({ link, onClose }: Props) {
  const [mode, setMode] = useState<"embed" | "fallback">("embed");

  useEffect(() => {
    setMode("embed");
  }, [link?.url]);

  useEffect(() => {
    if (!link) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [link, onClose]);

  const openInAppBrowser = useCallback(async () => {
    if (!link) return;
    const native = typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();
    if (native) {
      await Browser.open({ url: link.url, presentationStyle: "popover" });
      onClose();
      return;
    }
    window.open(link.url, "_blank", "noopener,noreferrer");
  }, [link, onClose]);

  if (!link) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label={link.title}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white ring-1 ring-slate-600 active:bg-slate-700"
        >
          ← Briefing
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{link.title}</p>
          <p className="truncate font-mono text-[10px] text-slate-500">{link.url}</p>
        </div>
        <button
          type="button"
          onClick={() => void openInAppBrowser()}
          className="rounded-lg px-2 py-2 text-xs text-sky-300 ring-1 ring-slate-700 active:bg-slate-800"
        >
          Browser
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-slate-900">
        {mode === "fallback" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="max-w-sm text-sm text-slate-300">
              This page couldn&apos;t be embedded. Open it in the in-app browser — closing that
              returns you to the briefing.
            </p>
            <button
              type="button"
              onClick={() => void openInAppBrowser()}
              className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open {link.label}
            </button>
          </div>
        ) : (
          <>
            <iframe
              title={link.title}
              src={link.url}
              className="absolute inset-0 h-full w-full border-0 bg-white"
              // allow-popups needed for some ATIS SPAs; same-origin for their scripts
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              referrerPolicy="no-referrer-when-downgrade"
              onError={() => setMode("fallback")}
            />
            {/* Sites that send X-Frame-Options still "load" but show blank — offer escape hatch */}
            <button
              type="button"
              onClick={() => setMode("fallback")}
              className="absolute bottom-3 right-3 rounded-full bg-slate-900/90 px-3 py-1.5 text-[11px] font-medium text-slate-200 ring-1 ring-slate-600"
            >
              Page blank? Open in browser
            </button>
          </>
        )}
      </div>
    </div>
  );
}
