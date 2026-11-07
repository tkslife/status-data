import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateStatus } from './operator-update.mjs';

const base = { schema_version: 1, components: [{ id: 'sign-in', state: 'operational' }], incidents: [], maintenance: [] };
const input = { kind: 'incident', id: 'login-delay', title: 'Sign-in delays', components: 'sign-in', severity: 'degraded', stage: 'investigating', message: 'Some sign-ins are delayed.' };
const now = '2026-11-07T03:00:00Z';
test('updates retain history and resolving one incident does not clear another', () => {
  const one = updateStatus(base, input, now);
  const two = updateStatus(one, { ...input, id: 'second', severity: 'outage' }, now);
  const resolved = updateStatus(two, { ...input, stage: 'resolved' }, now);
  assert.equal(resolved.components[0].state, 'outage');
  assert.equal(resolved.incidents.find(i => i.id === input.id).updates.length, 2);
  assert.equal(base.incidents.length, 0);
  assert.throws(() => updateStatus(resolved, input, now), /already resolved/);
});
test('unknown references, stages and service scope fail before publication', () => {
  assert.throws(() => updateStatus(base, { ...input, stage: 'resolved' }, now), /does not exist/);
  assert.throws(() => updateStatus(base, { ...input, components: 'other' }, now), /Unknown affected/);
  assert.throws(() => updateStatus(base, { ...input, stage: 'bad' }, now), /Unknown incident/);
  assert.throws(() => updateStatus(base, { ...input, message: 'secret@example.com' }, now), /plain text/);
});
test('maintenance does not change health, enforces future UTC windows and preserves started records', () => {
  const maintenance = { ...input, kind: 'maintenance', action: 'Schedule or update', starts_at: '2026-11-08T03:00:00Z', ends_at: '2026-11-08T04:00:00Z' };
  const scheduled = updateStatus(base, maintenance, now);
  assert.equal(scheduled.components[0].state, 'operational');
  assert.throws(() => updateStatus(base, { ...maintenance, ends_at: maintenance.starts_at }, now), /End must/);
  assert.throws(() => updateStatus(scheduled, maintenance, '2026-11-08T03:30:00Z'), /historical evidence/);
});

test('advisories preserve health and clear without changing incident history', () => {
  const notice = updateStatus(base, { ...input, kind: 'advisory', action: 'Publish notice' }, now);
  assert.equal(notice.components[0].state, 'operational');
  assert.equal(notice.incidents.length, 0);
  assert.equal(updateStatus(notice, { kind: 'advisory', action: 'Clear notice' }, now).notice, null);
});
test('current impact can recover while history retains the worst impact', () => {
  const outage = updateStatus(base, { ...input, severity: 'outage' }, now);
  const recovered = updateStatus(outage, { ...input, stage: 'monitoring' }, now);
  assert.equal(recovered.components[0].state, 'degraded');
  assert.equal(recovered.incidents[0].severity, 'outage');
});
test('maintenance can be cancelled or finished early without deleting its schedule', () => {
  const fields = { ...input, kind: 'maintenance', action: 'Schedule or update', starts_at: '2026-11-08T03:00:00Z', ends_at: '2026-11-08T04:00:00Z' };
  const scheduled = updateStatus(base, fields, now);
  const cancelled = updateStatus(scheduled, { ...fields, action: 'Cancel window' }, now);
  assert.equal(cancelled.maintenance[0].cancelled_at, now);
  const finished = updateStatus(scheduled, { ...fields, action: 'Finish early' }, '2026-11-08T03:30:00Z');
  assert.equal(finished.maintenance[0].ends_at, fields.ends_at);
  assert.equal(finished.maintenance[0].completed_at, '2026-11-08T03:30:00Z');
});
