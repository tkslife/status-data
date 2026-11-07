import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import styles from "./status.module.css";
import StatusHistory from "./StatusHistory";
import {
  ComponentState,
  OverallStatus,
  StatusDocument,
  fetchStatusDocument,
  formatCheckedAgo,
  formatStatusTime,
  IncidentStage,
  RECENT_DAYS,
  StatusIncident,
  openIncidentFor,
  overallStatus,
  recentlyResolved,
  stageLabels,
  stateLabels,
  upcomingMaintenance,
} from "./status-document";

// Refresh the independently published status without contacting the application.
const REFRESH_MS = 30 * 1000;
const SPIN_MS = 800;
const MANUAL_COOLDOWN_MS = 10_000;

const stateStyles: Record<
  ComponentState,
  { icon: typeof CheckCircle2; className: string }
> = {
  operational: { icon: CheckCircle2, className: "text-green-700" },
  degraded: { icon: AlertTriangle, className: "text-amber-700" },
  outage: { icon: XCircle, className: "text-red-700" },
  maintenance: { icon: Wrench, className: "text-blue-700" },
  unknown: { icon: HelpCircle, className: "text-gray-600" },
};

const summaries: Record<
  OverallStatus,
  { title: string; body: string; state: ComponentState }
> = {
  none: {
    title: "All systems operational",
    body: "No service disruptions are currently reported for the TKS Life platform.",
    state: "operational",
  },
  issues: {
    title: "Service disruption",
    body: "Some TKS Life services are affected. Review the updates below for details.",
    state: "degraded",
  },
  maintenance: {
    title: "Maintenance in progress",
    body: "Maintenance may temporarily affect service availability. Review the details below.",
    state: "maintenance",
  },
  unknown: {
    title: "Service status unconfirmed",
    body: "Current status information is unavailable for some services.",
    state: "unknown",
  },
};

// Stage is always written out; colour only reinforces it.
const stageStyles: Record<IncidentStage, string> = {
  investigating: "bg-amber-50 text-amber-800 ring-amber-200",
  identified: "bg-orange-50 text-orange-800 ring-orange-200",
  restoring: "bg-blue-50 text-blue-800 ring-blue-200",
  monitoring: "bg-sky-50 text-sky-800 ring-sky-200",
  resolved: "bg-green-50 text-green-800 ring-green-200",
};

function StageBadge({ stage }: { stage: IncidentStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${stageStyles[stage]}`}
    >
      {stageLabels[stage]}
    </span>
  );
}

function IncidentCard({
  incident,
  componentName,
}: {
  incident: StatusIncident;
  componentName: (id: string) => string;
}) {
  return (
    <li
      id={`incident-${incident.id}`}
      tabIndex={-1}
      className="scroll-mt-6 rounded-lg border p-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-semibold text-foreground">{incident.title}</h3>
        <StageBadge stage={incident.stage} />
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Affects {incident.componentIds.map(componentName).join(", ")}
        {incident.resolvedAt &&
          ` · Resolved ${formatStatusTime(incident.resolvedAt)}`}
      </p>
      <ol className="mt-5 space-y-5 border-l border-gray-200 pl-5">
        {incident.updates.map((update, index) => (
          <li key={update.publishedAt} className="relative">
            <span
              aria-hidden="true"
              className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${
                index === 0 ? "bg-foreground" : "bg-gray-300"
              }`}
            />
            <p className="text-sm text-gray-600">
              <span className="font-medium text-foreground">
                {stageLabels[update.stage]}
              </span>{" "}
              · {formatStatusTime(update.publishedAt)}
            </p>
            <p className="mt-1 text-foreground">{update.impact}</p>
            {update.workaround && (
              <p className="mt-2 text-foreground">
                <span className="font-medium">Recommended action:</span>{" "}
                {update.workaround}
              </p>
            )}
            {update.nextUpdateAt && index === 0 && (
              <p className="mt-2 text-sm text-gray-600">
                Next update by {formatStatusTime(update.nextUpdateAt)}
              </p>
            )}
          </li>
        ))}
      </ol>
    </li>
  );
}

