"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
type Step = "credentials" | "configure" | "monitoring";

const POLL_INTERVAL = 30_000; // 30 seconds

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

  /* monitoring state */
  const [monitoring, setMonitoring] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ forwarded: 0, errors: 0, lastPoll: "" });
  const [countdown, setCountdown] = useState(POLL_INTERVAL / 1000);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentIdsRef = useRef(sentIds);
  sentIdsRef.current = sentIds;

  /* ---- forward a single alert (no UI state dependency) ---- */

  const forwardOne = useCallback(
    async (alert: Alert): Promise<boolean> => {
      try {
        const res = await fetch("/api/forward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alert, webhookUrl, destination }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [webhookUrl, destination]
  );

  /* ---- poll + auto-forward ---- */

  const pollAndForward = useCallback(async () => {
    if (!session) return;

    try {
      const res = await fetch("/api/alerts?limit=50", {
        headers: sessionHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) return;

      const items: Alert[] = data.items ?? [];
      setAlerts(items);
      setStats((s) => ({ ...s, lastPoll: new Date().toLocaleTimeString() }));

      const newAlerts = items.filter((a) => !sentIdsRef.current.has(a.id));
      let forwarded = 0;
      let errors = 0;

      for (const alert of newAlerts) {
        const ok = await forwardOne(alert);
        if (ok) {
          forwarded++;
          setSentIds((prev) => new Set(prev).add(alert.id));
        } else {
          errors++;
        }
      }

      if (forwarded || errors) {
        setStats((s) => ({
          ...s,
          forwarded: s.forwarded + forwarded,
          errors: s.errors + errors,
        }));
      }
    } catch {
      /* network hiccup — will retry next poll */
    }
  }, [session, forwardOne]);

  /* ---- start / stop monitoring ---- */

  function startMonitoring() {
    setMonitoring(true);
    setStats({ forwarded: 0, errors: 0, lastPoll: "" });
    setSentIds(new Set());
    setAlerts([]);
    setCountdown(0);
    pollAndForward();

    intervalRef.current = setInterval(() => {
      setCountdown(0);
      pollAndForward();
    }, POLL_INTERVAL);

    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c >= POLL_INTERVAL / 1000 - 1 ? 0 : c + 1));
    }, 1000);
  }

  function stopMonitoring() {
    setMonitoring(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    intervalRef.current = null;
    countdownRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  /* ---- auth ---- */

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

  function resetAll() {
    stopMonitoring();
    setSession(null);
    setStep("credentials");
    setError("");
    setClientId("");
    setClientSecret("");
    setWebhookUrl("");
    setTestOk(null);
    setAlerts([]);
    setSentIds(new Set());
    setStats({ forwarded: 0, errors: 0, lastPoll: "" });
  }

  /* ---- step indicator ---- */

  const stepLabels = ["Authenticate", "Configure", "Monitor"];
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
              <h1 className="text-lg font-bold text-gray-900">Alert Forwarder</h1>
              <p className="text-xs text-gray-500">Sophos Central &rarr; Teams / Slack / Webhook</p>
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
        <nav className="mb-10 flex items-center justify-center gap-2">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                  i <= activeIdx() ? "bg-sophos-500 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  i <= activeIdx() ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {label}
              </span>
              {i < stepLabels.length - 1 && (
                <div className={`mx-2 h-px w-8 transition ${i < activeIdx() ? "bg-sophos-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </nav>

        {/* error banner */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
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
              <span className="font-medium text-gray-700">Global Settings &gt; API Credentials</span>{" "}
              in the Sophos Central admin console.
            </p>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="label">Client ID</label>
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
              </div>
              <div>
                <label className="label">Client Secret</label>
                <input type="password" className="input" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Your client secret" required />
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
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{session.tenantId}</code>
              </span>
            </div>

            <h2 className="mb-1 text-xl font-bold">Configure Destination</h2>
            <p className="mb-6 text-sm text-gray-500">
              Choose where alerts go and paste the incoming webhook URL. Once you start monitoring,
              new alerts are automatically forwarded every 30 seconds.
            </p>

            <div className="space-y-5">
              <div>
                <label className="label">Destination</label>
                <div className="grid grid-cols-3 gap-3">
                  {([["teams", "Microsoft Teams"], ["slack", "Slack"], ["generic", "Generic Webhook"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setDestination(val); setTestOk(null); }}
                      className={`rounded-lg border-2 px-3 py-3 text-sm font-medium transition ${
                        destination === val ? "border-sophos-500 bg-sophos-50 text-sophos-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Incoming Webhook URL <span className="text-red-500">*</span></label>
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

              {testOk === true && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Test alert sent! Check your {destination === "teams" ? "Teams channel" : destination === "slack" ? "Slack channel" : "endpoint"}.
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={handleTest} disabled={!webhookUrl || loading} className="btn-secondary">
                  {loading ? <><Spinner /> Testing...</> : "Send Test Alert"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("monitoring"); startMonitoring(); }}
                  disabled={!webhookUrl}
                  className="btn-primary flex-1"
                >
                  Start Monitoring
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------- STEP 3: LIVE MONITORING -------- */}
        {step === "monitoring" && session && (
          <div className="space-y-6">
            {/* status bar */}
            <div className="card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {monitoring ? (
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                    </span>
                  ) : (
                    <span className="inline-flex h-3 w-3 rounded-full bg-gray-300" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {monitoring ? "Monitoring Active" : "Monitoring Paused"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Polling every 30s &middot; forwarding to{" "}
                      <span className="font-medium">
                        {destination === "teams" ? "Teams" : destination === "slack" ? "Slack" : "Webhook"}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {monitoring ? (
                    <button onClick={stopMonitoring} className="btn-secondary text-sm">
                      Pause
                    </button>
                  ) : (
                    <button onClick={startMonitoring} className="btn-primary text-sm">
                      Resume
                    </button>
                  )}
                  <button onClick={() => { stopMonitoring(); setStep("configure"); }} className="btn-secondary text-sm">
                    Settings
                  </button>
                </div>
              </div>

              {/* stats row */}
              <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-sophos-500">{stats.forwarded}</p>
                  <p className="text-xs text-gray-500">Forwarded</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{stats.errors}</p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-700">
                    {monitoring ? `${Math.max(0, Math.floor(POLL_INTERVAL / 1000) - countdown)}s` : "—"}
                  </p>
                  <p className="text-xs text-gray-500">Next poll</p>
                </div>
              </div>
              {stats.lastPoll && (
                <p className="mt-2 text-center text-[11px] text-gray-400">Last polled at {stats.lastPoll}</p>
              )}
            </div>

            {/* recent alerts */}
            <div className="card">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Recent Alerts ({alerts.length})
              </h3>

              {alerts.length === 0 ? (
                <div className="py-10 text-center">
                  <svg className="mx-auto h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-500">No alerts yet. Waiting for next poll...</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${severityColor(a.severity)}`}>
                            {a.severity}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {a.raisedAt ? timeAgo(a.raisedAt) : "—"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-900 line-clamp-1">{a.description || "No description"}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {a.managedAgent?.name || "Unknown device"} &middot; {a.type}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          sentIds.has(a.id) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {sentIds.has(a.id) ? "Sent" : "Pending"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>

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
