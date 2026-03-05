const AUTH_URL = "https://id.sophos.com/api/v2/oauth2/token";
const WHOAMI_URL = "https://api.central.sophos.com/whoami";

export interface SophosSession {
  accessToken: string;
  tenantId: string;
  dataRegionUrl: string;
  idType: string;
}

export interface WebhookPayload {
  name: string;
  url: string;
  events?: string[];
  enabled?: boolean;
  description?: string;
  contentType?: string;
  secret?: string;
  customHeaders?: Record<string, string>;
  requestFormat?: string;
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

function webhooksUrl(session: SophosSession) {
  return `${session.dataRegionUrl.replace(/\/$/, "")}/common/v1/webhooks`;
}

export async function createWebhook(
  session: SophosSession,
  payload: WebhookPayload
) {
  const body: Record<string, unknown> = {
    name: payload.name,
    url: payload.url,
    enabled: payload.enabled ?? true,
    requestFormat: payload.requestFormat || "json",
    contentType: payload.contentType || "application/json",
  };
  if (payload.description) body.description = payload.description;
  if (payload.events?.length) body.events = payload.events;
  if (payload.secret) body.secret = payload.secret;
  if (payload.customHeaders && Object.keys(payload.customHeaders).length > 0) {
    body.customHeaders = payload.customHeaders;
  }

  const res = await fetch(webhooksUrl(session), {
    method: "POST",
    headers: apiHeaders(session),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create webhook failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function listWebhooks(session: SophosSession) {
  const res = await fetch(webhooksUrl(session), {
    headers: apiHeaders(session),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List webhooks failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.items ?? (Array.isArray(data) ? data : [data]);
}

export async function deleteWebhook(
  session: SophosSession,
  webhookId: string
) {
  const res = await fetch(`${webhooksUrl(session)}/${webhookId}`, {
    method: "DELETE",
    headers: apiHeaders(session),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete webhook failed (${res.status}): ${text}`);
  }
  return true;
}
