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
