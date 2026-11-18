// Diagnostic only, opt-in with AXIOM_DEPTH_PROBE=1: measures how deep a parsed
// semantic operation proposal can nest before the validator path (including
// its structuredClone argument copy) or the specialist-harness bridge fails on
// this runner. It never fails: it prints one grep-able AXIOM_DEPTH_PROBE line.
// CANONICAL_JSON_MAX_CONTRACT_DEPTH was derived from these lines (#1926); the
// validator results are capped by that bound (argument levels = bound - 4).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CANONICAL_JSON_MAX_CONTRACT_DEPTH, digestObject } from '../src/lib/canonical.mjs';
import * as proposals from '../src/lib/semantic-operation-proposal.mjs';

const MESH = new URL('../', import.meta.url).href;
const HIGH = 2100;

function probeModule() {
  const source = readFileSync(new URL('./specialist-harness-bridge.test.mjs', import.meta.url), 'utf8')
    .replace("import test from 'node:test';", 'const test = () => {};')
    .replaceAll("from '../", `from '${MESH}`);
  return `${source}
const [mode, levelsText] = process.argv.slice(2);
const levels = Number(levelsText);
const parsed = JSON.parse(JSON.stringify(deepArgumentProposal(levels)));
try {
  if (mode === 'validator') {
    if (proposals.validateSemanticOperationProposal(parsed).valid !== true) process.exit(3);
  } else {
    const b = withBridge(x => { x.composition_binding.semantic_operation_proposal_digest = parsed.proposal_digest; });
    const result = validateSpecialistHarnessBridge(b, { references: { semantic_operation_proposal: parsed } });
    if (!result.references_checked.includes('semantic_operation_proposal')) process.exit(3);
  }
  process.exit(0);
} catch (error) {
  process.stderr.write(String(error?.name) + ': ' + String(error?.message).slice(0, 120));
  process.exit(4);
}
`;
}

// Same construction as deepArgumentProposal in specialist-harness-bridge.test.mjs.
function deepProposal(api, digest, levels) {
  const provider = {
    provider_ref: 'provider.bridge.deep', profile_ref: 'profile.bridge.deep', artifact_ref: 'artifact.bridge.deep',
    runtime_ref: 'runtime.bridge.deep', revision_evidence: 'content-addressed', provider_mode: 'owner-local'
  };
  const manifest = api.createInertOperationManifestFixture();
  const candidates = manifest.operations.map(entry => ({ operation_id: entry.operation_id, eligible: true, eligibility_reason: 'eligible' }));
  const providerResult = api.normalizeGenericProviderResult({
    calls: [{ operation_id: manifest.operations[0].operation_id, arguments: { settings: 1 }, confidence: 0.8 }],
    suppressed: [], confidence: 0.8, latency_ms: 1, usage_evidence: null, explanation: null
  });
  const proposal = structuredClone(api.createSemanticOperationProposal({
    provider, manifest, candidates, request_digest: 'a'.repeat(64), state_digest: 'b'.repeat(64), state_classification: 'internal',
    candidate_mode: 'eligible-only', provider_result: providerResult, expected_provider_identity: provider,
    locality_policy: 'any', calibration_report_ref: null
  }));
  let value = 1;
  for (let index = 0; index < levels; index += 1) value = [value];
  (proposal.withheld[0] ?? proposal.proposed[0]).arguments = { settings: value };
  const { proposal_digest: _ignored, ...payload } = proposal;
  try { proposal.proposal_digest = digest(payload); } catch { proposal.proposal_digest = '9'.repeat(64); }
  return proposal;
}

function accepts(file, mode, levels) {
  try {
    execFileSync(process.execPath, [file, mode, String(levels)], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function deepest(predicate) {
  if (!predicate(1)) return 0;
  let low = 1;
  let high = HIGH;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (predicate(middle)) low = middle; else high = middle - 1;
  }
  return low;
}

test('AXIOM_DEPTH_PROBE: proposal validator and bridge depth on this runner (diagnostic, never fails)', {
  skip: process.env.AXIOM_DEPTH_PROBE === '1' ? false : 'opt-in diagnostic: set AXIOM_DEPTH_PROBE=1'
}, async t => {
  const file = join(tmpdir(), `axiom-depth-probe-${process.pid}.mjs`);
  let line;
  try {
    writeFileSync(file, probeModule());
    const validator = deepest(levels => accepts(file, 'validator', levels));
    const bridge = deepest(levels => accepts(file, 'bridge', levels));
    // In-process, at the test runner's own stack depth, where the at-bound test runs.
    const inprocess = deepest(levels => {
      try {
        const parsed = JSON.parse(JSON.stringify(deepProposal(proposals, digestObject, levels)));
        return proposals.validateSemanticOperationProposal(parsed).valid === true;
      } catch {
        return false;
      }
    });
    // structuredClone alone, in-process, with no bound in the way (ceiling 20,000).
    const nested = levels => { let value = 1; for (let index = 0; index < levels; index += 1) value = [value]; return value; };
    let low = 1;
    let high = 20_000;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      let ok = true;
      try { structuredClone(nested(middle)); } catch { ok = false; }
      if (ok) low = middle; else high = middle - 1;
    }
    line = `AXIOM_DEPTH_PROBE os=${process.platform}-${process.arch} node=${process.version} validator_max=${validator} bridge_max=${bridge} inprocess_validator_max=${inprocess} structuredclone_inprocess_max=${low} search_ceiling=${HIGH} bound_cap=${CANONICAL_JSON_MAX_CONTRACT_DEPTH - 4}`;
  } catch (error) {
    line = `AXIOM_DEPTH_PROBE os=${process.platform}-${process.arch} node=${process.version} error=${String(error?.message).slice(0, 200)}`;
  } finally {
    rmSync(file, { force: true });
  }
  t.diagnostic(line);
  process.stdout.write(`${line}\n`);
});
