import { NextRequest, NextResponse } from "next/server";
import { fetchAlerts, type SophosSession } from "@/lib/sophos";

function extractSession(req: NextRequest): SophosSession {
  const accessToken = req.headers.get("x-sophos-token");
  const tenantId = req.headers.get("x-sophos-tenant");
  const dataRegionUrl = req.headers.get("x-sophos-region");

  if (!accessToken || !tenantId || !dataRegionUrl) {
    throw new Error(
      "Missing session headers (x-sophos-token, x-sophos-tenant, x-sophos-region)"
    );
  }

  return { accessToken, tenantId, dataRegionUrl, idType: "tenant" };
}

export async function GET(req: NextRequest) {
  try {
    const session = extractSession(req);
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25");
    const alerts = await fetchAlerts(session, limit);
    return NextResponse.json({ items: alerts, count: alerts.length });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch alerts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
