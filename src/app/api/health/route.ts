import { NextResponse } from "next/server";
import { getAirportDbMeta } from "@/lib/airports";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "pilot-briefing",
    airports: getAirportDbMeta(),
    notamConfigured: !!(
      process.env.FAA_NOTAM_CLIENT_ID && process.env.FAA_NOTAM_CLIENT_SECRET
    ),
  });
}
