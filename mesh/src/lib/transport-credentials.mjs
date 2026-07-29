import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  X509Certificate
} from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { checkServerIdentity } from 'node:tls';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';

const TRANSPORT_SCHEMA = 'axiom-transport-credentials.v1';
const TRANSPORT_SERVICES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox',
  'supervisor'
]);
const SERVICE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const CA_COMMON_NAME = 'AXIOM-MESH Internal Transport CA';
const DNS_SUFFIX = '.service.axiom-mesh.internal';
const SPIFFE_PREFIX = 'spiffe://axiom-mesh/service/';
const ED25519_OID = '1.3.101.112';

export async function provisionTransportCredentials({
  secretDir,
  now = new Date(),
  caValidityDays = 3_650,
  leafValidityDays = 30
}) {
  const root = transportRoot(secretDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root);
  if (entries.length === 0) {
    await createCredentialSet({
      root,
      now: normalizeDate(now),
      caValidityDays,
      leafValidityDays
    });
  }
  return validateTransportCredentials({
    secretDir,
    now,
    minimumRemainingMs: 24 * 60 * 60 * 1_000
  });
}

export async function validateTransportCredentials({
  secretDir,
  now = new Date(),
  minimumRemainingMs = 0,
  rootOverride
}) {
  const root = rootOverride
    ? resolveRequiredPath(rootOverride, 'transport credential directory')
    : transportRoot(secretDir);
  const manifestPath = join(root, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new ValidationError('Transport credential manifest is missing or invalid');
  }
  validateManifestShape(manifest);
  const caKeyPath = join(root, 'ca-private.pem');
  const caCertPath = join(root, 'ca-cert.pem');
  const caKeyPem = await readFile(caKeyPath, 'utf8');
  const caCertPem = await readFile(caCertPath, 'utf8');
  const caPrivateKey = parsePrivateEd25519(caKeyPem, 'Transport CA');
  const caCertificate = parseCertificate(caCertPem, 'Transport CA');
  if (
    caCertificate.ca !== true
    || caCertificate.subject !== `CN=${CA_COMMON_NAME}`
    || !caCertificate.verify(caCertificate.publicKey)
    || !publicKeysEqual(createPublicKey(caPrivateKey), caCertificate.publicKey)
  ) {
    throw new ValidationError('Transport CA certificate or private key is invalid');
  }
  assertCertificateWindow(
    caCertificate,
    normalizeDate(now),
    minimumRemainingMs,
    'Transport CA'
  );
  const caFingerprint = normalizeFingerprint(caCertificate.fingerprint256);
  if (manifest.ca.fingerprint_sha256 !== caFingerprint) {
    throw new ValidationError('Transport CA fingerprint does not match the manifest');
  }

  const services = {};
  const peers = {};
  for (const service of TRANSPORT_SERVICES) {
    const keyFile = join(root, 'services', `${service}.key.pem`);
    const certFile = join(root, 'services', `${service}.cert.pem`);
    const privateKey = parsePrivateEd25519(
      await readFile(keyFile, 'utf8'),
      `${service} transport`
    );
    const certificate = parseCertificate(
      await readFile(certFile, 'utf8'),
      `${service} transport`
    );
    validateLeafCertificate({
      service,
      certificate,
      privateKey,
      caCertificate,
      now: normalizeDate(now),
      minimumRemainingMs
    });
    const fingerprint = normalizeFingerprint(certificate.fingerprint256);
    if (
      manifest.services[service]?.fingerprint_sha256 !== fingerprint
      || manifest.services[service]?.spiffe_id !== spiffeId(service)
    ) {
      throw new ValidationError(
        `${service} transport certificate does not match the manifest`
      );
    }
    peers[service] = fingerprint;
    services[service] = {
      service,
      spiffe_id: spiffeId(service),
      key_file: keyFile,
      certificate_file: certFile,
      fingerprint_sha256: fingerprint,
      valid_from: new Date(certificate.validFrom).toISOString(),
      valid_to: new Date(certificate.validTo).toISOString()
    };
  }
  if (canonicalJson(manifest.active_peers) !== canonicalJson(peers)) {
    throw new ValidationError('Transport active-peer registry is invalid');
  }
  await Promise.all([
    assertPrivatePath(root, 'Transport credential directory'),
    assertPrivatePath(caKeyPath, 'Transport CA private key'),
    ...TRANSPORT_SERVICES.map(service => assertPrivatePath(
      services[service].key_file,
      `${service} transport private key`
    ))
  ]);
  return {
    valid: true,
    schema: TRANSPORT_SCHEMA,
    transport_dir: root,
    manifest_file: manifestPath,
    ca_certificate_file: caCertPath,
    ca_private_key_file: caKeyPath,
    ca_fingerprint_sha256: caFingerprint,
    generation: manifest.generation,
    services
  };
}

