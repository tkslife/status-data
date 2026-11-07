import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function updateStatus(source, input, now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) {
  const doc = structuredClone(source);
  const required = (key, max) => {
    const value = input[key]?.trim();
    if (!value || value.length > max || /https?:\/\/|www\.|@/i.test(value)) throw new Error(`Check ${key}: plain text required, maximum ${max} characters; no links or email addresses.`);
    return value;
  };
  if (input.kind === 'advisory' && input.action === 'Clear notice') {
    doc.notice = null;
    doc.generated_at = now;
    return doc;
  }
  const id = required('id', 100);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('Reference must use lowercase words joined by hyphens.');
  const ids = (input.kind === 'advisory' || input.components === 'all') ? doc.components.map(c => c.id) : [input.components];
  if (!ids.every(id => doc.components.some(c => c.id === id))) throw new Error('Unknown affected service.');
  if (input.kind === 'maintenance' && ['Cancel window', 'Finish early'].includes(input.action)) {
    const previous = doc.maintenance.find(m => m.id === id);
    if (!previous || previous.cancelled_at || previous.completed_at) throw new Error('Select an existing unfinished maintenance reference.');
    const started = Date.parse(previous.starts_at) <= Date.parse(now);
    if (input.action === 'Cancel window' && started) throw new Error('This window has started. Use Finish early.');
    if (input.action === 'Finish early' && (!started || Date.parse(previous.ends_at) <= Date.parse(now))) throw new Error('Only an active maintenance window can finish early.');
    previous[input.action === 'Cancel window' ? 'cancelled_at' : 'completed_at'] = now;
    doc.generated_at = now;
    return doc;
  }
  const message = required('message', 400);
  if (input.kind === 'advisory') {
    if (input.action !== 'Publish notice') throw new Error('Unknown advisory action.');
    doc.notice = { id, message, published_at: now };
    doc.generated_at = now;
    return doc;
  }
  const title = required('title', 120);
  if (input.kind === 'incident') {
    if (!['investigating', 'identified', 'restoring', 'monitoring', 'resolved'].includes(input.stage)) throw new Error('Unknown incident stage.');
    if (!['degraded', 'outage'].includes(input.severity)) throw new Error('Unknown severity.');
    let incident = doc.incidents.find(i => i.id === id);
    if (incident?.stage === 'resolved') throw new Error('This incident is already resolved. Use a new reference for a recurrence.');
    if (!incident && input.stage === 'resolved') throw new Error('Cannot resolve an incident that does not exist.');
    if (incident && JSON.stringify([...incident.component_ids].sort()) !== JSON.stringify([...ids].sort())) throw new Error('Keep the affected services unchanged for this incident; use a separate notice for new scope.');
    if (!incident) {
      incident = { id, title, component_ids: ids, stage: input.stage, severity: input.severity, updates: [], resolved_at: null };
      doc.incidents.unshift(incident);
    }
    incident.title = title;
    incident.stage = input.stage;
    // Keep the worst recorded severity for the historical timeline.
    incident.severity = incident.severity === 'outage' ? 'outage' : input.severity;
    incident.current_severity = input.severity;
    incident.resolved_at = input.stage === 'resolved' ? now : null;
    incident.updates.unshift({ published_at: now, stage: input.stage, impact: message, workaround: null, next_update_at: null });
    for (const c of doc.components.filter(c => ids.includes(c.id))) {
      const remaining = doc.incidents.filter(i => i.stage !== 'resolved' && i.component_ids.includes(c.id));
      // Do not clear an unrelated maintenance or unknown state.
      if (!['maintenance', 'unknown'].includes(c.state)) c.state = remaining.some(i => (i.current_severity ?? i.severity) === 'outage') ? 'outage' : remaining.length ? 'degraded' : 'operational';
    }
  } else if (input.kind === 'maintenance') {
    if (input.action !== 'Schedule or update') throw new Error('Unknown maintenance action.');
    for (const key of ['starts_at', 'ends_at']) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/.test(input[key] ?? '') || !Number.isFinite(Date.parse(input[key]))) throw new Error(`${key} must be a UTC time: YYYY-MM-DDTHH:MM:00Z.`);
      if (new Date(input[key]).toISOString().replace('.000Z', 'Z') !== input[key]) throw new Error(`${key} must be a real calendar date.`);
    }
    if (Date.parse(input.ends_at) <= Date.parse(input.starts_at)) throw new Error('End must be after start.');
    const previous = doc.maintenance.find(m => m.id === id);
    if (previous && Date.parse(previous.starts_at) <= Date.parse(now)) throw new Error('A started maintenance record is historical evidence. Publish an incident update for an overrun; do not rewrite the window.');
    if (Date.parse(input.starts_at) <= Date.parse(now)) throw new Error('Schedule a future window. Use an incident notice for an interruption already in progress.');
    const window = { id, title, component_ids: ids, starts_at: input.starts_at, ends_at: input.ends_at, impact: message };
    if (previous) doc.maintenance[doc.maintenance.indexOf(previous)] = window;
    else doc.maintenance.push(window);
  } else throw new Error('Unknown form.');
  doc.generated_at = now;
  return doc;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).inputs;
  if (!['Dev practice', 'Production'].includes(input.environment)) throw new Error('Unknown environment.');
  const file = input.environment === 'Production' ? 'status.json' : 'dev-status.json';
  const candidate = updateStatus(JSON.parse(readFileSync(file, 'utf8')), { ...input, kind: process.argv[2] });
  writeFileSync(file, JSON.stringify(candidate, null, 2) + '\n');
  writeFileSync(process.env.GITHUB_OUTPUT, `file=${file}\n`, { flag: 'a' });
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## ${input.publish === 'true' ? 'Publication requested : not yet live' : 'Preview only : nothing published'}\n\n` +
    `<table>${Object.entries({Environment: input.environment, Action: input.action ?? input.stage, Reference: input.id, Title: input.title, Message: input.message, Service: input.components, Impact: input.severity, 'Start (UTC)': input.starts_at, 'End (UTC)': input.ends_at}).filter(([,value]) => value).map(([key,value]) => `<tr><th>${key}</th><td>${escape(value)}</td></tr>`).join('')}</table>\n\n` +
    'Public notices do not pause or reopen platform access. Publication and live cache visibility are separate checks.\n', { flag: 'a' });
}
