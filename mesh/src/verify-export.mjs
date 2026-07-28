import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';
import { safeTextEqual, verifyObjectSignature } from './lib/identity.mjs';
import { decryptFromRecipient } from './lib/recipient-encryption.mjs';

export function verifyExportBundle({ manifest, bundle, gridPublicKey, recipientPrivateKey }) {
  const parsed = typeof manifest === 'string' ? parseJson(manifest, 'manifest') : structuredClone(manifest);
  if (!parsed || parsed.format !== 'axiom-export.v1') {
    throw new ValidationError('Unsupported export manifest format');
  }
  if (
    parsed.schema_versions?.manifest !== 1
    || ![1, 2].includes(parsed.schema_versions?.records)
    || parsed.schema_versions?.evidence !== 1
  ) {
    throw new ValidationError('Unsupported export schema version');
  }
  if (parsed.schema_versions.records === 2 && parsed.schema_versions.scope !== 2) {
    throw new ValidationError('Record schema version 2 requires scope schema version 2');
  }
  if (!Array.isArray(parsed.files) || parsed.files.length !== 1) {
    throw new ValidationError('Export manifest must describe exactly one bundle file');
  }
  if (
    parsed.continuity?.mode !== 'signed-transparency-log-head'
    || !/^[a-f0-9]{64}$/.test(parsed.continuity?.evidence_head ?? '')
  ) {
    throw new ValidationError('Export continuity proof is invalid');
  }

  const bytes = Buffer.isBuffer(bundle) ? bundle : Buffer.from(String(bundle));
  const file = parsed.files[0];
  if (file.bytes !== bytes.length) throw new ValidationError('Export byte count does not match the manifest');
  if (!safeTextEqual(file.sha256, sha256(bytes))) throw new ValidationError('Export bundle digest mismatch');

  const encrypted = parsed.encryption !== undefined;
  if (encrypted) {
    if (
      parsed.schema_versions.records !== 2
      || file.name !== 'bundle.encrypted.json'
      || file.media_type !== 'application/vnd.axiom.recipient-encrypted+json'
      || parsed.encryption?.plaintext?.name !== 'bundle.jsonl'
      || parsed.encryption?.plaintext?.media_type !== 'application/x-ndjson'
      || parsed.encryption?.context !== `axiom:export:${parsed.export_id}:bundle.jsonl`
      || parsed.encryption?.recipient_key_id !== parsed.scope?.recipient?.key_id
      || parsed.scope?.recipient?.public_key !== undefined
    ) throw new ValidationError('Encrypted export manifest metadata is invalid');
  } else if (file.name !== 'bundle.jsonl' || file.media_type !== 'application/x-ndjson') {
    throw new ValidationError('Export media type is invalid');
  }

  const key = typeof gridPublicKey === 'string' || Buffer.isBuffer(gridPublicKey)
    ? createPublicKey(gridPublicKey)
    : gridPublicKey;
  const unsigned = structuredClone(parsed);
  delete unsigned.attestation;
  const expectedKeyId = `grid:${sha256(key.export({ type: 'spki', format: 'pem' })).slice(0, 16)}`;
  if (!safeTextEqual(parsed.attestation?.key_id ?? '', expectedKeyId)) {
    throw new ValidationError('Export was not signed by the supplied Grid key');
  }
  if (!verifyObjectSignature(unsigned, parsed.attestation, key)) {
    throw new ValidationError('Export manifest signature is invalid');
  }

  const encryptedEnvelope = encrypted
    ? parseJson(bytes.toString('utf8'), 'recipient-encrypted bundle')
    : undefined;
  if (
    encrypted
    && (
      encryptedEnvelope.format !== parsed.encryption.format
      || encryptedEnvelope.algorithm !== parsed.encryption.algorithm
      || encryptedEnvelope.context !== parsed.encryption.context
      || encryptedEnvelope.recipient_key_id !== parsed.encryption.recipient_key_id
    )
  ) {
    throw new ValidationError('Encrypted bundle metadata does not match the signed manifest');
  }
  if (encrypted && !recipientPrivateKey) {
    throw new ValidationError('Recipient private key is required to verify encrypted export records');
  }
  const plaintext = encrypted
    ? decryptFromRecipient(encryptedEnvelope, recipientPrivateKey, parsed.encryption.context)
    : bytes;
  const text = plaintext.toString('utf8');
  if (text && !text.endsWith('\n')) throw new ValidationError('Canonical JSONL bundle must end with a newline');
  const lines = text ? text.slice(0, -1).split('\n') : [];
  for (const [index, line] of lines.entries()) {
    const record = parseJson(line, `record ${index + 1}`);
    if (canonicalJson(record) !== line) {
      throw new ValidationError(`Export record ${index + 1} is not canonical JSON`);
    }
  }
  if (parsed.record_count !== lines.length) throw new ValidationError('Export record count mismatch');

  return {
    valid: true,
    format: parsed.format,
    export_id: parsed.export_id,
    principal: parsed.principal,
    records: lines.length,
    encrypted,
    bundle_sha256: sha256(plaintext),
    stored_bundle_sha256: file.sha256,
    evidence_head: parsed.continuity.evidence_head,
    signer: expectedKeyId
  };
}

function parseJson(value, name) {
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
}

async function main() {
  const [manifestPath, bundlePath, gridPublicKeyPath, recipientPrivateKeyPath] = process.argv.slice(2);
  if (!manifestPath || !bundlePath || !gridPublicKeyPath) {
    throw new Error(
      'Usage: node src/verify-export.mjs <manifest.json> <bundle-file> <grid-public.pem> [recipient-private.pem]'
    );
  }
  const [manifest, bundle, gridPublicKey] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(bundlePath),
    readFile(gridPublicKeyPath, 'utf8')
  ]);
  const recipientPrivateKey = recipientPrivateKeyPath
    ? await readFile(recipientPrivateKeyPath, 'utf8')
    : undefined;
  process.stdout.write(`${JSON.stringify(verifyExportBundle({
    manifest,
    bundle,
    gridPublicKey,
    recipientPrivateKey
  }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
