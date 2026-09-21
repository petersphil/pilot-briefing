"use client";

export type TabKey = "metars" | "tafs" | "notams";

const TABS: { key: TabKey; label: string }[] = [
  { key: "metars", label: "METARs" },
  { key: "tafs", label: "TAFs" },
  { key: "notams", label: "NOTAMs" },
];

export function Tabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
      role="tablist"
      aria-label="Briefing products"
    >
      {TABS.map((t) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              selected
                ? "bg-cyan-500 text-slate-950 shadow"
                : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
