import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/lib/bounded-decision-local-conformance-adapter.mjs', import.meta.url);

const forbiddenPatterns = [
  /from\s+['"]node:(?:fs(?:\/promises)?|net|http|https|child_process)['"]/,
  /from\s+['"][^'"]*@typesafe-ai\/sdk[^'"]*['"]/,
  /from\s+['"][^'"]*(?:provider-client|credential-broker|token-broker|wallet|payment|capability-issuance)[^'"]*['"]/,
  /from\s+['"][^'"]*(?:grid\/store|grid\/backup|grid-store)[^'"]*['"]/,
  /from\s+['"][^'"]*(?:gateway|hypervisor|sandbox)\.mjs['"]/,
  /issueCapability|grantCapability|mintCapability/,
  /\bfetch\s*\(/,
  /\bprocess\.env\b/,
  /TYPESAFE_API_KEY/,
  /\ballow\s*:/,
  /\bauthorized\s*:/,
  /\bachieved_assurance\b/,
  /\brequired_assurance\b/
];

test('Slice B local conformance adapter remains network-free credential-free and evidence-only', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `local adapter must remain inert: ${pattern}`);
  }
});
