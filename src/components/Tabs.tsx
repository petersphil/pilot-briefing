"use client";

export type TabKey = "metars" | "tafs" | "notams";

const TABS: { key: TabKey; label: string }[] = [
  { key: "metars", label: "METARs" },
  { key: "tafs", label: "TAFs" },
  { key: "notams", label: "NOTAMs" },
];

/** Persistent bottom bar for thumb switching. */
export function Tabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 px-2 pt-2"
      style={{
        backgroundColor: "rgba(2, 6, 23, 0.92)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
      role="tablist"
      aria-label="Briefing products"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
        {TABS.map((t) => {
          const selected = active === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={selected}
              type="button"
              onClick={() => {
                onChange(t.key);
                window.scrollTo({ top: 0 });
              }}
              className={`rounded-xl py-3 text-sm font-bold transition ${
                selected
                  ? "bg-cyan-500 text-slate-950 shadow"
                  : "bg-slate-800 text-slate-300 ring-1 ring-slate-700 active:bg-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
