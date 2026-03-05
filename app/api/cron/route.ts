import { NextRequest, NextResponse } from "next/server";
import {
  getAllConfigIds,
  getConfig,
  updateLastPoll,
  isRedisConfigured,
} from "@/lib/store";
import { fullAuth, fetchAlerts, forwardAlert } from "@/lib/sophos";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const ids = await getAllConfigIds();
  const results: Record<string, { forwarded: number; errors: number }> = {};

  for (const id of ids) {
    const config = await getConfig(id);
    if (!config || !config.enabled) continue;

    try {
      const session = await fullAuth(config.clientId, config.clientSecret);
      const alerts = await fetchAlerts(session, 25);

      let forwarded = 0;
      let errors = 0;

      for (const alert of alerts) {
        if (config.lastAlertId && alert.id === config.lastAlertId) break;

        try {
          const result = await forwardAlert(alert, config.webhookUrl, config.destination);
          if (result.ok) forwarded++;
          else errors++;
        } catch {
          errors++;
        }
      }

      const newestId = alerts.length > 0 ? alerts[0].id : config.lastAlertId;
      await updateLastPoll(id, new Date().toISOString(), newestId);

      results[id] = { forwarded, errors };
    } catch {
      results[id] = { forwarded: 0, errors: -1 };
    }
  }

  return NextResponse.json({
    processed: ids.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
