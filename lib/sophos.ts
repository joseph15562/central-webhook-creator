const AUTH_URL = "https://id.sophos.com/api/v2/oauth2/token";
const WHOAMI_URL = "https://api.central.sophos.com/whoami/v1";

export interface SophosSession {
  accessToken: string;
  tenantId: string;
  dataRegionUrl: string;
  idType: string;
}

export interface SophosAlert {
  id: string;
  severity: string;
  raisedAt: string;
  description: string;
  type: string;
  category: string;
  product: string;
  managedAgent?: { name?: string; type?: string };
  tenant?: { id?: string; name?: string };
  [key: string]: unknown;
}

export async function authenticate(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "token",
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authentication failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function resolveTenant(
  accessToken: string
): Promise<SophosSession> {
  const res = await fetch(WHOAMI_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whoami failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const idType = (data.idType || "tenant").toLowerCase();

  if (idType === "partner" || idType === "organization") {
    throw new Error(
      `Your credentials belong to a ${idType} account. ` +
        "Please provide tenant-level API credentials instead."
    );
  }

  return {
    accessToken,
    tenantId: data.id,
    dataRegionUrl: data.apiHosts?.dataRegion,
    idType,
  };
}

export async function fullAuth(
  clientId: string,
  clientSecret: string
): Promise<SophosSession> {
  const token = await authenticate(clientId, clientSecret);
  return resolveTenant(token);
}

function apiHeaders(session: SophosSession) {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Tenant-ID": session.tenantId,
    "Content-Type": "application/json",
  };
}

export async function fetchAlerts(
  session: SophosSession,
  limit = 25
): Promise<SophosAlert[]> {
  const url = `${session.dataRegionUrl.replace(/\/$/, "")}/common/v1/alerts?pageSize=${limit}&sort=raisedAt:desc`;

  const res = await fetch(url, { headers: apiHeaders(session) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch alerts failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.items ?? [];
}

function severityEmoji(severity: string): string {
  switch (severity?.toLowerCase()) {
    case "high":
      return "🔴";
    case "medium":
      return "🟠";
    case "low":
      return "🟡";
    default:
      return "⚪";
  }
}

function formatTeamsCard(alert: SophosAlert) {
  const emoji = severityEmoji(alert.severity);
  const device = alert.managedAgent?.name || "Unknown device";
  const time = alert.raisedAt
    ? new Date(alert.raisedAt).toLocaleString("en-GB", { timeZone: "UTC" })
    : "Unknown";

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `${emoji} Sophos Alert — ${alert.severity?.toUpperCase()}`,
              weight: "Bolder",
              size: "Medium",
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Type", value: alert.type || "—" },
                { title: "Category", value: alert.category || "—" },
                { title: "Device", value: device },
                { title: "Product", value: alert.product || "—" },
                { title: "Time (UTC)", value: time },
              ],
            },
            {
              type: "TextBlock",
              text: alert.description || "No description provided.",
              wrap: true,
              spacing: "Medium",
            },
          ],
        },
      },
    ],
  };
}

function formatSlackPayload(alert: SophosAlert) {
  const emoji = severityEmoji(alert.severity);
  const device = alert.managedAgent?.name || "Unknown device";

  return {
    text: `${emoji} *Sophos Alert — ${alert.severity?.toUpperCase()}*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} Sophos Alert — ${alert.severity?.toUpperCase()}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Type:* ${alert.type || "—"}` },
          { type: "mrkdwn", text: `*Category:* ${alert.category || "—"}` },
          { type: "mrkdwn", text: `*Device:* ${device}` },
          { type: "mrkdwn", text: `*Product:* ${alert.product || "—"}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: alert.description || "No description provided.",
        },
      },
    ],
  };
}

function formatWhatsAppPayload(alert: SophosAlert, recipientPhone: string) {
  const emoji = severityEmoji(alert.severity);
  const device = alert.managedAgent?.name || "Unknown device";
  const time = alert.raisedAt
    ? new Date(alert.raisedAt).toLocaleString("en-GB", { timeZone: "UTC" })
    : "Unknown";

  const body = [
    `${emoji} *Sophos Alert — ${alert.severity?.toUpperCase()}*`,
    "",
    `*Type:* ${alert.type || "—"}`,
    `*Category:* ${alert.category || "—"}`,
    `*Device:* ${device}`,
    `*Product:* ${alert.product || "—"}`,
    `*Time (UTC):* ${time}`,
    "",
    alert.description || "No description provided.",
  ].join("\n");

  return {
    messaging_product: "whatsapp",
    to: recipientPhone,
    type: "text",
    text: { preview_url: false, body },
  };
}

function formatGenericPayload(alert: SophosAlert) {
  return {
    severity: alert.severity,
    type: alert.type,
    category: alert.category,
    description: alert.description,
    device: alert.managedAgent?.name || "Unknown",
    product: alert.product,
    raisedAt: alert.raisedAt,
    alertId: alert.id,
  };
}

export function formatPayload(
  alert: SophosAlert,
  destination: "teams" | "slack" | "whatsapp" | "generic",
  recipientPhone?: string
) {
  switch (destination) {
    case "teams":
      return formatTeamsCard(alert);
    case "slack":
      return formatSlackPayload(alert);
    case "whatsapp":
      return formatWhatsAppPayload(alert, recipientPhone || "");
    default:
      return formatGenericPayload(alert);
  }
}

export async function forwardAlert(
  alert: SophosAlert,
  webhookUrl: string,
  destination: "teams" | "slack" | "whatsapp" | "generic",
  whatsappToken?: string,
  recipientPhone?: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const payload = formatPayload(alert, destination, recipientPhone);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (destination === "whatsapp" && whatsappToken) {
    headers["Authorization"] = `Bearer ${whatsappToken}`;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
