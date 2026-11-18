import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildArxivVersionedPdfManifest,
  normalizeArxivIndexRecord
} from '../src/lib/arxiv-research-source-profile.mjs';

const LICENSE = 'http://creativecommons.org/licenses/by/4.0/';
const PDF_SHA = 'a'.repeat(64);

function indexRecord() {
  return normalizeArxivIndexRecord({
    paper_id: '2609.00001',
    title: 'Synthetic Provenance Paper',
    categories: 'cs.AI cs.CR',
    primary_category: 'cs.AI',
    license: LICENSE,
    n_versions: 2,
    first_version_date: '2026-09-01T12:00:00Z',
    latest_version_date: '2026-09-10T12:00:00Z',
    arxiv_abs_url: 'https://arxiv.org/abs/2609.00001'
  });
}

function versionRow(overrides = {}) {
  const version = overrides.version ?? 2;
  return {
    paper_id: '2609.00001',
    version,
    version_date: '2026-09-10T12:00:00Z',
    is_latest_version: true,
    has_pdf: true,
    pdf_sha256: PDF_SHA,
    license: LICENSE,
    arxiv_pdf_url: `https://arxiv.org/pdf/2609.00001v${version}`,
    ...overrides
  };
}

function pdfRow(version = 2) {
  return {
    paper_id: '2609.00001',
    version,
    kind: 'pdf',
    source: 'gcs',
    path: `pdf/2609.00001v${version}.pdf`,
    sha256: PDF_SHA
  };
}

function build(version, pdf = pdfRow(version.version)) {
  return buildArxivVersionedPdfManifest({
    index_record: indexRecord(),
    version_row: version,
    pdf_row: pdf,
    retrieved_at: '2026-09-20T12:00:00Z'
  });
}

test('canonical latest-in-snapshot row binds indexed version count and latest date', () => {
  const manifest = build(versionRow());
  assert.equal(manifest.source_version, 'v2');
  assert.equal(manifest.currentness_state, 'unknown');
});

test('latest marker cannot promote an older version number to the indexed latest version', () => {
  assert.throws(
    () => build(versionRow({
      version: 1,
      version_date: '2026-09-01T12:00:00Z',
      arxiv_pdf_url: 'https://arxiv.org/pdf/2609.00001v1'
    }), pdfRow(1)),
    /latest versionRow\.version must equal indexed n_versions/
  );
});

test('latest marker cannot substitute a different date for indexed latest_version_date', () => {
  assert.throws(
    () => build(versionRow({ version_date: '2026-09-09T12:00:00Z' })),
    /latest versionRow\.version_date must equal indexed latest_version_date/
  );
});

test('version dates outside the indexed first/latest interval fail closed before admission', () => {
  assert.throws(
    () => build(versionRow({
      version: 1,
      version_date: '2026-08-31T23:59:59Z',
      is_latest_version: false,
      arxiv_pdf_url: 'https://arxiv.org/pdf/2609.00001v1'
    }), pdfRow(1)),
    /versionRow\.version_date falls outside indexed version interval/
  );

  assert.throws(
    () => build(versionRow({ version_date: '2026-09-11T00:00:00Z' })),
    /versionRow\.version_date falls outside indexed version interval/
  );
});
