import { NextRequest, NextResponse } from "next/server";
import { createWebhook, listWebhooks, type SophosSession } from "@/lib/sophos";

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
    const webhooks = await listWebhooks(session);
    return NextResponse.json({ items: webhooks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list webhooks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = extractSession(req);
    const payload = await req.json();
    const result = await createWebhook(session, payload);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
