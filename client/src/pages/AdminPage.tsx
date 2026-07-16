import { useEffect, useState, useCallback } from "react";
import { Seo } from "@/lib/seo";
import { ShieldCheck, ShieldAlert, ShieldQuestion, RefreshCw, LogOut, Loader2 } from "lucide-react";

const KEY_STORAGE = "rxfit_admin_key";

type ServiceStatus = {
  healthy: boolean | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type HealthResponse = {
  services: Record<"stripe" | "gmail" | "sheets", ServiceStatus>;
  checkedAt: string;
};

type Lead = {
  id: string;
  email: string;
  name?: string | null;
  plan?: string | null;
  createdAt?: string | null;
};

const SERVICE_LABELS: Record<string, string> = {
  stripe: "Stripe (checkout & billing)",
  gmail: "Gmail (customer emails)",
  sheets: "Google Sheets (lead sync & alerts)",
};

async function adminFetch<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), "x-admin-key": key },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status.healthy === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm" data-testid="status-unknown">
        <ShieldQuestion className="w-4 h-4" /> Not checked yet
      </span>
    );
  }
  if (status.healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-500 text-sm" data-testid="status-healthy">
        <ShieldCheck className="w-4 h-4" /> Healthy
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-red-500 text-sm" data-testid="status-broken">
      <ShieldAlert className="w-4 h-4" /> Broken
    </span>
  );
}

export default function AdminPage() {
  // Read sessionStorage in an effect (not the initializer) so the page is
  // SSR/prerender-safe and hydration matches the server-rendered locked state.
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE);
    if (stored) setKey(stored);
  }, []);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const logout = useCallback(() => {
    sessionStorage.removeItem(KEY_STORAGE);
    setKey(null);
    setHealth(null);
    setLeads(null);
    setAuthError(null);
  }, []);

  const load = useCallback(
    async (k: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const [h, l] = await Promise.all([
          adminFetch<HealthResponse>("/api/internal/credential-health", k),
          adminFetch<Lead[]>("/api/leads", k),
        ]);
        setHealth(h);
        setLeads(l);
      } catch (e) {
        if (e instanceof Error && e.message === "unauthorized") {
          logout();
          setAuthError("That key was rejected. Check it and try again.");
        } else {
          setLoadError("Couldn't load data. Try again.");
        }
      } finally {
        setLoading(false);
      }
    },
    [logout],
  );

  useEffect(() => {
    if (key) void load(key);
  }, [key, load]);

  const runCheckNow = async () => {
    if (!key) return;
    setRunning(true);
    setLoadError(null);
    try {
      const h = await adminFetch<HealthResponse>("/api/internal/credential-health/run", key, {
        method: "POST",
      });
      setHealth(h);
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorized") logout();
      else setLoadError("Health check run failed. Try again.");
    } finally {
      setRunning(false);
    }
  };

  const submitKey = (e: React.FormEvent) => {
    e.preventDefault();
    const k = keyInput.trim();
    if (!k) return;
    sessionStorage.setItem(KEY_STORAGE, k);
    setKeyInput("");
    setAuthError(null);
    setKey(k);
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-16">
      <Seo
        title="Admin | RxFit.ai"
        description="Internal operations dashboard."
        canonicalPath="/admin"
        noindex
      />
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary mb-1">Internal // Ops</p>
            <h1 className="font-display text-2xl font-semibold">Admin dashboard</h1>
          </div>
          {key && (
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" /> Forget key
            </button>
          )}
        </div>

        {!key ? (
          <form onSubmit={submitKey} className="glass rounded-lg border border-border p-6 max-w-md">
            <label htmlFor="admin-key" className="block text-sm font-medium mb-2">
              Admin key
            </label>
            <input
              id="admin-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mb-3"
              placeholder="Paste the admin key"
              data-testid="input-admin-key"
            />
            {authError && <p className="text-sm text-red-500 mb-3" data-testid="text-auth-error">{authError}</p>}
            <button
              type="submit"
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
              data-testid="button-unlock"
            >
              Unlock
            </button>
            <p className="text-xs text-muted-foreground mt-3">
              Kept only in this browser tab's session. Every request is verified server-side.
            </p>
          </form>
        ) : (
          <div className="space-y-10">
            {loadError && <p className="text-sm text-red-500" data-testid="text-load-error">{loadError}</p>}

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold">Credential health</h2>
                <button
                  onClick={runCheckNow}
                  disabled={running}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  data-testid="button-run-check"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {running ? "Running…" : "Run check now"}
                </button>
              </div>
              <div className="space-y-3">
                {health ? (
                  (Object.keys(SERVICE_LABELS) as Array<keyof HealthResponse["services"]>).map((name) => {
                    const s = health.services[name];
                    return (
                      <div
                        key={name}
                        className="glass rounded-lg border border-border p-4 flex flex-wrap items-center justify-between gap-2"
                        data-testid={`card-service-${name}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{SERVICE_LABELS[name]}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.lastCheckedAt
                              ? `Last checked ${new Date(s.lastCheckedAt).toLocaleString()}`
                              : "Awaiting first check (runs 45s after boot, then hourly)"}
                          </p>
                          {s.lastError && (
                            <p className="text-xs text-red-500 mt-1" data-testid={`text-error-${name}`}>{s.lastError}</p>
                          )}
                        </div>
                        <StatusBadge status={s} />
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold mb-4">
                Recent leads{leads ? ` (${leads.length})` : ""}
              </h2>
              {leads && leads.length > 0 ? (
                <div className="glass rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">Name</th>
                        <th className="px-4 py-2.5">Plan</th>
                        <th className="px-4 py-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...leads]
                        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                        .slice(0, 50)
                        .map((lead, i) => (
                          <tr key={lead.id ?? i} className="border-b border-border/50 last:border-0" data-testid={`row-lead-${lead.id ?? i}`}>
                            <td className="px-4 py-2.5">{lead.email}</td>
                            <td className="px-4 py-2.5">{lead.name || "—"}</td>
                            <td className="px-4 py-2.5">{lead.plan || "—"}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {loading ? "Loading…" : leads ? "No leads yet." : "No data."}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
