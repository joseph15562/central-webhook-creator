import { NextRequest, NextResponse } from "next/server";
import { deleteWebhook, type SophosSession } from "@/lib/sophos";

function extractSession(req: NextRequest): SophosSession {
  const accessToken = req.headers.get("x-sophos-token");
  const tenantId = req.headers.get("x-sophos-tenant");
  const dataRegionUrl = req.headers.get("x-sophos-region");

  if (!accessToken || !tenantId || !dataRegionUrl) {
    throw new Error("Missing session headers");
  }

  return { accessToken, tenantId, dataRegionUrl, idType: "tenant" };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = extractSession(req);
    await deleteWebhook(session, params.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete webhook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
