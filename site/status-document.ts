// Public status document maintained by hand in tkslife/status-data.
// Hosted outside TKS Life so it still loads when the backend is down.
export const STATUS_URL =
  "/status.json";

export const COMPONENT_STATES = [
  "operational",
  "degraded",
  "outage",
  "maintenance",
  "unknown",
] as const;
export const INCIDENT_STAGES = [
  "investigating",
  "identified",
  "restoring",
  "monitoring",
  "resolved",
] as const;

export type ComponentState = (typeof COMPONENT_STATES)[number];
export type IncidentStage = (typeof INCIDENT_STAGES)[number];

export interface StatusComponent {
  id: string;
  name: string;
  /** Short plain-language explanation of what the feature covers. */
  description: string | null;
  state: ComponentState;
}

export interface IncidentUpdate {
  publishedAt: string;
  stage: IncidentStage;
  impact: string;
  workaround: string | null;
  nextUpdateAt: string | null;
}

export interface StatusIncident {
  id: string;
  title: string;
  componentIds: string[];
  stage: IncidentStage;
  updates: IncidentUpdate[];
  resolvedAt: string | null;
  severity: "degraded" | "outage" | null;
}

export interface MaintenanceWindow {
  id: string;
  title: string;
  componentIds: string[];
  startsAt: string;
  endsAt: string;
  impact: string;
}

export interface StatusDocument {
  notice?: { id: string; message: string; publishedAt: string } | null;
  components: StatusComponent[];
  incidents: StatusIncident[];
  maintenance: MaintenanceWindow[];
  historyStartedAt: string | null;
}

export const stateLabels: Record<ComponentState, string> = {
  operational: "No known issues",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

export const stageLabels: Record<IncidentStage, string> = {
  investigating: "Investigating",
  identified: "Identified",
  restoring: "Restoring",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => values.includes(value as T);

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a list");
  return value;
}

function ids(value: unknown, known: Set<string>): string[] {
  const values = list(value);
  if (!values.every((id) => typeof id === "string" && known.has(id))) {
    throw new Error("Unknown component");
  }
  return values as string[];
}

/**
 * Turns the raw JSON into a document the page can trust. Any structural
 * problem rejects the whole document, so the page never shows half-valid
 * or guessed status.
 */
export function parseStatusDocument(raw: unknown): StatusDocument {
  if (!isRecord(raw) || raw.schema_version !== 1 || !isTime(raw.generated_at)) {
    throw new Error("Unsupported status document");
  }

  const components = list(raw.components).map((item) => {
    if (
      !isRecord(item) ||
      !isText(item.id) ||
      !isText(item.name) ||
      !(
        item.description === undefined ||
        item.description === null ||
        isText(item.description)
      ) ||
      !isOneOf(COMPONENT_STATES, item.state)
    ) {
      throw new Error("Invalid component");
    }
    return {
      id: item.id,
      name: item.name,
      description: isText(item.description) ? item.description : null,
      state: item.state,
    };
  });
  const known = new Set(components.map((component) => component.id));

  const incidents = list(raw.incidents).map((item) => {
    if (
      !isRecord(item) ||
      !isText(item.id) ||
      !isText(item.title) ||
      !isOneOf(INCIDENT_STAGES, item.stage) ||
      !(item.resolved_at === null || isTime(item.resolved_at))
      || !(item.severity === undefined || item.severity === "degraded" || item.severity === "outage")
    ) {
      throw new Error("Invalid incident");
    }
    const updates = list(item.updates).map((update) => {
      if (
        !isRecord(update) ||
        !isTime(update.published_at) ||
        !isOneOf(INCIDENT_STAGES, update.stage) ||
        !isText(update.impact) ||
        !(update.workaround === null || isText(update.workaround)) ||
        !(update.next_update_at === null || isTime(update.next_update_at))
      ) {
        throw new Error("Invalid incident update");
      }
      return {
        publishedAt: update.published_at,
        stage: update.stage,
        impact: update.impact,
        workaround: update.workaround,
        nextUpdateAt: update.next_update_at,
      };
    });
    if (updates.length === 0) throw new Error("Incident without updates");
    return {
      id: item.id,
      title: item.title,
      componentIds: ids(item.component_ids, known),
      stage: item.stage,
      updates: updates.sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      ),
      resolvedAt: item.resolved_at,
      severity: item.severity ?? null,
    };
  });

  const maintenance = list(raw.maintenance).filter(item => !isRecord(item) || !item.cancelled_at).map((item) => {
    if (
      !isRecord(item) ||
      !isText(item.id) ||
      !isText(item.title) ||
      !isTime(item.starts_at) ||
      !isTime(item.ends_at) ||
      !isText(item.impact)
    ) {
      throw new Error("Invalid maintenance window");
    }
    return {
      id: item.id,
      title: item.title,
      componentIds: ids(item.component_ids, known),
      startsAt: item.starts_at,
      endsAt: isTime(item.completed_at) ? item.completed_at : item.ends_at,
      impact: item.impact,
    };
  });

  if (raw.history_started_at !== undefined && !isTime(raw.history_started_at)) {
    throw new Error("Invalid history start");
  }
  let notice = null;
  if (raw.notice != null) {
    if (!isRecord(raw.notice) || !isText(raw.notice.id) || !isText(raw.notice.message) || !isTime(raw.notice.published_at)) throw new Error("Invalid notice");
    notice = { id: raw.notice.id, message: raw.notice.message, publishedAt: raw.notice.published_at };
  }
  return { components, incidents, maintenance, notice, historyStartedAt: raw.history_started_at ?? null };
}