export async function rotateTransportCredentials({
  secretDir,
  now = new Date(),
  leafValidityDays = 30
}) {
  const current = await validateTransportCredentials({ secretDir, now });
  const root = current.transport_dir;
  const parent = dirname(root);
  const staged = join(parent, `.transport-next-${process.pid}-${Date.now()}`);
  const previous = join(parent, 'transport-previous');
  try {
    await stat(previous);
    throw new ValidationError(
      'Transport rotation requires the previous credential set to be archived first'
    );
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(staged, { mode: 0o700 });
  let currentMoved = false;
  try {
    const caPrivatePem = await readFile(current.ca_private_key_file, 'utf8');
    const caCertPem = await readFile(current.ca_certificate_file, 'utf8');
    await atomicWrite(join(staged, 'ca-private.pem'), caPrivatePem, 0o600);
    await atomicWrite(join(staged, 'ca-cert.pem'), caCertPem, 0o644);
    const caPrivateKey = parsePrivateEd25519(caPrivatePem, 'Transport CA');
    const caCertificate = parseCertificate(caCertPem, 'Transport CA');
    await createLeafSet({
      root: staged,
      caPrivateKey,
      caCertificate,
      now: normalizeDate(now),
      leafValidityDays,
      generation: current.generation + 1
    });
    await validateTransportCredentialsAtRoot({
      root: staged,
      now,
      minimumRemainingMs: 24 * 60 * 60 * 1_000
    });
    await rename(root, previous);
    currentMoved = true;
    await rename(staged, root);
    currentMoved = false;
  } catch (error) {
    if (currentMoved) {
      try {
        await rename(previous, root);
      } catch {
        throw new ValidationError(
          'Transport rotation failed and the previous directory could not be restored'
        );
      }
    }
    await rm(staged, { recursive: true, force: true });
    throw error;
  }
  const rotated = await validateTransportCredentials({ secretDir, now });
  if (rotated.generation !== current.generation + 1) {
    throw new ValidationError('Transport rotation generation did not advance');
  }
  for (const service of TRANSPORT_SERVICES) {
    if (
      rotated.services[service].fingerprint_sha256
      === current.services[service].fingerprint_sha256
    ) {
      throw new ValidationError(`${service} transport certificate did not rotate`);
    }
  }
  return {
    schema: 'axiom-transport-rotation-result.v1',
    status: 'rotated',
    generation: {
      before: current.generation,
      after: rotated.generation
    },
    ca_fingerprint_sha256: rotated.ca_fingerprint_sha256,
    services: Object.fromEntries(TRANSPORT_SERVICES.map(service => [
      service,
      {
        before_fingerprint_sha256: current.services[service].fingerprint_sha256,
        after_fingerprint_sha256: rotated.services[service].fingerprint_sha256,
        valid_to: rotated.services[service].valid_to
      }
    ]))
  };
}

export async function rollbackTransportCredentials({
  secretDir,
  now = new Date()
}) {
  const root = transportRoot(secretDir);
  const parent = dirname(root);
  const previous = join(parent, 'transport-previous');
  const forward = join(parent, 'transport-forward');
  const current = await validateTransportCredentials({ secretDir, now });
  const rollback = await validateTransportCredentials({
    secretDir,
    now,
    rootOverride: previous
  });
  try {
    await stat(forward);
    throw new ValidationError(
      'Transport rollback requires the forward credential archive to be absent'
    );
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  let currentMoved = false;
  try {
    await rename(root, forward);
    currentMoved = true;
    await rename(previous, root);
    currentMoved = false;
  } catch (error) {
    if (currentMoved) {
      try {
        await rename(forward, root);
      } catch {
        throw new ValidationError(
          'Transport rollback failed and the active directory could not be restored'
        );
      }
    }
    throw error;
  }
  const restored = await validateTransportCredentials({ secretDir, now });
  if (restored.generation !== rollback.generation) {
    throw new ValidationError('Transport rollback restored the wrong generation');
  }
  return {
    schema: 'axiom-transport-rollback-result.v1',
    status: 'rolled_back',
    generation: {
      before: current.generation,
      after: restored.generation
    },
    ca_fingerprint_sha256: restored.ca_fingerprint_sha256,
    services: Object.fromEntries(TRANSPORT_SERVICES.map(service => [
      service,
      {
        retired_fingerprint_sha256: current.services[service].fingerprint_sha256,
        restored_fingerprint_sha256: restored.services[service].fingerprint_sha256,
        valid_to: restored.services[service].valid_to
      }
    ]))
  };
}

export async function loadTransportRuntime({
  transportDir,
  service,
  now = new Date()
}) {
  if (!TRANSPORT_SERVICES.includes(service)) {
    throw new ValidationError('Transport runtime service is invalid');
  }
  const root = resolveRequiredPath(transportDir, 'transport directory');
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  validateManifestShape(manifest);
  const ca = await readFile(join(root, 'ca-cert.pem'), 'utf8');
  const cert = await readFile(
    join(root, 'services', `${service}.cert.pem`),
    'utf8'
  );
  const key = await readFile(
    join(root, 'services', `${service}.key.pem`),
    'utf8'
  );
  const certificate = parseCertificate(cert, `${service} transport`);
  const caCertificate = parseCertificate(ca, 'Transport CA');
  validateLeafCertificate({
    service,
    certificate,
    privateKey: parsePrivateEd25519(key, `${service} transport`),
    caCertificate,
    now: normalizeDate(now),
    minimumRemainingMs: 0
  });
  if (
    normalizeFingerprint(certificate.fingerprint256)
    !== manifest.active_peers[service]
  ) {
    throw new ValidationError(`${service} transport certificate is not active`);
  }
  return Object.freeze({
    service,
    spiffeId: spiffeId(service),
    ca,
    cert,
    key,
    peers: Object.freeze({ ...manifest.active_peers }),
    fingerprint: manifest.active_peers[service],
    generation: manifest.generation
  });
}

export function assertTransportPeer(socket, expectedService, peers) {
  if (!TRANSPORT_SERVICES.includes(expectedService)) {
    throw new ValidationError('Expected transport peer is invalid');
  }
  if (!socket?.authorized) {
    throw new ValidationError('Mutually authenticated transport is required');
  }
  const peer = socket.getPeerCertificate?.();
  const fingerprint = normalizeFingerprint(peer?.fingerprint256 ?? '');
  const expectedFingerprint = peers?.[expectedService];
  if (
    !expectedFingerprint
    || fingerprint !== expectedFingerprint
    || peer?.subject?.CN !== serviceDnsName(expectedService)
    || !String(peer?.subjectaltname ?? '').includes(`URI:${spiffeId(expectedService)}`)
  ) {
    throw new ValidationError('Transport peer identity does not match the signed caller');
  }
  return {
    service: expectedService,
    spiffe_id: spiffeId(expectedService),
    fingerprint_sha256: fingerprint
  };
}

export function identifyActiveTransportPeer(socket, peers, allowedServices) {
  if (
    !Array.isArray(allowedServices)
    || !allowedServices.length
    || allowedServices.some(service => !TRANSPORT_SERVICES.includes(service))
  ) {
    throw new ValidationError('Allowed transport peers are invalid');
  }
  const peer = socket?.getPeerCertificate?.();
  const commonName = peer?.subject?.CN;
  const service = typeof commonName === 'string' && commonName.endsWith(DNS_SUFFIX)
    ? commonName.slice(0, -DNS_SUFFIX.length)
    : null;
  if (!service || !allowedServices.includes(service)) {
    throw new ValidationError('Transport peer is not allowed for this service');
  }
  return assertTransportPeer(socket, service, peers);
}

export function transportServerOptions(runtime) {
  if (
    !runtime
    || !TRANSPORT_SERVICES.includes(runtime.service)
    || !runtime.ca
    || !runtime.cert
    || !runtime.key
  ) {
    throw new ValidationError('Transport server credentials are invalid');
  }
  return {
    key: runtime.key,
    cert: runtime.cert,
    ca: runtime.ca,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3'
  };
}

export function verifyTransportServerIdentity(runtime, expectedService, peer) {
  if (
    !runtime
    || !TRANSPORT_SERVICES.includes(expectedService)
    || !peer
  ) {
    return new Error('Transport server identity is invalid');
  }
  const hostname = serviceDnsName(expectedService);
  const standardError = checkServerIdentity(hostname, peer);
  if (standardError) return standardError;
  const fingerprint = normalizeFingerprint(peer.fingerprint256 ?? '');
  if (
    fingerprint !== runtime.peers[expectedService]
    || peer.subject?.CN !== hostname
    || !String(peer.subjectaltname ?? '').includes(
      `URI:${spiffeId(expectedService)}`
    )
  ) {
    return new Error('Transport server certificate is not the active peer identity');
  }
  return undefined;
}

export function serviceDnsName(service) {
  if (!SERVICE_PATTERN.test(service)) {
    throw new ValidationError('Transport service name is invalid');
  }
  return `${service}${DNS_SUFFIX}`;
}

export function spiffeId(service) {
  if (!SERVICE_PATTERN.test(service)) {
    throw new ValidationError('Transport service name is invalid');
  }
  return `${SPIFFE_PREFIX}${service}`;
}

async function createCredentialSet({
  root,
  now,
  caValidityDays,
  leafValidityDays
}) {
  const pair = generateKeyPairSync('ed25519');
  const caPrivatePem = pair.privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  });
  const caCertPem = issueCertificate({
    subjectPublicKey: pair.publicKey,
    issuerPrivateKey: pair.privateKey,
    issuerCommonName: CA_COMMON_NAME,
    subjectCommonName: CA_COMMON_NAME,
    notBefore: new Date(now.getTime() - 5 * 60 * 1_000),
    notAfter: addDays(now, caValidityDays),
    isCa: true
  });
  await atomicWrite(join(root, 'ca-private.pem'), caPrivatePem, 0o600);
  await atomicWrite(join(root, 'ca-cert.pem'), caCertPem, 0o644);
  await createLeafSet({
    root,
    caPrivateKey: pair.privateKey,
    caCertificate: new X509Certificate(caCertPem),
    now,
    leafValidityDays,
    generation: 1
  });
}

