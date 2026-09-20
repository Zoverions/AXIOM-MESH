import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  researchContractDigest,
  verifyResearchSourceManifest
} from './research-capsule-contracts.mjs';

export const ARXIV_INDEX_RECORD_SCHEMA = 'axiom-arxiv-index-record.v0';
export const ARXIV_COMPLETE_DATASET_ID = 'secemp9/arxiv-complete';
export const ARXIV_COMPLETE_METADATA_SNAPSHOT = '2026-08-30';
export const ARXIV_COMPLETE_FILES_SNAPSHOT = '2026-09-05';

const ARXIV_ID = /^[A-Za-z0-9][A-Za-z0-9.\/-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ARXIV_ABS_URL = /^https?:\/\/arxiv\.org\/abs\/[A-Za-z0-9][A-Za-z0-9.\/-]{0,127}$/;
const ARXIV_PDF_URL = /^https?:\/\/arxiv\.org\/pdf\/[A-Za-z0-9][A-Za-z0-9.\/-]{0,127}$/;

const AUTO_ADMIT_LICENSES = new Set([
  'http://creativecommons.org/publicdomain/zero/1.0/',
  'http://creativecommons.org/licenses/by/3.0/',
  'http://creativecommons.org/licenses/by/4.0/'
]);

const ARXIV_NONEXCLUSIVE_LICENSE = 'http://arxiv.org/licenses/nonexclusive-distrib/1.0/';

const KNOWN_REVIEW_LICENSES = new Set([
  'http://creativecommons.org/licenses/by-sa/4.0/',
  'http://creativecommons.org/licenses/by-nc-nd/4.0/',
  'http://creativecommons.org/licenses/by-nc-sa/4.0/',
  'http://creativecommons.org/licenses/by-nc-sa/3.0/',
  'http://creativecommons.org/licenses/publicdomain/'
]);

const INDEX_FIELDS = Object.freeze([
  'schema',
  'dataset_id',
  'metadata_snapshot',
  'files_snapshot',
  'paper_id',
  'title',
  'categories',
  'primary_category',
  'license',
  'n_versions',
  'first_version_date',
  'latest_version_date',
  'arxiv_abs_url',
  'ingestion_policy',
  'record_digest'
]);

export function classifyArxivLicense(license) {
  if (license === null) {
    return Object.freeze({
      license_class: 'missing',
      metadata_ingest: 'allow',
      owner_local_full_text_ingest: 'deny',
      model_training: 'deny',
      redistribution: 'deny',
      review_required: true,
      reason: 'missing_license_requires_separate_review'
    });
  }

  assertString(license, 'license', { max: 512 });

  if (AUTO_ADMIT_LICENSES.has(license)) {
    return Object.freeze({
      license_class: license.includes('/zero/') ? 'cc0' : 'cc_by',
      metadata_ingest: 'allow',
      owner_local_full_text_ingest: 'allow',
      model_training: 'deny',
      redistribution: 'deny',
      review_required: false,
      reason: 'explicit_owner_local_ingest_allowlist'
    });
  }

  if (license === ARXIV_NONEXCLUSIVE_LICENSE) {
    return Object.freeze({
      license_class: 'arxiv_nonexclusive',
      metadata_ingest: 'allow',
      owner_local_full_text_ingest: 'deny',
      model_training: 'deny',
      redistribution: 'deny',
      review_required: true,
      reason: 'arxiv_nonexclusive_is_not_automatic_downstream_permission'
    });
  }

  if (KNOWN_REVIEW_LICENSES.has(license)) {
    return Object.freeze({
      license_class: 'recognized_review_required',
      metadata_ingest: 'allow',
      owner_local_full_text_ingest: 'deny',
      model_training: 'deny',
      redistribution: 'deny',
      review_required: true,
      reason: 'recognized_license_requires_separate_use_policy_review'
    });
  }

  return Object.freeze({
    license_class: 'unknown',
    metadata_ingest: 'allow',
    owner_local_full_text_ingest: 'deny',
    model_training: 'deny',
    redistribution: 'deny',
    review_required: true,
    reason: 'unknown_license_requires_separate_review'
  });
}

export function normalizeArxivIndexRecord(metadataRow) {
  assertPlainObject(metadataRow, 'metadataRow');

  const paperId = requiredString(metadataRow.paper_id, 'metadataRow.paper_id', 128);
  if (!ARXIV_ID.test(paperId)) {
    throw new ValidationError('metadataRow.paper_id has invalid arXiv identifier syntax');
  }

  const title = requiredString(metadataRow.title, 'metadataRow.title', 2048);
  const categories = normalizeCategories(metadataRow.categories);
  const primaryCategory = requiredString(metadataRow.primary_category, 'metadataRow.primary_category', 128);
  if (!categories.includes(primaryCategory)) {
    throw new ValidationError('metadataRow.primary_category must be present in metadataRow.categories');
  }

  const license = normalizeNullableLicense(metadataRow.license);
  const nVersions = assertInteger(metadataRow.n_versions, 'metadataRow.n_versions', 1, 1000);
  const firstVersionDate = canonicalTimestamp(metadataRow.first_version_date, 'metadataRow.first_version_date');
  const latestVersionDate = canonicalTimestamp(metadataRow.latest_version_date, 'metadataRow.latest_version_date');
  if (new Date(latestVersionDate).getTime() < new Date(firstVersionDate).getTime()) {
    throw new ValidationError('metadataRow.latest_version_date cannot precede first_version_date');
  }

  const absUrl = requiredString(metadataRow.arxiv_abs_url, 'metadataRow.arxiv_abs_url', 512);
  if (!ARXIV_ABS_URL.test(absUrl)) {
    throw new ValidationError('metadataRow.arxiv_abs_url must be an arxiv.org abstract URL');
  }
  const urlId = absUrl.slice(absUrl.indexOf('/abs/') + 5);
  if (urlId !== paperId) {
    throw new ValidationError('metadataRow.arxiv_abs_url paper identifier mismatch');
  }

  const base = {
    schema: ARXIV_INDEX_RECORD_SCHEMA,
    dataset_id: ARXIV_COMPLETE_DATASET_ID,
    metadata_snapshot: ARXIV_COMPLETE_METADATA_SNAPSHOT,
    files_snapshot: ARXIV_COMPLETE_FILES_SNAPSHOT,
    paper_id: paperId,
    title,
    categories,
    primary_category: primaryCategory,
    license,
    n_versions: nVersions,
    first_version_date: firstVersionDate,
    latest_version_date: latestVersionDate,
    arxiv_abs_url: absUrl,
    ingestion_policy: classifyArxivLicense(license)
  };

  return verifyArxivIndexRecord({
    ...base,
    record_digest: indexRecordDigest(base)
  });
}

export function verifyArxivIndexRecord(value) {
  assertPlainObject(value, 'ArxivIndexRecord');
  assertExactFields(value, INDEX_FIELDS, 'ArxivIndexRecord');

  if (value.schema !== ARXIV_INDEX_RECORD_SCHEMA) {
    throw new ValidationError(`ArxivIndexRecord.schema must equal ${ARXIV_INDEX_RECORD_SCHEMA}`);
  }
  if (value.dataset_id !== ARXIV_COMPLETE_DATASET_ID) {
    throw new ValidationError(`ArxivIndexRecord.dataset_id must equal ${ARXIV_COMPLETE_DATASET_ID}`);
  }
  if (value.metadata_snapshot !== ARXIV_COMPLETE_METADATA_SNAPSHOT) {
    throw new ValidationError('ArxivIndexRecord.metadata_snapshot mismatch');
  }
  if (value.files_snapshot !== ARXIV_COMPLETE_FILES_SNAPSHOT) {
    throw new ValidationError('ArxivIndexRecord.files_snapshot mismatch');
  }

  const normalized = normalizeIndexRecordForVerification(value);
  const expectedPolicy = classifyArxivLicense(normalized.license);
  if (JSON.stringify(value.ingestion_policy) !== JSON.stringify(expectedPolicy)) {
    throw new ValidationError('ArxivIndexRecord.ingestion_policy does not match license classification');
  }

  const expectedDigest = indexRecordDigest(value);
  if (value.record_digest !== expectedDigest) {
    throw new ValidationError('ArxivIndexRecord.record_digest mismatch');
  }

  return value;
}

export function buildArxivPaperTextManifest({
  index_record: indexRecord,
  paper_text_row: paperTextRow,
  retrieved_at: retrievedAt
}) {
  const index = verifyArxivIndexRecord(indexRecord);
  assertAutoAdmitted(index);
  const text = verifyPaperTextBinding(index, paperTextRow);
  const retrieved = canonicalTimestamp(retrievedAt, 'retrieved_at');

  const base = {
    schema: 'axiom-research-source-manifest.v0',
    manifest_id: `research:arxiv:${index.paper_id}:paper-text:${ARXIV_COMPLETE_FILES_SNAPSHOT}`,
    source_kind: 'arxiv_paper_text_snapshot',
    canonical_identifier: `arxiv:${index.paper_id}:paper-text:${ARXIV_COMPLETE_FILES_SNAPSHOT}`,
    source_locator: index.arxiv_abs_url,
    title: index.title,
    published_at: index.first_version_date,
    retrieved_at: retrieved,
    manuscript_digest: `sha256:${text.text_sha256}`,
    source_version: `unversioned-source-snapshot:${ARXIV_COMPLETE_FILES_SNAPSHOT}`,
    supplement_refs: [],
    data_refs: [
      `hf:${ARXIV_COMPLETE_DATASET_ID}:paper_text:resolution=${text.resolution}`,
      'provenance:paper_text:source_version_not_proven'
    ],
    code_refs: [],
    code_revision: null,
    license_refs: [index.license],
    authorship_refs: [`${index.arxiv_abs_url}#authors`],
    correction_refs: [],
    currentness_state: 'unknown'
  };

  return verifyResearchSourceManifest({
    ...base,
    manifest_digest: researchContractDigest(base, 'manifest_digest')
  });
}

export function buildArxivVersionedPdfManifest({
  index_record: indexRecord,
  version_row: versionRow,
  pdf_row: pdfRow,
  retrieved_at: retrievedAt
}) {
  const index = verifyArxivIndexRecord(indexRecord);
  assertAutoAdmitted(index);
  const version = verifyVersionBinding(index, versionRow);
  const pdf = verifyPdfBinding(index, version, pdfRow);
  const retrieved = canonicalTimestamp(retrievedAt, 'retrieved_at');

  const base = {
    schema: 'axiom-research-source-manifest.v0',
    manifest_id: `research:arxiv:${index.paper_id}:v${version.version}:pdf`,
    source_kind: 'arxiv_pdf_snapshot',
    canonical_identifier: `arxiv:${index.paper_id}:v${version.version}:pdf`,
    source_locator: version.arxiv_pdf_url,
    title: index.title,
    published_at: version.version_date,
    retrieved_at: retrieved,
    manuscript_digest: `sha256:${pdf.sha256}`,
    source_version: `v${version.version}`,
    supplement_refs: [],
    data_refs: [
      `hf:${ARXIV_COMPLETE_DATASET_ID}:pdf:path=${pdf.path}`,
      `hf:${ARXIV_COMPLETE_DATASET_ID}:pdf:source=${pdf.source}`
    ],
    code_refs: [],
    code_revision: null,
    license_refs: [index.license],
    authorship_refs: [`${index.arxiv_abs_url}#authors`],
    correction_refs: [],
    currentness_state: version.is_latest_version ? 'unknown' : 'stale_revision'
  };

  return verifyResearchSourceManifest({
    ...base,
    manifest_digest: researchContractDigest(base, 'manifest_digest')
  });
}

function verifyPaperTextBinding(index, paperTextRow) {
  assertPlainObject(paperTextRow, 'paperTextRow');
  assertSamePaper(index.paper_id, paperTextRow.paper_id, 'paperTextRow.paper_id');

  const textSha256 = requiredString(paperTextRow.text_sha256, 'paperTextRow.text_sha256', 64);
  assertSha256Hex(textSha256, 'paperTextRow.text_sha256');

  const textTitle = requiredString(paperTextRow.title, 'paperTextRow.title', 2048);
  if (normalizeWhitespace(textTitle) !== normalizeWhitespace(index.title)) {
    throw new ValidationError('paperTextRow.title does not match indexed title');
  }

  const primaryCategory = requiredString(paperTextRow.primary_category, 'paperTextRow.primary_category', 128);
  if (primaryCategory !== index.primary_category) {
    throw new ValidationError('paperTextRow.primary_category does not match indexed primary category');
  }

  const textLicense = normalizeNullableLicense(paperTextRow.license);
  if (textLicense !== index.license) {
    throw new ValidationError('arXiv paper_text license binding mismatch');
  }

  const resolution = requiredString(paperTextRow.resolution, 'paperTextRow.resolution', 32);
  if (!new Set(['single', 'resolved', 'fallback']).has(resolution)) {
    throw new ValidationError('paperTextRow.resolution is not recognized');
  }

  return { text_sha256: textSha256, resolution };
}

function verifyVersionBinding(index, versionRow) {
  assertPlainObject(versionRow, 'versionRow');
  assertSamePaper(index.paper_id, versionRow.paper_id, 'versionRow.paper_id');

  const version = assertInteger(versionRow.version, 'versionRow.version', 1, 1000);
  const versionDate = canonicalTimestamp(versionRow.version_date, 'versionRow.version_date');
  const isLatestVersion = assertBoolean(versionRow.is_latest_version, 'versionRow.is_latest_version');
  const hasPdf = assertBoolean(versionRow.has_pdf, 'versionRow.has_pdf');
  if (!hasPdf) {
    throw new ValidationError('versionRow.has_pdf must be true for a versioned PDF manifest');
  }

  const pdfSha256 = requiredString(versionRow.pdf_sha256, 'versionRow.pdf_sha256', 64);
  assertSha256Hex(pdfSha256, 'versionRow.pdf_sha256');

  const versionLicense = normalizeNullableLicense(versionRow.license);
  if (versionLicense !== index.license) {
    throw new ValidationError('arXiv version license binding mismatch');
  }

  const pdfUrl = requiredString(versionRow.arxiv_pdf_url, 'versionRow.arxiv_pdf_url', 512);
  if (!ARXIV_PDF_URL.test(pdfUrl)) {
    throw new ValidationError('versionRow.arxiv_pdf_url must be an arxiv.org PDF URL');
  }

  return {
    version,
    version_date: versionDate,
    is_latest_version: isLatestVersion,
    pdf_sha256: pdfSha256,
    arxiv_pdf_url: pdfUrl
  };
}

function verifyPdfBinding(index, version, pdfRow) {
  assertPlainObject(pdfRow, 'pdfRow');
  assertSamePaper(index.paper_id, pdfRow.paper_id, 'pdfRow.paper_id');

  const pdfVersion = assertInteger(pdfRow.version, 'pdfRow.version', 1, 1000);
  if (pdfVersion !== version.version) {
    throw new ValidationError('pdfRow.version does not match versionRow.version');
  }

  if (pdfRow.kind !== 'pdf') {
    throw new ValidationError('pdfRow.kind must equal pdf');
  }

  const sha256 = requiredString(pdfRow.sha256, 'pdfRow.sha256', 64);
  assertSha256Hex(sha256, 'pdfRow.sha256');
  if (sha256 !== version.pdf_sha256) {
    throw new ValidationError('pdfRow.sha256 does not match versionRow.pdf_sha256');
  }

  const source = requiredString(pdfRow.source, 'pdfRow.source', 64);
  if (!new Set(['gcs', 'web_scrape']).has(source)) {
    throw new ValidationError('pdfRow.source is not recognized');
  }

  const path = requiredString(pdfRow.path, 'pdfRow.path', 2048);
  return { sha256, source, path };
}

function assertAutoAdmitted(index) {
  if (index.ingestion_policy.owner_local_full_text_ingest !== 'allow') {
    throw new ValidationError('arXiv full-text ingestion is not auto-admitted for this license');
  }
}

function normalizeIndexRecordForVerification(value) {
  const paperId = requiredString(value.paper_id, 'ArxivIndexRecord.paper_id', 128);
  if (!ARXIV_ID.test(paperId)) {
    throw new ValidationError('ArxivIndexRecord.paper_id has invalid arXiv identifier syntax');
  }

  const title = requiredString(value.title, 'ArxivIndexRecord.title', 2048);
  if (!Array.isArray(value.categories) || value.categories.length < 1 || value.categories.length > 64) {
    throw new ValidationError('ArxivIndexRecord.categories must contain 1-64 items');
  }
  const categories = value.categories.map((item, index) =>
    requiredString(item, `ArxivIndexRecord.categories[${index}]`, 128)
  );
  if (new Set(categories).size !== categories.length) {
    throw new ValidationError('ArxivIndexRecord.categories must be unique');
  }

  const primaryCategory = requiredString(value.primary_category, 'ArxivIndexRecord.primary_category', 128);
  if (!categories.includes(primaryCategory)) {
    throw new ValidationError('ArxivIndexRecord.primary_category must be present in categories');
  }

  const license = normalizeNullableLicense(value.license);
  assertInteger(value.n_versions, 'ArxivIndexRecord.n_versions', 1, 1000);
  const firstVersionDate = canonicalTimestamp(value.first_version_date, 'ArxivIndexRecord.first_version_date');
  const latestVersionDate = canonicalTimestamp(value.latest_version_date, 'ArxivIndexRecord.latest_version_date');
  if (new Date(latestVersionDate).getTime() < new Date(firstVersionDate).getTime()) {
    throw new ValidationError('ArxivIndexRecord latest version cannot precede first version');
  }

  const absUrl = requiredString(value.arxiv_abs_url, 'ArxivIndexRecord.arxiv_abs_url', 512);
  if (!ARXIV_ABS_URL.test(absUrl) || absUrl.slice(absUrl.indexOf('/abs/') + 5) !== paperId) {
    throw new ValidationError('ArxivIndexRecord.arxiv_abs_url mismatch');
  }

  requiredString(value.record_digest, 'ArxivIndexRecord.record_digest', 71);
  if (!/^sha256:[0-9a-f]{64}$/.test(value.record_digest)) {
    throw new ValidationError('ArxivIndexRecord.record_digest must be a SHA-256 digest');
  }
  assertPlainObject(value.ingestion_policy, 'ArxivIndexRecord.ingestion_policy');

  return { license };
}

function indexRecordDigest(value) {
  const copy = { ...value };
  delete copy.record_digest;
  return `sha256:${digestObject(copy)}`;
}

function normalizeCategories(value) {
  assertString(value, 'metadataRow.categories', { max: 4096 });
  const categories = value.trim().split(/\s+/).filter(Boolean);
  if (categories.length < 1 || categories.length > 64) {
    throw new ValidationError('metadataRow.categories must contain 1-64 category tokens');
  }
  if (new Set(categories).size !== categories.length) {
    throw new ValidationError('metadataRow.categories must not contain duplicate tokens');
  }
  for (const [index, category] of categories.entries()) {
    requiredString(category, `metadataRow.categories[${index}]`, 128);
  }
  return categories;
}

function normalizeNullableLicense(value) {
  if (value === null) return null;
  return requiredString(value, 'license', 512);
}

function assertSamePaper(expected, actual, name) {
  const paperId = requiredString(actual, name, 128);
  if (paperId !== expected) {
    throw new ValidationError(`${name} does not match indexed paper_id`);
  }
}

function requiredString(value, name, max) {
  assertString(value, name, { max });
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${name} cannot be blank`);
  }
  return normalized;
}

function canonicalTimestamp(value, name) {
  assertString(value, name, { max: 128 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${name} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

function assertSha256Hex(value, name) {
  if (!SHA256_HEX.test(value)) {
    throw new ValidationError(`${name} must be a lowercase SHA-256 hex digest`);
  }
}

function assertInteger(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}

function assertExactFields(object, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unsupported field: ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(object, key)) {
      throw new ValidationError(`${name} is missing field: ${key}`);
    }
  }
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}
