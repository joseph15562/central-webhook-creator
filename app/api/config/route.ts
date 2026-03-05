import { NextRequest, NextResponse } from "next/server";
import {
  saveConfig,
  getConfig,
  getAllConfigIds,
  deleteConfig,
  isRedisConfigured,
  type ForwarderConfig,
} from "@/lib/store";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ available: false, items: [] });
  }

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const config = await getConfig(id);
    if (!config) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }
    const safe = { ...config, clientSecret: "••••••••" };
    return NextResponse.json({ available: true, config: safe });
  }

  const ids = await getAllConfigIds();
  const items = [];
  for (const cid of ids) {
    const c = await getConfig(cid);
    if (c) {
      items.push({
        id: cid,
        destination: c.destination,
        webhookUrl: c.webhookUrl,
        enabled: c.enabled,
        lastPoll: c.lastPoll,
        createdAt: c.createdAt,
      });
    }
  }

  return NextResponse.json({ available: true, items });
}

export async function POST(req: NextRequest) {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: "Background forwarding requires Redis. Add an Upstash Redis integration in your Vercel project." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { clientId, clientSecret, webhookUrl, destination, whatsappToken, recipientPhone } = body;

    if (!clientId || !clientSecret || !webhookUrl || !destination) {
      return NextResponse.json(
        { error: "clientId, clientSecret, webhookUrl, and destination are required" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const config: ForwarderConfig = {
      clientId,
      clientSecret,
      webhookUrl,
      destination,
      enabled: true,
      createdAt: new Date().toISOString(),
      whatsappToken,
      recipientPhone,
    };

    await saveConfig(id, config);

    return NextResponse.json({ id, message: "Configuration saved. Background forwarding is active." }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteConfig(id);
  return NextResponse.json({ success: true });
}
