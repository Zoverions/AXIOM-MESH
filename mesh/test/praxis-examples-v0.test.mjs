import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PraxisTypeError, compile } from '../../labs/praxis/index.mjs';
import { formatCheckReport } from '../../labs/praxis/format.mjs';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'labs', 'praxis', 'examples');

// The example gallery. `expects` is either 'clean' (compile succeeds) or
// { deny: <PRAXIS_*> } — compile must throw a PraxisTypeError carrying
// exactly that code. Mirrors examples/MANIFEST.md; the table here is the
// CI-enforced copy.
const GALLERY = [
  { file: '01-requires-permit.prax', expects: 'clean' },
  { file: '02-requires-lease.prax', expects: 'clean' },
  { file: '03-requires-quorum.prax', expects: 'clean' },
  { file: '04-requires-secret.prax', expects: 'clean' },
  { file: '05-requires-prepared.prax', expects: 'clean' },
  { file: '06-observe.prax', expects: 'clean' },
  { file: '07-verify.prax', expects: 'clean' },
  { file: '08-assess.prax', expects: 'clean' },
  { file: '09-op-effects.prax', expects: 'clean' },
  { file: '10-authorize.prax', expects: 'clean' },
  { file: '11-prepare.prax', expects: 'clean' },
  { file: '12-commit.prax', expects: 'clean' },
  { file: '13-finalize.prax', expects: 'clean' },
  { file: '14-cancel.prax', expects: 'clean' },
  { file: '15-policy-premise-flow.prax', expects: 'clean' },
  { file: '16-decision-ledger-flow.prax', expects: 'clean' },
  { file: '17-denied-linear-permit-reuse.prax', expects: { deny: 'PRAXIS_LINEAR_AUTHORITY_REUSE' } },
  { file: '18-denied-irreversible-commit.prax', expects: { deny: 'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE' } },
  { file: '19-denied-authority-mismatch.prax', expects: { deny: 'PRAXIS_AUTHORITY_MISMATCH' } },
  { file: '20-denied-secret-arg.prax', expects: { deny: 'PRAXIS_SECRET_EXFILTRATION' } }
];

for (const entry of GALLERY) {
  const source = readFileSync(join(examplesDir, entry.file), 'utf8');

  test(`example ${entry.file} is in canonical form (format --check clean)`, () => {
    assert.equal(formatCheckReport(source, entry.file), null);
  });

  if (entry.expects === 'clean') {
    test(`example ${entry.file} compiles clean`, () => {
      const ir = compile(source);
      assert.equal(ir.schema, 'praxis-ir.v0');
    });
  } else {
    test(`example ${entry.file} denies with ${entry.expects.deny}`, () => {
      assert.throws(
        () => compile(source),
        (error) => {
          assert.ok(error instanceof PraxisTypeError, `expected PraxisTypeError, got ${error?.name}`);
          assert.equal(error.code, entry.expects.deny);
          return true;
        }
      );
    });
  }
}

test('gallery covers every entry in the MANIFEST table (no stray or missing files)', () => {
  const onDisk = new Set(
    readdirSync(examplesDir).filter((name) => name.endsWith('.prax') && name !== 'release.prax')
  );
  const inGallery = new Set(GALLERY.map((entry) => entry.file));
  assert.deepEqual([...onDisk].sort(), [...inGallery].sort());
});

test('prelude.prax compiles clean', () => {
  const source = readFileSync(join(examplesDir, '..', 'prelude.prax'), 'utf8');
  const ir = compile(source);
  assert.equal(ir.schema, 'praxis-ir.v0');
  const kinds = new Set(ir.required_permits.map((p) => p.authority_kind));
  assert.deepEqual([...kinds].sort(), ['Lease', 'Permit', 'Quorum']);
  assert.ok(ir.required_secrets.length >= 1, 'prelude declares at least one secret');
  assert.ok(ir.required_prepared.length >= 1, 'prelude declares at least one prepared op');
});
