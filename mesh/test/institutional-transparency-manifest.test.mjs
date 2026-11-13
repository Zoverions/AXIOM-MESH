import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateInstitutionalTransparencyManifest } from '../src/lib/institutional-transparency-manifest.mjs';

const exampleUrl = new URL('../../agent-commons/examples/institutional-transparency-manifest.v1.json', import.meta.url);

test('institutional transparency is claim-specific and non-authoritative', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateInstitutionalTransparencyManifest(manifest, {
    now: new Date('2026-09-02T00:00:00.000Z')
  });
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.trust_effect, 'claim_specific_evidence_only');
});

test('opaque dependencies must declare unresolved assumptions', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const surface = manifest.surfaces.find(({ class: klass }) => klass === 'opaque_dependency');
  surface.unresolved_assumptions = [];
  assert.throws(
    () => validateInstitutionalTransparencyManifest(manifest),
    /opaque dependency must declare unresolved assumptions/
  );
});

test('independent verification requires inspectable evidence or artifacts', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const surface = manifest.surfaces.find(({ class: klass }) => klass === 'independently_verifiable');
  surface.artifact_refs = [];
  surface.evidence_digests = [];
  assert.throws(
    () => validateInstitutionalTransparencyManifest(manifest),
    /requires artifact or evidence references/
  );
});

test('transparency cannot become authority', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  manifest.authority.transparency_grants_authority = true;
  assert.throws(
    () => validateInstitutionalTransparencyManifest(manifest),
    /transparency_grants_authority/
  );
});

test('upgrade authority must be explicit', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  manifest.change_control.upgrade_authority_refs = [];
  assert.throws(
    () => validateInstitutionalTransparencyManifest(manifest),
    /requires upgrade authority refs/
  );
});
