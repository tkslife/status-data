// Checks status.json against the public allowlist in tkslife/tks-life-status docs/data-contract.md.
// Unknown fields, unknown states and links in text all fail. No dependencies.
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "status.json";
const errors = [];
const fail = (message) => errors.push(message);

const STATES = ["operational", "degraded", "outage", "maintenance", "unknown"];
const MONITORING = ["measured", "partial", "unmonitored", "stale"];
const STAGES = ["investigating", "identified", "restoring", "monitoring", "resolved"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

function exactKeys(value, keys, where) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${where} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${where} has unknown field "${key}"`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${where} is missing "${key}"`);
  }
  return true;
}

function text(value, where, { max = 400, nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !value.trim()) return fail(`${where} must be non-empty text`);
  if (value.length > max) fail(`${where} is longer than ${max} characters`);
  if (/https?:\/\/|www\.|@/i.test(value)) fail(`${where} must not contain links or email addresses`);
}

function time(value, where, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !UTC.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${where} must be a UTC time like 2026-10-23T22:15:00Z`);
  }
}

function list(value, where) {
  if (!Array.isArray(value)) {
    fail(`${where} must be a list`);
    return [];
  }
  return value;
}

let doc;
try {
  doc = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`${file} is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (exactKeys(doc, ["schema_version", "generated_at", "components", "incidents", "maintenance"], "status")) {
  if (doc.schema_version !== 1) fail("schema_version must be 1");
  time(doc.generated_at, "generated_at");

  const componentIds = new Set();
  list(doc.components, "components").forEach((c, i) => {
    const where = `components[${i}]`;
    if (!exactKeys(c, ["id", "name", "state", "monitoring", "checked_at", "coverage_note"], where)) return;
    if (!ID.test(c.id ?? "")) fail(`${where}.id must be lowercase words joined by hyphens`);
    if (componentIds.has(c.id)) fail(`${where}.id "${c.id}" is used twice`);
    componentIds.add(c.id);
    text(c.name, `${where}.name`, { max: 60 });
    if (!STATES.includes(c.state)) fail(`${where}.state must be one of ${STATES.join(", ")}`);
    if (!MONITORING.includes(c.monitoring)) fail(`${where}.monitoring must be one of ${MONITORING.join(", ")}`);
    time(c.checked_at, `${where}.checked_at`, { nullable: true });
    text(c.coverage_note, `${where}.coverage_note`, { max: 200 });
  });
  if (componentIds.size === 0) fail("components must list at least one component");

  const checkComponentIds = (ids, where) => {
    const values = list(ids, where);
    if (values.length === 0) fail(`${where} must name at least one component`);
    values.forEach((id) => {
      if (!componentIds.has(id)) fail(`${where} names unknown component "${id}"`);
    });
  };

  const incidentIds = new Set();
  list(doc.incidents, "incidents").forEach((incident, i) => {
    const where = `incidents[${i}]`;
    if (!exactKeys(incident, ["id", "title", "component_ids", "stage", "updates", "resolved_at"], where)) return;
    if (!ID.test(incident.id ?? "")) fail(`${where}.id must be lowercase words joined by hyphens`);
    if (incidentIds.has(incident.id)) fail(`${where}.id "${incident.id}" is used twice`);
    incidentIds.add(incident.id);
    text(incident.title, `${where}.title`, { max: 120 });
    checkComponentIds(incident.component_ids, `${where}.component_ids`);
    if (!STAGES.includes(incident.stage)) fail(`${where}.stage must be one of ${STAGES.join(", ")}`);
    const updates = list(incident.updates, `${where}.updates`);
    if (updates.length === 0) fail(`${where}.updates needs at least one update`);
    updates.forEach((update, j) => {
      const at = `${where}.updates[${j}]`;
      if (!exactKeys(update, ["published_at", "stage", "impact", "workaround", "next_update_at"], at)) return;
      time(update.published_at, `${at}.published_at`);
      if (!STAGES.includes(update.stage)) fail(`${at}.stage must be one of ${STAGES.join(", ")}`);
      text(update.impact, `${at}.impact`);
      text(update.workaround, `${at}.workaround`, { nullable: true });
      time(update.next_update_at, `${at}.next_update_at`, { nullable: true });
    });
    time(incident.resolved_at, `${where}.resolved_at`, { nullable: true });
    if ((incident.stage === "resolved") !== (incident.resolved_at !== null)) {
      fail(`${where} must have resolved_at set exactly when stage is resolved`);
    }
  });

  list(doc.maintenance, "maintenance").forEach((window, i) => {
    const where = `maintenance[${i}]`;
    if (!exactKeys(window, ["id", "title", "component_ids", "starts_at", "ends_at", "impact"], where)) return;
    if (!ID.test(window.id ?? "")) fail(`${where}.id must be lowercase words joined by hyphens`);
    text(window.title, `${where}.title`, { max: 120 });
    checkComponentIds(window.component_ids, `${where}.component_ids`);
    time(window.starts_at, `${where}.starts_at`);
    time(window.ends_at, `${where}.ends_at`);
    if (Date.parse(window.ends_at) <= Date.parse(window.starts_at)) fail(`${where}.ends_at must be after starts_at`);
    text(window.impact, `${where}.impact`);
  });
}

if (errors.length) {
  console.error(`${file} failed the public status checks:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`${file} passed the public status checks.`);