export type OverallStatus = "issues" | "maintenance" | "unknown" | "none";

/** One-line summary for the top of the page, worst state first. */
export function overallStatus(doc: StatusDocument): OverallStatus {
  const states = doc.components.map((component) => component.state);
  const hasOpenIncident = doc.incidents.some(
    (incident) => incident.stage !== "resolved",
  );
  if (
    hasOpenIncident ||
    states.includes("outage") ||
    states.includes("degraded")
  ) {
    return "issues";
  }
  if (states.includes("maintenance")) return "maintenance";
  if (states.includes("unknown")) return "unknown";
  return "none";
}

/** Maintenance that has not ended yet, soonest first. */
export function upcomingMaintenance(
  doc: StatusDocument,
  now: Date = new Date(),
): MaintenanceWindow[] {
  return doc.maintenance
    .filter((window) => Date.parse(window.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export const RECENT_DAYS = 90;
export const STATUS_TIME_ZONE = "America/Vancouver";

const DAY_MS = 86_400_000;
// PCT stays seven hours behind the source timestamps throughout the year.
const PCT_OFFSET_MS = -7 * 60 * 60 * 1000;
const pctDate = (time: number) => new Date(time + PCT_OFFSET_MS).toISOString().slice(0, 10);
const pctDayStart = (date: Date) => Date.parse(`${pctDate(date.getTime())}T00:00:00-07:00`);
export const historyLabels: Record<ComponentState, string> = {
  operational: "No incidents reported",
  degraded: "Incident reported",
  outage: "Outage reported",
  maintenance: "Maintenance",
  unknown: "No records",
};

export interface HistoryDay {
  date: string;
  state: ComponentState;
  incidents: StatusIncident[];
  maintenance: MaintenanceWindow[];
  coverage: "full" | "partial" | "none";
}

/** Reported incident history, not a measured uptime percentage. Dates use PCT. */
export function statusHistory(doc: StatusDocument, now = new Date()): HistoryDay[] {
  const today = pctDayStart(now);
  const tracking = doc.historyStartedAt ? Date.parse(doc.historyStartedAt) : Infinity;
  return Array.from({ length: RECENT_DAYS }, (_, index) => {
    const start = today - (RECENT_DAYS - 1 - index) * DAY_MS;
    const end = Math.min(start + DAY_MS, now.getTime() + 1);
    const incidents = doc.incidents.filter(incident => {
      const began = Math.min(...incident.updates.map(update => Date.parse(update.publishedAt)));
      const ended = incident.resolvedAt ? Date.parse(incident.resolvedAt) : now.getTime() + 1;
      return began < end && ended > start;
    });
    const maintenance = doc.maintenance.filter(window => Date.parse(window.startsAt) < end && Date.parse(window.endsAt) > start);
    const coverage = start >= tracking ? "full" : tracking < end ? "partial" : "none";
    let state: ComponentState = coverage !== "none" ? "operational" : "unknown";
    if (maintenance.length) state = "maintenance";
    if (incidents.length) state = incidents.some(incident => incident.severity === "outage") ? "outage" : "degraded";
    // Today's known problems remain visible even before an incident is written.
    if (start === today) {
      const states = doc.components.map(component => component.state);
      if (states.includes("outage")) state = "outage";
      else if (state !== "outage" && states.includes("degraded")) state = "degraded";
      else if ((state === "operational" || state === "unknown") && states.includes("maintenance")) state = "maintenance";
      else if (!incidents.length && !maintenance.length && states.includes("unknown")) state = "unknown";
    }
    return { date: pctDate(start), state, incidents, maintenance, coverage };
  });
}

export function formatHistoryDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00-07:00` : value);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: STATUS_TIME_ZONE }).format(date);
}

/** Resolved incidents from the last RECENT_DAYS days, newest first. */
export function recentlyResolved(
  doc: StatusDocument,
  now: Date = new Date(),
): StatusIncident[] {
  const since = pctDayStart(now) - (RECENT_DAYS - 1) * DAY_MS;
  return doc.incidents
    .filter(
      (incident) =>
        incident.stage === "resolved" &&
        incident.resolvedAt !== null &&
        Date.parse(incident.resolvedAt) >= since,
    )
    .sort((a, b) => Date.parse(b.resolvedAt!) - Date.parse(a.resolvedAt!));
}

/** The open incident affecting a feature, if any, so its row can link to it. */
export function openIncidentFor(
  doc: StatusDocument,
  componentId: string,
): StatusIncident | undefined {
  return doc.incidents.find(
    (incident) =>
      incident.stage !== "resolved" &&
      incident.componentIds.includes(componentId),
  );
}

/** "just now", "1 minute ago", "12 minutes ago", "2 hours ago". */
export function formatCheckedAgo(checkedAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - checkedAt.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/** Formats an instant in PCT, consistently for every reader. */
export function formatStatusTime(
  value: string,
  locale?: string,
): string {
  // Use our PCT label rather than platform-dependent PDT/PST abbreviations.
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: STATUS_TIME_ZONE,
  }).format(new Date(value)) + " PCT";
}

export async function fetchStatusDocument(
  fetcher: typeof fetch = fetch,
): Promise<StatusDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(STATUS_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Status request failed: ${response.status}`);
    return parseStatusDocument(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
