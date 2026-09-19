import { NextResponse } from "next/server";
import { getAirportDbMeta } from "@/lib/airports";

export const runtime = "nodejs";

export async function GET() {
  const skylinkConfigured = !!(
    process.env.RAPIDAPI_KEY?.trim() || process.env.SKYLINK_RAPIDAPI_KEY?.trim()
  );
  return NextResponse.json({
    ok: true,
    service: "pilot-briefing",
    airports: getAirportDbMeta(),
    notamSources: {
      canada: "navcanada-cfps",
      other: skylinkConfigured ? "skylink-rapidapi" : "unconfigured",
    },
    skylinkConfigured,
    /** @deprecated Prefer skylinkConfigured — FAA OAuth is no longer primary. */
    notamConfigured: skylinkConfigured,
  });
}
