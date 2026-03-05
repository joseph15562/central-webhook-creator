import { NextRequest, NextResponse } from "next/server";
import { fullAuth } from "@/lib/sophos";

export async function POST(req: NextRequest) {
  try {
    const { clientId, clientSecret } = await req.json();

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "clientId and clientSecret are required" },
        { status: 400 }
      );
    }

    const session = await fullAuth(clientId, clientSecret);

    return NextResponse.json({
      accessToken: session.accessToken,
      tenantId: session.tenantId,
      dataRegionUrl: session.dataRegionUrl,
      idType: session.idType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
