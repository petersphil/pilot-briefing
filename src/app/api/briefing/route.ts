import { NextRequest, NextResponse } from "next/server";
import { buildBriefing } from "@/lib/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const departure = String(body.departure || "").trim();
    const destination = String(body.destination || "").trim();
    const alternates = Array.isArray(body.alternates)
      ? body.alternates.map((a: unknown) => String(a).trim()).filter(Boolean)
      : String(body.alternates || "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    const departureUtc = String(body.departureUtc || "").trim();
    const enrouteMinutes = Number(body.enrouteMinutes ?? body.enrouteDurationMinutes ?? 0);

    if (!departure || !destination) {
      return NextResponse.json(
        { error: "departure and destination are required" },
        { status: 400 }
      );
    }
    if (!departureUtc) {
      return NextResponse.json({ error: "departureUtc is required (ISO UTC)" }, { status: 400 });
    }

    const result = await buildBriefing({
      departure,
      destination,
      alternates,
      departureUtc,
      enrouteMinutes: Number.isFinite(enrouteMinutes) ? enrouteMinutes : 0,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Briefing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST JSON { departure, destination, alternates[], departureUtc, enrouteMinutes }",
  });
}
