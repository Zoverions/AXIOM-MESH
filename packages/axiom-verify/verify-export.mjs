import { digestObject, sha256, VerifyError } from './canonical.mjs';
import { loadPublicKey, keyIdFor, verifyObjectSignature } from './crypto.mjs';
import {
  EVIDENCE_BUNDLE_ARTIFACT,
  EXPORT_CONTINUITY_MODE,
  EXPORT_PACKAGE_FORMAT
} from './schemas.mjs';
import { buildVerificationReport } from './report.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

/**
 * Verify a selective export / evidence-bundle package by digest checks.
 * PASS only when every declared file matches the provided bytes; any file
 * substitution FAIL. Offline — no Gateway/Hypervisor client behavior.
 *
 * @param {object} packageInput
 * @param {object|string} packageInput.manifest - axiom-export.v1 manifest
 * @param {Record<string, string|Buffer>|Map|Array} packageInput.files - name → bytes
 * @param {{ publicKeyPem?: string }} [options]
 */
export function verifyExportPackage(packageInput, options = {}) {
  let input;
  try {
    input = typeof packageInput === 'string'
      ? JSON.parse(packageInput)
      : structuredClone(packageInput);
  } catch (error) {
    if (typeof packageInput === 'string') {
      return failClosed('invalid_json', 'Export package input is not valid JSON', null);
    }
    return failClosed(
      'non_cloneable',
      'Export package input could not be cloned for verification (non-cloneable input)',
      null
    );
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failClosed('invalid_shape', 'Export package input must be a plain object', null);
  }

  const manifest = input.manifest;
  if (manifest === undefined) {
    return failClosed(
      'missing_manifest',
      'Selective export package is missing a manifest',
      EVIDENCE_BUNDLE_ARTIFACT
    );
  }

  let parsedManifest;
  if (typeof manifest === 'string') {
    try {
      parsedManifest = JSON.parse(manifest);
    } catch {
      return failClosed(
        'invalid_manifest_json',
        'Export manifest is not valid JSON',
        EVIDENCE_BUNDLE_ARTIFACT
      );
    }
  } else {
    parsedManifest = manifest;
  }

  if (!parsedManifest || typeof parsedManifest !== 'object' || Array.isArray(parsedManifest)) {
    return failClosed(
      'invalid_manifest_shape',
      'Export manifest must be a plain object',
      EVIDENCE_BUNDLE_ARTIFACT
    );
  }

  if (parsedManifest.format !== EXPORT_PACKAGE_FORMAT) {
    return failClosed(
      'unknown_schema',
      `Unknown export format '${parsedManifest.format ?? 'missing'}'. Verify fails closed for unrecognized export formats in this experimental MVP scaffold.`,
      parsedManifest.format ?? null
    );
  }

  if (
    parsedManifest.schema_versions?.manifest !== 1
    || ![1, 2].includes(parsedManifest.schema_versions?.records)
    || parsedManifest.schema_versions?.evidence !== 1
  ) {
    return failClosed(
      'unsupported_schema_version',
      'Export manifest schema_versions are unsupported by this experimental MVP scaffold',
      EVIDENCE_BUNDLE_ARTIFACT,
      { export_id: parsedManifest.export_id ?? null }
    );
  }

  if (
    parsedManifest.continuity?.mode !== EXPORT_CONTINUITY_MODE
    || !DIGEST.test(parsedManifest.continuity?.evidence_head ?? '')
  ) {
    return failClosed(
      'invalid_continuity',
      'Export continuity proof is missing or invalid (expected signed-transparency-log-head with hex evidence_head)',
      EVIDENCE_BUNDLE_ARTIFACT,
      { export_id: parsedManifest.export_id ?? null }
    );
  }

  if (!Array.isArray(parsedManifest.files) || parsedManifest.files.length < 1) {
    return failClosed(
      'missing_files_manifest',
      'Export manifest must declare at least one file for digest checks',
      EVIDENCE_BUNDLE_ARTIFACT,
      { export_id: parsedManifest.export_id ?? null }
    );
  }

  const provided = normalizeProvidedFiles(input.files);
  if (!provided.ok) {
    return failClosed(provided.code, provided.reason, EVIDENCE_BUNDLE_ARTIFACT, {
      export_id: parsedManifest.export_id ?? null
    });
  }

  for (const file of parsedManifest.files) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name) {
      return failClosed(
        'invalid_file_entry',
        'Export manifest file entry is missing a name',
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
    if (!DIGEST.test(file.sha256 ?? '')) {
      return failClosed(
        'invalid_file_digest',
        `Export manifest file '${file.name}' is missing a 64-character hex sha256`,
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      return failClosed(
        'invalid_file_bytes',
        `Export manifest file '${file.name}' has an invalid byte count`,
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }

    const bytes = provided.files.get(file.name);
    if (bytes === undefined) {
      return failClosed(
        'missing_package_file',
        `Export package is missing declared file '${file.name}' for digest verification`,
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }

    if (bytes.length !== file.bytes) {
      return failClosed(
        'file_substitution',
        `File substitution or truncation detected for '${file.name}': byte count ${bytes.length} does not match manifest ${file.bytes}. Human explanation: the provided package bytes are not the ones digest-bound by the manifest.`,
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null, file_name: file.name }
      );
    }

    const actualDigest = sha256(bytes);
    if (actualDigest !== file.sha256) {
      return failClosed(
        'file_substitution',
        `File substitution detected for '${file.name}': sha256 ${actualDigest} does not match manifest ${file.sha256}. Human explanation: any substituted file must FAIL selective-export digest checks.`,
        EVIDENCE_BUNDLE_ARTIFACT,
        {
          export_id: parsedManifest.export_id ?? null,
          file_name: file.name,
          bundle_digest: actualDigest
        }
      );
    }
  }

  // Extra undeclared files are ignored for MVP digest checks (manifest is authoritative).

  const { publicKeyPem } = options;
  if (publicKeyPem) {
    let publicKey;
    try {
      publicKey = loadPublicKey(publicKeyPem);
    } catch {
      return failClosed(
        'invalid_public_key',
        'Public key material could not be parsed as an SPKI PEM key',
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
    if (!parsedManifest.attestation || typeof parsedManifest.attestation !== 'object') {
      return failClosed(
        'missing_attestation',
        'Export manifest is missing an attestation block required when a public key is supplied',
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
    const expectedKeyId = keyIdFor('grid', publicKey);
    if (parsedManifest.attestation.key_id !== expectedKeyId) {
      return failClosed(
        'signer_mismatch',
        'Export was not signed by the supplied Grid key',
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
    const unsigned = structuredClone(parsedManifest);
    delete unsigned.attestation;
    if (!verifyObjectSignature(unsigned, parsedManifest.attestation, publicKey)) {
      return failClosed(
        'signature_invalid',
        'Export manifest Ed25519 attestation does not verify under the supplied public key',
        EVIDENCE_BUNDLE_ARTIFACT,
        { export_id: parsedManifest.export_id ?? null }
      );
    }
  }

  const primary = parsedManifest.files[0];
  const okResult = {
    ok: true,
    code: 'pass',
    schema: EVIDENCE_BUNDLE_ARTIFACT,
    export_id: parsedManifest.export_id ?? null,
    bundle_digest: primary?.sha256 ?? null,
    file_count: parsedManifest.files.length,
    evidence_head: parsedManifest.continuity.evidence_head,
    reason: null
  };
  return { ...okResult, report: buildVerificationReport(okResult) };
}

function normalizeProvidedFiles(files) {
  if (files === undefined || files === null) {
    return {
      ok: false,
      code: 'missing_package_files',
      reason: 'Export package files map is required for selective-export digest checks'
    };
  }

  const map = new Map();
  if (files instanceof Map) {
    for (const [name, value] of files.entries()) {
      map.set(String(name), toBuffer(value));
    }
  } else if (Array.isArray(files)) {
    for (const entry of files) {
      if (!entry || typeof entry.name !== 'string') {
        return {
          ok: false,
          code: 'invalid_package_files',
          reason: 'Export package files array entries must include a name'
        };
      }
      map.set(entry.name, toBuffer(entry.bytes ?? entry.content ?? entry.data));
    }
  } else if (typeof files === 'object') {
    for (const [name, value] of Object.entries(files)) {
      map.set(name, toBuffer(value));
    }
  } else {
    return {
      ok: false,
      code: 'invalid_package_files',
      reason: 'Export package files must be an object, Map, or array'
    };
  }

  return { ok: true, files: map };
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    // Prefer utf8 for text fixtures; hex digests are compared on raw bytes.
    return Buffer.from(value, 'utf8');
  }
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return Buffer.from(String(value ?? ''), 'utf8');
}

function failClosed(code, reason, schema, extra = {}) {
  const result = {
    ok: false,
    code,
    schema,
    reason,
    export_id: extra.export_id ?? null,
    bundle_digest: extra.bundle_digest ?? null,
    file_name: extra.file_name ?? null
  };
  return { ...result, report: buildVerificationReport(result) };
}

export { VerifyError, digestObject };
