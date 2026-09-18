"use client";

import type { FlightCategory } from "@/lib/types";

const COLORS: Record<FlightCategory, { bg: string; fg: string }> = {
  VFR: { bg: "#008000", fg: "#ffffff" },
  MVFR: { bg: "#FFFF00", fg: "#111111" },
  IFR: { bg: "#FF0000", fg: "#ffffff" },
  LIFR: { bg: "#FF00FF", fg: "#ffffff" },
  UNK: { bg: "#4B5563", fg: "#f3f4f6" },
};

export function CategoryBadge({
  category,
  size = "md",
}: {
  category: FlightCategory | string;
  size?: "sm" | "md" | "lg";
}) {
  const cat = (["VFR", "MVFR", "IFR", "LIFR"].includes(String(category).toUpperCase())
    ? String(category).toUpperCase()
    : "UNK") as FlightCategory;
  const { bg, fg } = COLORS[cat];
  const pad = size === "lg" ? "px-3 py-1 text-sm" : size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded font-bold tracking-wide ${pad}`}
      style={{ backgroundColor: bg, color: fg }}
      title={`FAA flight category: ${cat}`}
    >
      {cat}
    </span>
  );
}

export function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
      {(["VFR", "MVFR", "IFR", "LIFR"] as FlightCategory[]).map((c) => (
        <span key={c} className="inline-flex items-center gap-1">
          <CategoryBadge category={c} size="sm" />
          <span className="text-slate-400">
            {c === "VFR" && ">3000′ / >5SM"}
            {c === "MVFR" && "1000–3000′ / 3–5SM"}
            {c === "IFR" && "500–999′ / 1–<3SM"}
            {c === "LIFR" && "<500′ / <1SM"}
          </span>
        </span>
      ))}
    </div>
  );
}
