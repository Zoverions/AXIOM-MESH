import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { verifyObjectSignature } from '../../../packages/axiom-verify/crypto.mjs';

const FIXTURE_URL = new URL(
  '../../personal-agent-kernel-rust-crypto/fixtures/mesh-proof-signature-v0.tsv',
  import.meta.url
);

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=
-----END PUBLIC KEY-----
`;

function parseTsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split('\t');
  return lines.map(line => {
    const values = line.split('\t');
    return Object.fromEntries(header.map((key, index) => [key, values[index]]));
  });
}

test('existing AXIOM verifier matches the Rust Mesh-proof signature corpus', () => {
  for (const row of parseTsv(readFileSync(FIXTURE_URL, 'utf8'))) {
    const statement = JSON.parse(row.canonical_body);
    const valid = verifyObjectSignature(
      statement,
      {
        algorithm: 'Ed25519',
        key_id: 'grid:fixed-vector',
        digest: row.digest_hex,
        signature: row.signature_b64url
      },
      PUBLIC_KEY_PEM
    );

    assert.equal(
      valid,
      row.expected === 'allow',
      row.case_id
    );
  }
});

test('AXIOM Node verifier rejects a valid signature over noncanonical JSON bytes', () => {
  const body = '{"grant_ref":"grant:crypto-vector-1","capability_ref":"capability:purchase","expires_at_unix_s":1789733300,"max_delegation_hops":1,"node_id":"node:purchase","owner_subject_ref":"subject:owner-1","plan_digest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","revocation_epoch":7}';
  const statement = JSON.parse(body);

  assert.equal(
    verifyObjectSignature(
      statement,
      {
        algorithm: 'Ed25519',
        key_id: 'grid:fixed-vector',
        digest: 'dc156dfc8def9600f83de1b4a0968e042c5d9555b31ba94c6767f4e85344a8ec',
        signature: '5LbrblkK04lXSQRZGa-mGA3aTigl_dKHU3dBxVKhHv_W192zi0aMxrWDiRPLKsWc7jB6-A27r6hXpHXIoJLbAg'
      },
      PUBLIC_KEY_PEM
    ),
    false
  );
});
