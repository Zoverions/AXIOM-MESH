import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildArxivPaperTextManifest,
  buildArxivVersionedPdfManifest,
  classifyArxivLicense,
  normalizeArxivIndexRecord,
  verifyArxivIndexRecord
} from '../src/lib/arxiv-research-source-profile.mjs';
import { verifyResearchSourceManifest } from '../src/lib/research-capsule-contracts.mjs';

const fixtureUrl = new URL('../fixtures/research-sources/arxiv-source-profile-v0.vectors.json', import.meta.url);
const moduleUrl = new URL('../src/lib/arxiv-research-source-profile.mjs', import.meta.url);

async function fixtures() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('arXiv source profile is inert and contains no live fetch/effect imports', async () => {
  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'process.env',
    'fetch(',
    'capabilities.json'
  ]) {
    assert.equal(source.includes(forbidden), false, `arXiv source profile contains ${forbidden}`);
  }
});

test('CC0 and CC BY are the only automatic owner-local full-text allowlist', () => {
  for (const license of [
    'http://creativecommons.org/publicdomain/zero/1.0/',
    'http://creativecommons.org/licenses/by/3.0/',
    'http://creativecommons.org/licenses/by/4.0/'
  ]) {
    const policy = classifyArxivLicense(license);
    assert.equal(policy.owner_local_full_text_ingest, 'allow');
    assert.equal(policy.model_training, 'deny');
    assert.equal(policy.redistribution, 'deny');
  }

  for (const license of [
    null,
    'http://arxiv.org/licenses/nonexclusive-distrib/1.0/',
    'http://creativecommons.org/licenses/by-sa/4.0/',
    'http://creativecommons.org/licenses/by-nc-nd/4.0/',
    'https://example.invalid/unknown-license'
  ]) {
    const policy = classifyArxivLicense(license);
    assert.equal(policy.metadata_ingest, 'allow');
    assert.equal(policy.owner_local_full_text_ingest, 'deny');
    assert.equal(policy.model_training, 'deny');
    assert.equal(policy.redistribution, 'deny');
    assert.equal(policy.review_required, true);
  }
});

test('metadata normalization is deterministic and digest-bound', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'cc-by-latest');
  const first = normalizeArxivIndexRecord(raw.metadata);
  const second = normalizeArxivIndexRecord({ ...raw.metadata });

  assert.deepEqual(first, second);
  assert.match(first.record_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyArxivIndexRecord(first).paper_id, raw.metadata.paper_id);
  assert.deepEqual(first.categories, ['cs.AI', 'cs.CR']);
});

test('paper_text source remains explicitly unversioned and unknown-currentness', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'cc-by-latest');
  const index = normalizeArxivIndexRecord(raw.metadata);
  const manifest = buildArxivPaperTextManifest({
    index_record: index,
    paper_text_row: raw.paper_text,
    retrieved_at: '2026-09-20T16:30:00.000Z'
  });

  verifyResearchSourceManifest(manifest);
  assert.equal(manifest.currentness_state, 'unknown');
  assert.match(manifest.source_version, /^unversioned-source-snapshot:/);
  assert.equal(manifest.manuscript_digest, `sha256:${raw.paper_text.text_sha256}`);
  assert.ok(manifest.data_refs.includes('provenance:paper_text:source_version_not_proven'));
});

test('versioned PDF latest-in-snapshot is still unknown, never live current', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'cc-by-latest');
  const index = normalizeArxivIndexRecord(raw.metadata);
  const manifest = buildArxivVersionedPdfManifest({
    index_record: index,
    version_row: raw.version,
    pdf_row: raw.pdf,
    retrieved_at: '2026-09-20T16:30:00.000Z'
  });

  verifyResearchSourceManifest(manifest);
  assert.equal(manifest.currentness_state, 'unknown');
  assert.notEqual(manifest.currentness_state, 'current');
  assert.equal(manifest.source_version, 'v2');
  assert.equal(manifest.manuscript_digest, `sha256:${raw.pdf.sha256}`);
});

test('superseded versioned PDF is preserved as stale_revision', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'cc0-stale-pdf');
  const index = normalizeArxivIndexRecord(raw.metadata);
  const manifest = buildArxivVersionedPdfManifest({
    index_record: index,
    version_row: raw.version,
    pdf_row: raw.pdf,
    retrieved_at: '2026-09-20T16:30:00.000Z'
  });

  verifyResearchSourceManifest(manifest);
  assert.equal(manifest.currentness_state, 'stale_revision');
  assert.equal(manifest.source_version, 'v2');
});

test('arXiv nonexclusive paper remains metadata-only in automatic profile', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'arxiv-nonexclusive');
  const index = normalizeArxivIndexRecord(raw.metadata);

  assert.equal(index.ingestion_policy.metadata_ingest, 'allow');
  assert.equal(index.ingestion_policy.owner_local_full_text_ingest, 'deny');

  assert.throws(
    () => buildArxivPaperTextManifest({
      index_record: index,
      paper_text_row: raw.paper_text,
      retrieved_at: '2026-09-20T16:30:00.000Z'
    }),
    /full-text ingestion is not auto-admitted/
  );
});

test('paper, title, category, licence, version, and PDF digest mismatches fail closed', async () => {
  const data = await fixtures();
  const raw = data.cases.find(item => item.id === 'cc-by-latest');
  const index = normalizeArxivIndexRecord(raw.metadata);

  assert.throws(
    () => buildArxivPaperTextManifest({
      index_record: index,
      paper_text_row: { ...raw.paper_text, paper_id: '2609.99999' },
      retrieved_at: '2026-09-20T16:30:00.000Z'
    }),
    /paper_id/
  );

  assert.throws(
    () => buildArxivPaperTextManifest({
      index_record: index,
      paper_text_row: { ...raw.paper_text, license: 'http://creativecommons.org/publicdomain/zero/1.0/' },
      retrieved_at: '2026-09-20T16:30:00.000Z'
    }),
    /license binding mismatch/
  );

  assert.throws(
    () => buildArxivPaperTextManifest({
      index_record: index,
      paper_text_row: { ...raw.paper_text, title: 'Different title' },
      retrieved_at: '2026-09-20T16:30:00.000Z'
    }),
    /title does not match/
  );

  assert.throws(
    () => buildArxivVersionedPdfManifest({
      index_record: index,
      version_row: raw.version,
      pdf_row: { ...raw.pdf, sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' },
      retrieved_at: '2026-09-20T16:30:00.000Z'
    }),
    /pdf_sha256/
  );
});
