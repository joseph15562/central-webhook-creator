"use client";

import { useState } from "react";

/* ---------- types ---------- */

interface Session {
  accessToken: string;
  tenantId: string;
  dataRegionUrl: string;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  [key: string]: unknown;
}

type Step = "credentials" | "action" | "create" | "list" | "success";

/* ---------- helpers ---------- */

function sessionHeaders(s: Session) {
  return {
    "x-sophos-token": s.accessToken,
    "x-sophos-tenant": s.tenantId,
    "x-sophos-region": s.dataRegionUrl,
    "Content-Type": "application/json",
  };
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

  /* create form */
  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");
  const [whDesc, setWhDesc] = useState("");
  const [whEvents, setWhEvents] = useState("");
  const [whSecret, setWhSecret] = useState("");
  const [whEnabled, setWhEnabled] = useState(true);
  const [createdWebhook, setCreatedWebhook] = useState<Record<string, unknown> | null>(null);

  /* list */
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);

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
      setStep("action");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError("");
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: whName,
        url: whUrl,
        enabled: whEnabled,
      };
      if (whDesc) payload.description = whDesc;
      if (whEvents) payload.events = whEvents.split(",").map((s) => s.trim());
      if (whSecret) payload.secret = whSecret;

      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: sessionHeaders(session),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create webhook");
      setCreatedWebhook(data);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setLoading(false);
    }
  }

  async function loadWebhooks() {
    if (!session) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks", {
        headers: sessionHeaders(session),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list webhooks");
      setWebhooks(data.items ?? []);
      setStep("list");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to list webhooks");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!session || !confirm("Delete this webhook?")) return;
    setError("");
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "DELETE",
        headers: sessionHeaders(session),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function resetAll() {
    setSession(null);
    setStep("credentials");
    setError("");
    setClientId("");
    setClientSecret("");
    resetCreateForm();
    setWebhooks([]);
  }

  function resetCreateForm() {
    setWhName("");
    setWhUrl("");
    setWhDesc("");
    setWhEvents("");
    setWhSecret("");
    setWhEnabled(true);
    setCreatedWebhook(null);
  }

  /* ---- step indicator ---- */

  const steps: { key: Step | "action"; label: string }[] = [
    { key: "credentials", label: "Authenticate" },
    { key: "action", label: "Choose Action" },
    { key: "create", label: "Configure" },
  ];

  function activeIdx() {
    if (step === "credentials") return 0;
    if (step === "action") return 1;
    return 2;
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sophos-500 text-white font-bold text-lg">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Webhook Central
              </h1>
              <p className="text-xs text-gray-500">Sophos Central API</p>
            </div>
          </div>
          {session && (
            <button onClick={resetAll} className="btn-secondary text-xs">
              Sign Out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* step indicator */}
        {step !== "success" && (
          <nav className="mb-10 flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
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

        {/* -------- STEP: CREDENTIALS -------- */}
        {step === "credentials" && (
          <div className="card">
            <h2 className="mb-1 text-xl font-bold">Connect to Sophos Central</h2>
            <p className="mb-6 text-sm text-gray-500">
              Enter your tenant-level API credentials. You can generate these under{" "}
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
                {loading ? (
                  <>
                    <Spinner /> Authenticating...
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            </form>
          </div>
        )}

        {/* -------- STEP: ACTION PICKER -------- */}
        {step === "action" && session && (
          <div className="space-y-4">
            <div className="card">
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                <span className="text-gray-600">
                  Connected to tenant{" "}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
                    {session.tenantId}
                  </code>
                </span>
              </div>
              <h2 className="mb-1 text-xl font-bold">What would you like to do?</h2>
              <p className="mb-6 text-sm text-gray-500">
                Create a new webhook or manage existing ones.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setError("");
                    resetCreateForm();
                    setStep("create");
                  }}
                  className="group card flex flex-col items-center gap-3 p-6 text-center transition hover:border-sophos-500 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sophos-50 text-sophos-500 transition group-hover:bg-sophos-500 group-hover:text-white">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Create Webhook</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Set up a new webhook endpoint
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setError("");
                    loadWebhooks();
                  }}
                  className="group card flex flex-col items-center gap-3 p-6 text-center transition hover:border-sophos-500 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sophos-50 text-sophos-500 transition group-hover:bg-sophos-500 group-hover:text-white">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">View Webhooks</p>
                    <p className="mt-1 text-xs text-gray-500">
                      List and manage existing webhooks
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------- STEP: CREATE FORM -------- */}
        {step === "create" && session && (
          <div className="card">
            <h2 className="mb-1 text-xl font-bold">Create Webhook</h2>
            <p className="mb-6 text-sm text-gray-500">
              Configure the webhook that Sophos Central will POST events to.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder="e.g. My SIEM Webhook"
                  required
                />
              </div>

              <div>
                <label className="label">
                  Callback URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  className="input"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder="https://my-siem.example.com/sophos-events"
                  required
                />
              </div>

              <div>
                <label className="label">Description</label>
                <input
                  className="input"
                  value={whDesc}
                  onChange={(e) => setWhDesc(e.target.value)}
                  placeholder="Forward Sophos alerts to our SIEM"
                />
              </div>

              <div>
                <label className="label">Events (comma-separated)</label>
                <input
                  className="input"
                  value={whEvents}
                  onChange={(e) => setWhEvents(e.target.value)}
                  placeholder="e.g. alert, event"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Leave blank to subscribe to all events.
                </p>
              </div>

              <div>
                <label className="label">Shared Secret (HMAC)</label>
                <input
                  type="password"
                  className="input"
                  value={whSecret}
                  onChange={(e) => setWhSecret(e.target.value)}
                  placeholder="Optional — used to verify payload signatures"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={whEnabled}
                  onClick={() => setWhEnabled(!whEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition ${
                    whEnabled ? "bg-sophos-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition ${
                      whEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  {whEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("action")}
                  className="btn-secondary"
                >
                  Back
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? (
                    <>
                      <Spinner /> Creating...
                    </>
                  ) : (
                    "Create Webhook"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* -------- STEP: LIST -------- */}
        {step === "list" && session && (
          <div className="card">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Your Webhooks</h2>
                <p className="text-sm text-gray-500">
                  {webhooks.length} webhook{webhooks.length !== 1 && "s"} configured
                </p>
              </div>
              <button onClick={() => setStep("action")} className="btn-secondary text-sm">
                Back
              </button>
            </div>

            {webhooks.length === 0 ? (
              <div className="py-12 text-center">
                <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
                <p className="mt-3 text-sm text-gray-500">No webhooks found.</p>
                <button
                  onClick={() => {
                    resetCreateForm();
                    setStep("create");
                  }}
                  className="btn-primary mt-4"
                >
                  Create One
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {webhooks.map((wh) => (
                  <li key={wh.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {wh.name}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            wh.enabled
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {wh.enabled ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500 font-mono">
                        {wh.url}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(wh.id)}
                      className="ml-4 shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Delete webhook"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* -------- STEP: SUCCESS -------- */}
        {step === "success" && createdWebhook && (
          <div className="card text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mb-1 text-xl font-bold text-gray-900">
              Webhook Created!
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              Your webhook has been created and is ready to receive events.
            </p>

            <div className="mb-6 rounded-lg bg-gray-50 p-4 text-left">
              <pre className="overflow-x-auto text-xs text-gray-700">
                {JSON.stringify(createdWebhook, null, 2)}
              </pre>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  resetCreateForm();
                  setStep("action");
                }}
                className="btn-secondary"
              >
                Back to Menu
              </button>
              <button
                onClick={() => {
                  resetCreateForm();
                  setStep("create");
                }}
                className="btn-primary"
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </main>

      {/* footer */}
      <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
        Sophos Webhook Central &mdash; Powered by the Sophos Central API
      </footer>
    </div>
  );
}

/* ---------- tiny spinner ---------- */

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
