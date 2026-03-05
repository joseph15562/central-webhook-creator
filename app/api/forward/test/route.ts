import { NextRequest, NextResponse } from "next/server";
import { forwardAlert, type SophosAlert } from "@/lib/sophos";

const SAMPLE_ALERT: SophosAlert = {
  id: "test-alert-001",
  severity: "high",
  raisedAt: new Date().toISOString(),
  description:
    "This is a test alert from Sophos Webhook Central to verify your integration is working correctly.",
  type: "Event::Endpoint::TestAlert",
  category: "general",
  product: "endpoint",
  managedAgent: { name: "TEST-DEVICE", type: "computer" },
};

export async function POST(req: NextRequest) {
  try {
    const { webhookUrl, destination, whatsappToken, recipientPhone } =
      (await req.json()) as {
        webhookUrl: string;
        destination: "teams" | "slack" | "whatsapp" | "generic";
        whatsappToken?: string;
        recipientPhone?: string;
      };

    if (!webhookUrl || !destination) {
      return NextResponse.json(
        { error: "webhookUrl and destination are required" },
        { status: 400 }
      );
    }

    const result = await forwardAlert(
      SAMPLE_ALERT,
      webhookUrl,
      destination,
      whatsappToken,
      recipientPhone
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: `Destination returned ${result.status}`, detail: result.body },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Test forward failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
