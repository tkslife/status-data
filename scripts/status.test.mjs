import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["site/status-document.ts"], bundle: true, write: false, format: "esm" });
const { parseStatusDocument, overallStatus, fetchStatusDocument } = await import(
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
