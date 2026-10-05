"use client";

import { Fragment, type CSSProperties } from "react";
import {
  notamOverlapsFlightWindow,
  rscColor,
  tokenizeNotamForDisplay,
  type NotamDisplayToken,
} from "@/lib/notam-display";
import { splitLearnTokens } from "@/lib/notam-learn";
import type { NotamItem } from "@/lib/types";

function tokenStyle(t: NotamDisplayToken, overlaps: boolean): CSSProperties {
  const style: CSSProperties = {};
  if (t.kind === "hazard") {
    style.fontWeight = 700;
    style.color = "#ef4444";
    return style;
  }
  if (t.kind === "caution") {
    style.fontWeight = 700;
    style.color = "#f97316"; // orange: NOT AUTH, LDA/TODA/ASDA
    return style;
  }
  if (t.kind === "rsc" && t.rscLevel != null) {
    const c = rscColor(t.rscLevel);
    if (c) {
      style.color = c;
      style.fontWeight = 700;
      return style;
    }
  }
  if (t.bold || overlaps) {
    style.fontWeight = 700;
    style.color = "#e2e8f0";
  } else {
    style.fontWeight = 400;
    style.color = "#94a3b8";
  }
  return style;
}

export function NotamDisplay({
  notam,
  departureUtc,
  enrouteMinutes,
  highlightNonStandard = false,
}: {
  notam: NotamItem;
  departureUtc: string;
  enrouteMinutes: number;
  /** Learn mode: paint tokens outside the fixed aviation list red. */
  highlightNonStandard?: boolean;
}) {
  const dep = new Date(departureUtc);
  const overlaps = notamOverlapsFlightWindow(notam, dep, enrouteMinutes);
  const tokens = tokenizeNotamForDisplay(notam.text, overlaps);

  return (
    <pre
      className={`whitespace-pre-wrap break-words font-mono text-[11px] leading-snug ${
        overlaps ? "" : "opacity-80"
      }`}
    >
      {tokens.map((t, i) => {
        if (!highlightNonStandard || t.kind !== "text") {
          return (
            <span key={i} style={tokenStyle(t, overlaps)}>
              {t.text}
            </span>
          );
        }
        const parts = splitLearnTokens(t.text, notam.icao);
        return (
          <Fragment key={i}>
            {parts.map((part, j) => (
              <span
                key={j}
                style={
                  part.nonStandard
                    ? { ...tokenStyle(t, overlaps), color: "#ef4444", fontWeight: 700 }
                    : tokenStyle(t, overlaps)
                }
                title={part.nonStandard ? "Non-standard term" : undefined}
              >
                {part.text}
              </span>
            ))}
          </Fragment>
        );
      })}
    </pre>
  );
}