async function createLeafSet({
  root,
  caPrivateKey,
  caCertificate,
  now,
  leafValidityDays,
  generation
}) {
  const services = {};
  const activePeers = {};
  for (const service of TRANSPORT_SERVICES) {
    const pair = generateKeyPairSync('ed25519');
    const privatePem = pair.privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    });
    const certPem = issueCertificate({
      subjectPublicKey: pair.publicKey,
      issuerPrivateKey: caPrivateKey,
      issuerCommonName: CA_COMMON_NAME,
      subjectCommonName: serviceDnsName(service),
      notBefore: new Date(now.getTime() - 5 * 60 * 1_000),
      notAfter: addDays(now, leafValidityDays),
      isCa: false,
      dnsName: serviceDnsName(service),
      uriName: spiffeId(service)
    });
    const certificate = new X509Certificate(certPem);
    const fingerprint = normalizeFingerprint(certificate.fingerprint256);
    await atomicWrite(
      join(root, 'services', `${service}.key.pem`),
      privatePem,
      0o600
    );
    await atomicWrite(
      join(root, 'services', `${service}.cert.pem`),
      certPem,
      0o644
    );
    activePeers[service] = fingerprint;
    services[service] = {
      spiffe_id: spiffeId(service),
      fingerprint_sha256: fingerprint,
      valid_from: new Date(certificate.validFrom).toISOString(),
      valid_to: new Date(certificate.validTo).toISOString()
    };
  }
  const manifest = {
    schema: TRANSPORT_SCHEMA,
    generation,
    ca: {
      common_name: CA_COMMON_NAME,
      fingerprint_sha256: normalizeFingerprint(caCertificate.fingerprint256),
      valid_from: new Date(caCertificate.validFrom).toISOString(),
      valid_to: new Date(caCertificate.validTo).toISOString()
    },
    services,
    active_peers: activePeers
  };
  await atomicWrite(
    join(root, 'manifest.json'),
    `${canonicalJson(manifest)}\n`,
    0o600
  );
}

