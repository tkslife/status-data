import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["site/status-document.ts"], bundle: true, write: false, format: "esm" });
const { parseStatusDocument, overallStatus, fetchStatusDocument, statusHistory, recentlyResolved } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const raw = JSON.parse(await readFile("status.json", "utf8"));

test("unknown component state cannot be presented as healthy", () => {
  const invalid = structuredClone(raw);
  invalid.components[0].state = "unexpected";
  assert.throws(() => parseStatusDocument(invalid));
});

test("an open incident takes precedence over operational component states", () => {
  const incident = {
    id: "synthetic", title: "Synthetic incident", component_ids: [raw.components[0].id],
    stage: "investigating", resolved_at: null,
    updates: [{ stage: "investigating", published_at: "2026-11-06T12:00:00Z", impact: "Synthetic impact.", workaround: null, next_update_at: null }],
  };
  assert.equal(overallStatus(parseStatusDocument({ ...raw, incidents: [incident] })), "issues");
});

test("the page fetches only its own status file and rejects HTTP errors", async () => {
  let requestedUrl;
  await assert.rejects(fetchStatusDocument(async (url) => {
    requestedUrl = url;
    return new Response("Unavailable", { status: 503 });
  }));
  assert.equal(requestedUrl, "/status.json");
});

test("the publishing validator rejects invalid and private fields before publication", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tks-status-validation-"));
  try {
    for (const invalid of [{ ...raw, internal_url: "https://internal.example" }, { ...raw, schema_version: 2 }]) {
      const file = join(dir, "invalid.json");
      await writeFile(file, JSON.stringify(invalid));
      const result = spawnSync(process.execPath, ["scripts/validate.mjs", file]);
      assert.equal(result.status, 1);
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});

const incident = (overrides = {}) => ({
  id: "synthetic", title: "Synthetic incident", component_ids: [raw.components[0].id],
  stage: "resolved", resolved_at: "2026-11-06T00:00:00Z", severity: "outage",
  updates: [{ stage: "investigating", published_at: "2026-11-05T23:30:00Z", impact: "Synthetic impact.", workaround: null, next_update_at: null }],
  ...overrides,
});
const historyDoc = (overrides = {}) => parseStatusDocument({ ...raw, history_started_at: "2026-11-01T00:00:00Z", incidents: [], ...overrides });

test("90 UTC days preserve missing coverage and midnight incident boundaries", () => {
  const days = statusHistory(historyDoc({ incidents: [incident()] }), new Date("2026-11-07T01:00:00-08:00"));
  assert.equal(days.length, 90);
  assert.equal(days.at(-1).date, "2026-11-07");
  assert.equal(days.find(day => day.date === "2026-10-31").state, "unknown");
  assert.equal(days.find(day => day.date === "2026-11-01").state, "operational");
  assert.equal(days.find(day => day.date === "2026-11-05").state, "outage");
  assert.equal(days.find(day => day.date === "2026-11-06").state, "operational");
});

test("ongoing incidents span the window and legacy severity is not invented", () => {
  const open = incident({ stage: "investigating", resolved_at: null, severity: undefined,
    updates: [{ stage: "investigating", published_at: "2026-01-01T00:00:00Z", impact: "Synthetic impact.", workaround: null, next_update_at: null }] });
  const days = statusHistory(historyDoc({ incidents: [open] }), new Date("2026-11-07T12:00:00Z"));
  assert.ok(days.every(day => day.state === "degraded" && day.incidents[0].severity === null));
});

test("future events stay absent and partial first-day reporting is explicit", () => {
  const doc = historyDoc({ history_started_at: "2026-11-07T10:00:00Z", incidents: [incident({
    resolved_at: "2026-11-08T12:00:00Z", updates: [{ stage: "investigating", published_at: "2026-11-08T10:00:00Z", impact: "Synthetic impact.", workaround: null, next_update_at: null }],
  })] });
  const days = statusHistory(doc, new Date("2026-11-07T11:00:00Z"));
  assert.equal(days.at(-1).coverage, "partial");
  assert.equal(days.at(-1).state, "operational");
  assert.ok(days.slice(0, -1).every(day => day.state === "unknown"));
});

test("outages outrank maintenance and recent incident retention uses calendar days", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const doc = historyDoc({ incidents: [incident()], maintenance: [{ id: "planned", title: "Synthetic maintenance", component_ids: [raw.components[0].id], starts_at: "2026-11-05T00:00:00Z", ends_at: "2026-11-07T00:00:00Z", impact: "Synthetic impact." }] });
  const days = statusHistory(doc, now);
  assert.equal(days.find(day => day.date === "2026-11-05").state, "outage");
  assert.equal(days.find(day => day.date === "2026-11-06").state, "maintenance");
  assert.equal(days.at(-1).state, "operational");
  assert.equal(recentlyResolved(doc, now).length, 1);
  assert.equal(recentlyResolved(doc, new Date("2027-02-04T00:00:00Z")).length, 0);
});

test("invalid historical severity and resolution order cannot be published", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tks-history-validation-"));
  try {
    for (const invalid of [
      { ...raw, incidents: [incident({ severity: "healthy" })] },
      { ...raw, incidents: [incident({ resolved_at: "2026-11-04T00:00:00Z" })] },
      { ...raw, history_started_at: "2030-01-01T00:00:00Z" },
    ]) {
      const file = join(dir, "invalid.json");
      await writeFile(file, JSON.stringify(invalid));
      assert.equal(spawnSync(process.execPath, ["scripts/validate.mjs", file]).status, 1);
    }
  } finally { await rm(dir, { recursive: true }); }
});
