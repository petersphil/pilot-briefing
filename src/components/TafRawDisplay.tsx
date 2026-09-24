"use client";

import type { CSSProperties } from "react";
import { FAA_COLORS } from "@/lib/flightCategory";
import { tokenizeTafForDisplay, type TafDisplayToken } from "@/lib/taf-parse";
import { windColor } from "@/lib/wind-display";
import type { FlightCategory, TafData } from "@/lib/types";

function tokenStyle(t: TafDisplayToken): CSSProperties {
  const style: CSSProperties = {};
  if (t.bold) {
    style.fontWeight = 700;
    style.color = "#e2e8f0";
  } else {
    style.fontWeight = 400;
    style.color = "#94a3b8";
  }
  if ((t.kind === "vis" || t.kind === "ceiling") && t.category && t.category !== "UNK") {
    const faa = FAA_COLORS[t.category as FlightCategory];
    style.color = faa.bg;
    style.fontWeight = t.bold ? 700 : 600;
    if (t.category === "MVFR") {
      style.textShadow = "0 0 4px rgba(0,0,0,0.9)";
    }
  }
  if (t.kind === "wind") {
    const c = windColor(t.windBand);
    if (c) {
      style.color = c;
      style.fontWeight = 700;
    }
  }
  return style;
}

export function TafRawDisplay({
  taf,
  departureUtc,
  enrouteMinutes,
}: {
  taf: TafData;
  departureUtc: string;
  enrouteMinutes: number;
}) {
  const dep = new Date(departureUtc);
  const tokens = tokenizeTafForDisplay(
    taf.rawTAF,
    taf.issueTime,
    dep,
    enrouteMinutes,
    taf.fcsts
  );

  const winEndMin = enrouteMinutes + 120;

  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] text-slate-500">
        Bold = flight window (dep → +{winEndMin} min incl. +2h). Ceiling/vis by FAA category;
        wind 15–25 kt yellow, 26–37 amber, {'>'}37 red.
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
        {tokens.map((t, i) => (
          <span key={i} style={tokenStyle(t)}>
            {t.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
