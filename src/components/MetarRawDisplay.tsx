"use client";

import type { CSSProperties } from "react";
import {
  tokenizeMetarForDisplay,
  windColor,
  type MetarDisplayToken,
} from "@/lib/wind-display";

function tokenStyle(t: MetarDisplayToken): CSSProperties {
  if (t.kind === "wind") {
    const c = windColor(t.windBand);
    if (c) {
      return { color: c, fontWeight: 700 };
    }
  }
  return { color: "#e2e8f0", fontWeight: 400 };
}

export function MetarRawDisplay({ rawOb }: { rawOb: string }) {
  const tokens = tokenizeMetarForDisplay(rawOb);
  return (
    <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">
      {tokens.map((t, i) => (
        <span key={i} style={tokenStyle(t)}>
          {t.text}
        </span>
      ))}
    </pre>
  );
}
