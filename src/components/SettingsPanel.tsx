"use client";

import { FormEvent, useEffect, useState } from "react";
import { getRapidApiKey, setRapidApiKey } from "@/lib/settings";

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSaved(false);
    getRapidApiKey()
      .then((v) => setKey(v))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    await setRapidApiKey(key);
    setSaved(true);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl bg-slate-900 p-5 shadow-2xl ring-1 ring-slate-700 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label htmlFor="rapidapi" className="mb-1 block text-sm font-medium text-slate-300">
              RapidAPI key (SkyLink NOTAMs)
            </label>
            <input
              id="rapidapi"
              type="password"
              autoComplete="off"
              disabled={loading}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setSaved(false);
              }}
              placeholder="Your RapidAPI key"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-400">Personal use only.</strong> Key is stored on this
              device (localStorage / app preferences) — not uploaded to our servers. Required for
              US, Caribbean, and other non-Canadian NOTAMs via SkyLink. Canadian NOTAMs (NAV CANADA
              CFPS) need no key.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500"
          >
            Save key
          </button>
          {saved && (
            <p className="text-center text-xs text-emerald-400">Saved on this device.</p>
          )}
        </form>
      </div>
    </div>
  );
}