async function validateTransportCredentialsAtRoot({
  root,
  now,
  minimumRemainingMs
}) {
  return validateTransportCredentials({
    secretDir: dirname(root),
    now,
    minimumRemainingMs,
    rootOverride: root
  });
}

function validateLeafCertificate({
  service,
  certificate,
  privateKey,
  caCertificate,
  now,
  minimumRemainingMs
}) {
  if (
    certificate.ca
    || certificate.subject !== `CN=${serviceDnsName(service)}`
    || certificate.issuer !== `CN=${CA_COMMON_NAME}`
    || !certificate.checkIssued(caCertificate)
    || !certificate.verify(caCertificate.publicKey)
    || !publicKeysEqual(createPublicKey(privateKey), certificate.publicKey)
    || !String(certificate.subjectAltName).includes(`DNS:${serviceDnsName(service)}`)
    || !String(certificate.subjectAltName).includes(`URI:${spiffeId(service)}`)
  ) {
    throw new ValidationError(`${service} transport certificate is invalid`);
  }
  assertCertificateWindow(
    certificate,
    now,
    minimumRemainingMs,
    `${service} transport`
  );
}

function validateManifestShape(manifest) {
  if (
    !manifest
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.schema !== TRANSPORT_SCHEMA
    || !Number.isSafeInteger(manifest.generation)
    || manifest.generation < 1
    || !manifest.ca
    || !manifest.services
    || !manifest.active_peers
    || canonicalJson(Object.keys(manifest.services).sort())
      !== canonicalJson(TRANSPORT_SERVICES)
    || canonicalJson(Object.keys(manifest.active_peers).sort())
      !== canonicalJson(TRANSPORT_SERVICES)
  ) {
    throw new ValidationError('Transport credential manifest shape is invalid');
  }
}

