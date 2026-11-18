import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Documentation regression checks only. Runtime verification and replay behavior
// remain covered by praxis-attestation-gate-v0.test.mjs.
const planUrl = new URL('../../labs/praxis/ATTESTATION-GATE-PLAN.md', import.meta.url);

async function designRule(start, end) {
  const plan = await readFile(planUrl, 'utf8');
  const first = plan.indexOf(start);
  assert.notEqual(first, -1, `missing design rule: ${start}`);
  const last = plan.indexOf(end, first + start.length);
  assert.ok(last > first, `missing next design rule: ${end}`);
  return plan.slice(first, last).replace(/\s+/g, ' ');
}

test('attestation plan distinguishes structural and caller-required non-claims checks', async () => {
  const rule = await designRule('- **Explicit non-claims', '- **Fulfillment-gated actions');
  assert.match(rule, /Structural validation .* before signature verification/);
  assert.match(rule, /Caller-required membership is checked after signature, signer-role, and freshness checks/);
  assert.match(rule, /before any optional nullifier spending or successful return/);
  assert.doesNotMatch(rule, /widening fails closed before signature verification/);
});

test('attestation plan makes replay consumption conditional on caller-supplied state', async () => {
  const rule = await designRule('- **Nullifiers against replay', '- **Explicit non-claims');
  assert.match(rule, /When a registry is supplied, successful verification spends the nullifier/);
  assert.match(rule, /Without a registry, verification is stateless/);
  assert.match(rule, /authority-boundary coordinator must supply replay state/);
  assert.match(rule, /default registry is in-memory and durability is caller-owned/);
  assert.doesNotMatch(rule, /spent on first verification/);
});

test('attestation plan preserves synthetic-host and production-unreachable limitations', async () => {
  const plan = (await readFile(planUrl, 'utf8')).replace(/\s+/g, ' ');
  assert.match(plan, /Synthetic-host-only\. No authority\./);
  assert.match(plan, /P0 remains synthetic-host-only, production-unreachable/);
  assert.match(plan, /No merges\. No language syntax changes\. No registry\/capability changes\./);
});
