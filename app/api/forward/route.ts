import { NextRequest, NextResponse } from "next/server";
import { forwardAlert, type SophosAlert } from "@/lib/sophos";

export async function POST(req: NextRequest) {
  try {
    const { alert, webhookUrl, destination } = (await req.json()) as {
      alert: SophosAlert;
      webhookUrl: string;
      destination: "teams" | "slack" | "generic";
    };

    if (!alert || !webhookUrl || !destination) {
      return NextResponse.json(
        { error: "alert, webhookUrl, and destination are required" },
        { status: 400 }
      );
    }

    const result = await forwardAlert(alert, webhookUrl, destination);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Destination returned ${result.status}`,
          detail: result.body,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to forward alert";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