function issueCertificate({
  subjectPublicKey,
  issuerPrivateKey,
  issuerCommonName,
  subjectCommonName,
  notBefore,
  notAfter,
  isCa,
  dnsName,
  uriName
}) {
  const algorithm = sequence(oid(ED25519_OID));
  const extensions = isCa
    ? [
        extension('2.5.29.19', true, sequence(boolean(true))),
        extension('2.5.29.15', true, bitString(Buffer.from([0x06]), 1))
      ]
    : [
        extension('2.5.29.19', true, sequence()),
        extension('2.5.29.15', true, bitString(Buffer.from([0x80]), 7)),
        extension(
          '2.5.29.37',
          false,
          sequence(
            oid('1.3.6.1.5.5.7.3.1'),
            oid('1.3.6.1.5.5.7.3.2')
          )
        ),
        extension(
          '2.5.29.17',
          false,
          sequence(
            tagged(0x82, Buffer.from(dnsName, 'ascii')),
            tagged(0x86, Buffer.from(uriName, 'ascii'))
          )
        )
      ];
  const tbs = sequence(
    tagged(0xa0, integer(Buffer.from([2]))),
    integer(randomSerial()),
    algorithm,
    distinguishedName(issuerCommonName),
    sequence(timeValue(notBefore), timeValue(notAfter)),
    distinguishedName(subjectCommonName),
    subjectPublicKey.export({ type: 'spki', format: 'der' }),
    tagged(0xa3, sequence(...extensions))
  );
  const signature = sign(null, tbs, issuerPrivateKey);
  return pem('CERTIFICATE', sequence(
    tbs,
    algorithm,
    bitString(signature, 0)
  ));
}

function extension(identifier, critical, value) {
  return sequence(
    oid(identifier),
    ...(critical ? [boolean(true)] : []),
    octetString(value)
  );
}

function distinguishedName(commonName) {
  return sequence(set(sequence(oid('2.5.4.3'), utf8String(commonName))));
}

