"use client";

import { useState } from "react";

/* ---------- types ---------- */

interface Session {
  accessToken: string;
  tenantId: string;
  dataRegionUrl: string;
}

interface Alert {
  id: string;
  severity: string;
  raisedAt: string;
  description: string;
  type: string;
  category: string;
  product: string;
  managedAgent?: { name?: string; type?: string };
  [key: string]: unknown;
}

type Destination = "teams" | "slack" | "generic";
type Step = "credentials" | "configure" | "alerts" | "done";

/* ---------- helpers ---------- */

function sessionHeaders(s: Session) {
  return {
    "x-sophos-token": s.accessToken,
    "x-sophos-tenant": s.tenantId,
    "x-sophos-region": s.dataRegionUrl,
    "Content-Type": "application/json",
  };
}

function severityColor(s: string) {
  switch (s?.toLowerCase()) {
    case "high":
      return "bg-red-100 text-red-700";
    case "medium":
      return "bg-orange-100 text-orange-700";
    case "low":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function Home() {
  const [step, setStep] = useState<Step>("credentials");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* auth */
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  /* destination config */
  const [destination, setDestination] = useState<Destination>("teams");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testOk, setTestOk] = useState<boolean | null>(null);

  /* alerts */
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [forwarding, setForwarding] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [forwardAllStatus, setForwardAllStatus] = useState<"idle" | "sending" | "done">("idle");

  /* ---- actions ---- */

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      setSession({
        accessToken: data.accessToken,
        tenantId: data.tenantId,
        dataRegionUrl: data.dataRegionUrl,
      });
      setStep("configure");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleTest() {
    setError("");
    setLoading(true);
    setTestOk(null);
    try {
      const res = await fetch("/api/forward/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      setTestOk(true);
    } catch (err: unknown) {
      setTestOk(false);
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadAlerts() {
    if (!session) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?limit=50", {
        headers: sessionHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch alerts");
      setAlerts(data.items ?? []);
      setForwarding({});
      setForwardAllStatus("idle");
      setStep("alerts");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch alerts");
    } finally {
      setLoading(false);
    }
  }

  async function forwardOne(alert: Alert) {
    setForwarding((p) => ({ ...p, [alert.id]: "sending" }));
    try {
      const res = await fetch("/api/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert, webhookUrl, destination }),
      });
      if (!res.ok) throw new Error();
      setForwarding((p) => ({ ...p, [alert.id]: "sent" }));
    } catch {
      setForwarding((p) => ({ ...p, [alert.id]: "error" }));
    }
  }

  async function forwardAll() {
    setForwardAllStatus("sending");
    for (const alert of alerts) {
      if (forwarding[alert.id] === "sent") continue;
      await forwardOne(alert);
    }
    setForwardAllStatus("done");
  }

  function resetAll() {
    setSession(null);
    setStep("credentials");
    setError("");
    setClientId("");
    setClientSecret("");
    setWebhookUrl("");
    setTestOk(null);
    setAlerts([]);
    setForwarding({});
    setForwardAllStatus("idle");
  }

  /* ---- step indicator ---- */

  const steps = [
    { label: "Authenticate" },
    { label: "Configure" },
    { label: "Alerts" },
  ];

  function activeIdx() {
    if (step === "credentials") return 0;
    if (step === "configure") return 1;
    return 2;
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div className="min-h-screen flex flex-col">
      {/* header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sophos-500 text-white font-bold text-lg">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Alert Forwarder
              </h1>
              <p className="text-xs text-gray-500">Sophos Central → Teams / Slack / Webhook</p>
            </div>
          </div>
          {session && (
            <button onClick={resetAll} className="btn-secondary text-xs">
              Sign Out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {/* step indicator */}
        {step !== "done" && (
          <nav className="mb-10 flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                    i <= activeIdx()
                      ? "bg-sophos-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:inline ${
                    i <= activeIdx() ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-px w-8 transition ${
                      i < activeIdx() ? "bg-sophos-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </nav>
        )}

        {/* error banner */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* -------- STEP 1: CREDENTIALS -------- */}
        {step === "credentials" && (
          <div className="card">
            <h2 className="mb-1 text-xl font-bold">Connect to Sophos Central</h2>
            <p className="mb-6 text-sm text-gray-500">
              Enter your tenant-level API credentials. Generate these under{" "}
              <span className="font-medium text-gray-700">
                Global Settings &gt; API Credentials
              </span>{" "}
              in the Sophos Central admin console.
            </p>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="label">Client ID</label>
                <input
                  className="input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div>
                <label className="label">Client Secret</label>
                <input
                  type="password"
                  className="input"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Your client secret"
                  required
                />
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                Your credentials are only used for this session and are never stored on our servers.
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <><Spinner /> Authenticating...</> : "Connect"}
              </button>
            </form>
          </div>
        )}

        {/* -------- STEP 2: CONFIGURE DESTINATION -------- */}
        {step === "configure" && session && (
          <div className="card">
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
              <span className="text-gray-600">
                Connected &mdash; tenant{" "}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
                  {session.tenantId}
                </code>
              </span>
            </div>

            <h2 className="mb-1 text-xl font-bold">Configure Destination</h2>
            <p className="mb-6 text-sm text-gray-500">
              Choose where Sophos alerts should be forwarded and paste the incoming webhook URL.
            </p>

            <div className="space-y-5">
              {/* destination picker */}
              <div>
                <label className="label">Destination</label>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ["teams", "Microsoft Teams"],
                      ["slack", "Slack"],
                      ["generic", "Generic Webhook"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setDestination(val); setTestOk(null); }}
                      className={`rounded-lg border-2 px-3 py-3 text-sm font-medium transition ${
                        destination === val
                          ? "border-sophos-500 bg-sophos-50 text-sophos-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* webhook URL */}
              <div>
                <label className="label">
                  Incoming Webhook URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  className="input"
                  value={webhookUrl}
                  onChange={(e) => { setWebhookUrl(e.target.value); setTestOk(null); }}
                  placeholder={
                    destination === "teams"
                      ? "https://yourtenant.webhook.office.com/webhookb2/..."
                      : destination === "slack"
                        ? "https://hooks.slack.com/services/T00/B00/xxx"
                        : "https://your-endpoint.example.com/callback"
                  }
                  required
                />
                {destination === "teams" && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    In Teams: channel &gt; &bull;&bull;&bull; &gt; Manage channel &gt; Connectors &gt; Incoming Webhook &gt; Configure &gt; copy the URL.
                  </p>
                )}
              </div>

              {/* test result */}
              {testOk === true && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Test alert sent successfully! Check your {destination === "teams" ? "Teams channel" : destination === "slack" ? "Slack channel" : "endpoint"}.
                </div>
              )}

              {/* actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!webhookUrl || loading}
                  className="btn-secondary"
                >
                  {loading ? <><Spinner /> Testing...</> : "Send Test Alert"}
                </button>
                <button
                  type="button"
                  onClick={loadAlerts}
                  disabled={!webhookUrl || loading}
                  className="btn-primary flex-1"
                >
                  {loading && !testOk ? <><Spinner /> Loading...</> : "Fetch Alerts & Forward"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------- STEP 3: ALERTS LIST -------- */}
        {step === "alerts" && session && (
          <div className="card">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Sophos Alerts</h2>
                <p className="text-sm text-gray-500">
                  {alerts.length} alert{alerts.length !== 1 && "s"} found &mdash;
                  forwarding to{" "}
                  <span className="font-medium text-gray-700">
                    {destination === "teams" ? "Teams" : destination === "slack" ? "Slack" : "Webhook"}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep("configure")} className="btn-secondary text-sm">
                  Back
                </button>
                <button onClick={loadAlerts} disabled={loading} className="btn-secondary text-sm">
                  {loading ? <Spinner /> : "Refresh"}
                </button>
                {alerts.length > 0 && (
                  <button
                    onClick={forwardAll}
                    disabled={forwardAllStatus === "sending"}
                    className="btn-primary text-sm"
                  >
                    {forwardAllStatus === "sending" ? (
                      <><Spinner /> Sending...</>
                    ) : forwardAllStatus === "done" ? (
                      "All Sent"
                    ) : (
                      "Forward All"
                    )}
                  </button>
                )}
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="py-12 text-center">
                <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-3 text-sm text-gray-500">No alerts at this time.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${severityColor(a.severity)}`}
                        >
                          {a.severity}
                        </span>
                        <span className="text-xs text-gray-400">
                          {a.raisedAt ? new Date(a.raisedAt).toLocaleString() : "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-900 line-clamp-2">
                        {a.description || "No description"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {a.managedAgent?.name || "Unknown device"} &middot; {a.type}
                      </p>
                    </div>
                    <button
                      onClick={() => forwardOne(a)}
                      disabled={forwarding[a.id] === "sending" || forwarding[a.id] === "sent"}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        forwarding[a.id] === "sent"
                          ? "bg-green-100 text-green-700"
                          : forwarding[a.id] === "error"
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-gray-100 text-gray-700 hover:bg-sophos-50 hover:text-sophos-700"
                      }`}
                    >
                      {forwarding[a.id] === "sending" ? (
                        <Spinner />
                      ) : forwarding[a.id] === "sent" ? (
                        "Sent"
                      ) : forwarding[a.id] === "error" ? (
                        "Retry"
                      ) : (
                        "Forward"
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {/* footer */}
      <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
        Sophos Alert Forwarder &mdash; Powered by the Sophos Central API
      </footer>
    </div>
  );
}

/* ---------- tiny spinner ---------- */

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