const StatusPage = () => {
  const [doc, setDoc] = useState<StatusDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [announcement, setAnnouncement] = useState("");
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);
  const hasDoc = useRef(false);
  const inFlight = useRef(false);
  const nextManualAt = useRef(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(remaining);
      if (remaining === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(update, 1000);
    update();
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const load = useCallback(async (manual = false) => {
    if (inFlight.current || (manual && Date.now() < nextManualAt.current)) return;
    inFlight.current = true;
    const started = performance.now();
    let message = "";
    setLoading(true);
    setAnnouncement("");
    try {
      const next = await fetchStatusDocument();
      hasDoc.current = true;
      setDoc(next);
      setFailed(false);
      setRefreshFailed(false);
      setCheckedAt(new Date());
      setNow(new Date());
      if (manual) message = "Latest published status retrieved.";
    } catch {
      // Keep what this visit already loaded, clearly marked with its time;
      // with nothing loaded yet, say so rather than guess.
      if (hasDoc.current) {
        setRefreshFailed(true);
        if (manual) message = "Unable to retrieve new updates.";
      } else {
        setFailed(true);
        if (manual) message = "Unable to retrieve status information.";
      }
    } finally {
      if (manual) {
        // Finish the current rotation, including one full turn for a cached response.
        const elapsed = performance.now() - started;
        const finishAt = Math.max(1, Math.ceil(elapsed / SPIN_MS)) * SPIN_MS;
        await new Promise<void>(resolve => window.setTimeout(resolve, finishAt - elapsed));
        nextManualAt.current = Date.now() + MANUAL_COOLDOWN_MS;
        setCooldownUntil(nextManualAt.current);
        setCooldownSeconds(MANUAL_COOLDOWN_MS / 1000);
        setAnnouncement(message);
      }
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      load();
    };
    refreshVisible();
    const refresh = window.setInterval(refreshVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [load]);

  const summary = doc ? summaries[overallStatus(doc)] : null;
  const SummaryIcon = summary ? stateStyles[summary.state].icon : null;
  const openIncidents = doc?.incidents.filter((i) => i.stage !== "resolved");
  const resolved = doc ? recentlyResolved(doc, now) : [];
  const maintenance = doc ? upcomingMaintenance(doc, now) : [];
  const componentName = (id: string) =>
    doc?.components.find((component) => component.id === id)?.name ?? id;

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 py-10">
          <header className="mb-8 flex items-center justify-between gap-4">
            {/* Same lockup as the app's top navigation. */}
            <a
              href="https://tks.life/"
              aria-label="TKS Life home"
              className="flex shrink-0 items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#51B04C]/40"
            >
              <img src="/assets/tks-logo-black.webp" alt="TKS" className="h-6 w-auto" />
              <span className="text-base font-medium text-[#231F20]">Life</span>
            </a>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loading || cooldownSeconds > 0}
                aria-busy={loading}
                className="inline-flex min-w-[132px] justify-center items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  aria-hidden="true"
                  className={loading ? styles.refreshing : undefined}
                />
                {loading ? "Refreshing" : cooldownSeconds > 0 ? `Refresh in ${cooldownSeconds}s` : "Refresh"}
              </button>
            </div>
          </header>
          <p className="sr-only" role="status">
            {announcement}
          </p>

          <h1 className="text-3xl font-semibold text-foreground">Service status</h1>

          <section aria-live="polite" className="mt-6">
            {!doc && !failed && (
              <p className="text-gray-600">Loading the latest status…</p>
            )}

            {failed && (
              <div role="alert" className="flex gap-4 rounded-lg border p-6">
                <HelpCircle
                  size={28}
                  aria-hidden="true"
                  className="shrink-0 text-gray-600"
                />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold leading-7 text-foreground">
                    Status information unavailable
                  </h2>
                  <p className="text-gray-600">
                    We are unable to retrieve current status information. Please try
                    again shortly.
                  </p>
                </div>
              </div>
            )}

            {doc && summary && SummaryIcon && (
              <div className="flex gap-4 rounded-lg border p-6">
                <SummaryIcon
                  size={28}
                  aria-hidden="true"
                  className={`shrink-0 ${stateStyles[summary.state].className}`}
                />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold leading-7 text-foreground">
                    {summary.title}
                  </h2>
                  <p className="text-gray-600">{summary.body}</p>
                  {checkedAt && (
                    <p className="text-sm text-gray-600">
                      Last checked {formatCheckedAgo(checkedAt, now)}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {refreshFailed && checkedAt && (
              <p
                role="status"
                className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <AlertTriangle
                  size={16}
                  aria-hidden="true"
                  className="shrink-0"
                />
                Unable to retrieve new updates. Showing information retrieved at{" "}
                {formatStatusTime(checkedAt.toISOString())}.
              </p>
            )}
          </section>

          {openIncidents && openIncidents.length > 0 && (
            <section className="mt-10" aria-labelledby="current-heading">
              <h2
                id="current-heading"
                className="text-xl font-semibold text-foreground"
              >
                Active incidents
              </h2>
              <ul className="mt-4 space-y-4">
                {openIncidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    componentName={componentName}
                  />
                ))}
              </ul>
            </section>
          )}

          {maintenance.length > 0 && (
            <section className="mt-10" aria-labelledby="maintenance-heading">
              <h2
                id="maintenance-heading"
                className="text-xl font-semibold text-foreground"
              >
                Scheduled maintenance
              </h2>
              <ul className="mt-4 space-y-4">
                {maintenance.map((window) => (
                  <li key={window.id} className="rounded-lg border p-6">
                    <h3 className="font-semibold text-foreground">
                      {window.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatStatusTime(window.startsAt)} to{" "}
                      {formatStatusTime(window.endsAt)} · Affects{" "}
                      {window.componentIds.map(componentName).join(", ")}
                    </p>
                    <p className="mt-3 text-foreground">{window.impact}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {doc && (
            <section className="mt-10" aria-labelledby="features-heading">
              <h2
                id="features-heading"
                className="text-xl font-semibold text-foreground"
              >
                Service availability
              </h2>
              <ul className="mt-4 divide-y rounded-lg border">
                {doc.components.map((component) => {
                  const { icon: Icon, className } =
                    stateStyles[component.state];
                  const incident = openIncidentFor(doc, component.id);
                  return (
                    <li
                      key={component.id}
                      className="flex items-center justify-between gap-4 px-6 py-4"
                    >
                      <div>
                        <p className="text-foreground">{component.name}</p>
                        {component.description && (
                          <p className="mt-0.5 text-sm text-gray-600">
                            {component.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-2 text-sm font-medium ${className}`}
                        >
                          <Icon size={18} aria-hidden="true" />
                          {stateLabels[component.state]}
                        </span>
                        {incident && (
                          <a
                            href={`#incident-${incident.id}`}
                            className="text-sm text-foreground underline underline-offset-2 hover:no-underline"
                          >
                            View incident
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {doc && (
            <section className="mt-10" aria-labelledby="recent-heading">
              <h2
                id="recent-heading"
                className="text-xl font-semibold text-foreground"
              >
                Incident history
              </h2>
              <StatusHistory doc={doc} now={now} onIncident={id => {
                setExpandedIncident(id);
                window.requestAnimationFrame(() => {
                  const incident = document.getElementById(`incident-${id}`);
                  incident?.focus({ preventScroll: true });
                  incident?.scrollIntoView({ block: "nearest" });
                });
              }} />
              <p className="mt-5 text-sm text-gray-600">Resolved incidents stay here for {RECENT_DAYS} days. Select an incident to read its updates.</p>
              {resolved.length === 0 ? (
                <p className="mt-4 rounded-lg border p-6 text-gray-600">
                  No resolved incidents in the last {RECENT_DAYS} days.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {resolved.map((incident) => (
                    <li key={incident.id}>
                      <details open={expandedIncident === incident.id} onToggle={event => {
                        if (event.currentTarget.open) setExpandedIncident(incident.id);
                        else setExpandedIncident(current => current === incident.id ? null : current);
                      }} className="rounded-lg border">
                        <summary className="cursor-pointer px-6 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                          <span className="ml-2 font-medium">{incident.title}</span>
                          <span className="ml-2 text-sm text-gray-600">Resolved {formatStatusTime(incident.resolvedAt!)}</span>
                        </summary>
                        <ul className="px-4 pb-4"><IncidentCard incident={incident} componentName={componentName} /></ul>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
};

export default StatusPage;

