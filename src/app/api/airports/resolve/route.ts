import { NextRequest, NextResponse } from "next/server";
import { resolveCode } from "@/lib/airports";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") || "";
  const airport = resolveCode(code);
  if (!airport) {
    return NextResponse.json({ error: "not found", code }, { status: 404 });
  }
  return NextResponse.json({ input: code.toUpperCase(), airport });
}