function timeValue(value) {
  const date = normalizeDate(value);
  const year = date.getUTCFullYear();
  if (year >= 2050) {
    return tagged(0x18, Buffer.from(
      `${String(year).padStart(4, '0')}${dateParts(date)}Z`,
      'ascii'
    ));
  }
  return tagged(0x17, Buffer.from(
    `${String(year % 100).padStart(2, '0')}${dateParts(date)}Z`,
    'ascii'
  ));
}

function dateParts(date) {
  return [
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  ].map(value => String(value).padStart(2, '0')).join('');
}

function randomSerial() {
  const value = randomBytes(16);
  value[0] &= 0x7f;
  if (value.every(byte => byte === 0)) value[value.length - 1] = 1;
  return value;
}

function sequence(...parts) {
  return tagged(0x30, Buffer.concat(parts));
}

function set(...parts) {
  return tagged(0x31, Buffer.concat(parts));
}

function integer(value) {
  let bytes = Buffer.from(value);
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0) {
    bytes = bytes.subarray(1);
  }
  if ((bytes[0] & 0x80) !== 0) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tagged(0x02, bytes);
}

function boolean(value) {
  return tagged(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function bitString(value, unusedBits) {
  return tagged(0x03, Buffer.concat([
    Buffer.from([unusedBits]),
    Buffer.from(value)
  ]));
}

function octetString(value) {
  return tagged(0x04, Buffer.from(value));
}

function utf8String(value) {
  return tagged(0x0c, Buffer.from(value, 'utf8'));
}

function oid(value) {
  const arcs = value.split('.').map(Number);
  if (
    arcs.length < 2
    || arcs.some(arc => !Number.isSafeInteger(arc) || arc < 0)
    || arcs[0] > 2
    || (arcs[0] < 2 && arcs[1] > 39)
  ) {
    throw new ValidationError('Certificate OID is invalid');
  }
  const bytes = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const encoded = [arc & 0x7f];
    let remaining = Math.floor(arc / 128);
    while (remaining > 0) {
      encoded.unshift((remaining & 0x7f) | 0x80);
      remaining = Math.floor(remaining / 128);
    }
    bytes.push(...encoded);
  }
  return tagged(0x06, Buffer.from(bytes));
}

function tagged(tag, value) {
  const body = Buffer.from(value);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function derLength(value) {
  if (value < 128) return Buffer.from([value]);
  const bytes = [];
  let remaining = value;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function pem(label, der) {
  const encoded = Buffer.from(der).toString('base64');
  const lines = encoded.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function parsePrivateEd25519(value, label) {
  let key;
  try {
    key = createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} private key is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} private key must use Ed25519`);
  }
  return key;
}

function parseCertificate(value, label) {
  let certificate;
  try {
    certificate = new X509Certificate(value);
  } catch {
    throw new ValidationError(`${label} certificate is invalid`);
  }
  if (certificate.publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} certificate must use Ed25519`);
  }
  return certificate;
}

function assertCertificateWindow(certificate, now, minimumRemainingMs, label) {
  const from = Date.parse(certificate.validFrom);
  const to = Date.parse(certificate.validTo);
  if (
    !Number.isFinite(from)
    || !Number.isFinite(to)
    || now.getTime() < from
    || now.getTime() + minimumRemainingMs >= to
  ) {
    throw new ValidationError(`${label} certificate is expired or too close to expiry`);
  }
}

function publicKeysEqual(left, right) {
  return left.export({ type: 'spki', format: 'der' }).equals(
    right.export({ type: 'spki', format: 'der' })
  );
}

function normalizeFingerprint(value) {
  return String(value).replaceAll(':', '').toLowerCase();
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ValidationError('Transport credential timestamp is invalid');
  }
  return date;
}

function addDays(date, days) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 7_300) {
    throw new ValidationError('Transport certificate validity is invalid');
  }
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function transportRoot(secretDir) {
  return join(
    resolveRequiredPath(secretDir, 'secret directory'),
    'transport'
  );
}

function resolveRequiredPath(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`A ${label} is required`);
  }
  return resolve(value);
}

async function assertPrivatePath(path, label) {
  if (process.platform === 'win32') return;
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or other users`);
  }
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

export {
  CA_COMMON_NAME,
  TRANSPORT_SCHEMA,
  TRANSPORT_SERVICES
};
