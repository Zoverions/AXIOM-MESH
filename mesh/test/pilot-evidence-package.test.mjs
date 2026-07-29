import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createSyntheticPilotEvidencePackage,
  runPilotEvidencePackageConformanceDrill,
  verifyPilotEvidencePackageConformanceEvidence
} from '../src/pilot-evidence-package-drill.mjs';
import {
  verifyPilotEvidenceEnvelope,
  verifyPilotEvidencePackage
} from '../src/pilot-evidence-package.mjs';
import { canonicalJson } from '../src/lib/canonical.mjs';

test('offline pilot package verifies exact canonical role-signed evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-pilot-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const fixture = await createSyntheticPilotEvidencePackage({ root, now });
  const result = await verifyPilotEvidencePackage({
    packageDir: root,
    authorityPublicKey: fixture.authorityPublicKey,
    now
  });

  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-pilot-evidence-package-verification.v1');
  assert.equal(result.canonical_control_files, 2);
  assert.equal(result.canonical_evidence_files, 13);
  assert.equal(Object.keys(result.producer_roles).length, 5);
  assert.equal(result.intake_status, 'accepted-for-promotion-review');
  assert.equal(result.production_promoted, false);

  const path = join(root, 'evidence', 'deployment_manifest.json');
  const altered = JSON.parse(await readFile(path, 'utf8'));
  altered.summary = `${altered.summary} Altered after dossier approval.`;
  await writeFile(path, canonicalJson(altered), 'utf8');
  await assert.rejects(
    verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }),
    /evidence digest differs/
  );
});

test('pilot evidence envelope rejects build, producer, detail, and signature drift', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-pilot-envelope-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const fixture = await createSyntheticPilotEvidencePackage({ root, now });
  const type = 'custody_assessment';
  const metadata = fixture.dossier.evidence.find(item => item.type === type);
  const envelope = JSON.parse(
    await readFile(join(root, 'evidence', `${type}.json`), 'utf8')
  );
  const verify = value => verifyPilotEvidenceEnvelope({
    envelope: value,
    type,
    metadata,
    dossier: fixture.dossier,
    policy: fixture.policy
  });

  assert.equal(verify(envelope).valid, true);

  const wrongBuild = structuredClone(envelope);
  wrongBuild.source.source_revision = 'c'.repeat(40);
  assert.throws(() => verify(wrongBuild), /envelope is invalid/);

  const wrongRole = structuredClone(envelope);
  wrongRole.producer.role = 'platform_operator';
  assert.throws(() => verify(wrongRole), /envelope is invalid/);

  const secretBearing = structuredClone(envelope);
  secretBearing.details.private_key = 'redacted';
  assert.throws(() => verify(secretBearing), /forbidden secret field/);

  const alteredSignature = structuredClone(envelope);
  alteredSignature.summary = `${alteredSignature.summary} Altered.`;
  assert.throws(() => verify(alteredSignature), /signature is invalid/);
});

test('signed package conformance proves exact inventory without claiming a pilot', async () => {
  const now = Date.parse('2026-07-29T15:00:00.000Z');
  const evidence = await runPilotEvidencePackageConformanceDrill({
    now,
    sourceRevision: 'd'.repeat(40)
  });
  const verified = verifyPilotEvidencePackageConformanceEvidence(evidence);

  assert.equal(verified.valid, true);
  assert.equal(verified.live_pilot_observed, false);
  assert.equal(verified.production_promotion_claimed, false);
  assert.ok(Object.values(evidence.checks).every(Boolean));

  const tampered = structuredClone(evidence);
  tampered.results.canonical_evidence_files -= 1;
  assert.throws(
    () => verifyPilotEvidencePackageConformanceEvidence(tampered),
    /conformance evidence/
  );
});
