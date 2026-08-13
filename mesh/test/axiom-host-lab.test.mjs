import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  HOST_LAB_MKOSI_URL,
  HOST_LAB_POLICY_URL,
  HOST_LAB_VERSION_URL,
  parseMkosiConfiguration,
  verifyAxiomHostLabConfiguration
} from '../src/check-axiom-host-lab.mjs';
import { laboratoryEnvironment } from '../src/axiom-host-lab.mjs';

const [POLICY_TEXT, MKOSI_TEXT, VERSION_TEXT] = await Promise.all([
  readFile(HOST_LAB_POLICY_URL, 'utf8'),
  readFile(HOST_LAB_MKOSI_URL, 'utf8'),
  readFile(HOST_LAB_VERSION_URL, 'utf8')
]);

test('AXIOM Host H0 laboratory configuration is valid and non-promoting', async () => {
  const result = await verifyAxiomHostLabConfiguration();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-host-lab-policy.v1');
  assert.equal(result.stage, 'H0');
  assert.equal(result.target, 'fedora-43-x86-64');
  assert.equal(result.image_id, 'axiom-host-lab');
  assert.equal(result.image_version, '0.1.0-h0');
  assert.equal(result.bootloader, 'systemd-boot');
  assert.equal(result.network, 'none');
  assert.equal(result.virtual_tpm, false);
  assert.equal(result.production_promoted, false);
});

test('mkosi parser preserves package continuations without accepting duplicate keys', () => {
  const parsed = parseMkosiConfiguration('[Content]\nPackages=a\n         b\nWithDocs=no\n');
  assert.equal(parsed.get('Content').get('Packages'), 'a b');
  assert.throws(
    () => parseMkosiConfiguration('[Content]\nPackages=a\nPackages=b\n'),
    /repeats \[Content] Packages/
  );
});

test('H0 verifier rejects remote access, secret-bearing settings, and authority promotion', async () => {
  await withFixture({
    mkosi: MKOSI_TEXT.replace('Autologin=no', 'Autologin=yes')
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /Autologin must equal no/
    );
  });

  await withFixture({
    mkosi: `${MKOSI_TEXT}\n[Secrets]\nSecureBootKey=/tmp/lab.key\n`
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /must not contain secret-bearing or remote-access setting SecureBootKey/
    );
  });

  const promoted = JSON.parse(POLICY_TEXT);
  promoted.authority.production_policy_changed = true;
  await withFixture({
    policy: `${JSON.stringify(promoted, null, 2)}\n`
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /production_policy_changed must be false/
    );
  });
});

test('laboratory environment does not forward arbitrary host secrets', () => {
  const environment = laboratoryEnvironment(1_786_500_000, {
    PATH: '/usr/bin',
    HOME: '/tmp/axiom-host-test',
    LANG: 'C.UTF-8',
    AWS_SECRET_ACCESS_KEY: 'must-not-pass',
    OPENAI_API_KEY: 'must-not-pass',
    GITHUB_TOKEN: 'must-not-pass',
    AXIOM_DATA_KEY: 'must-not-pass'
  });

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.HOME, '/tmp/axiom-host-test');
  assert.equal(environment.SOURCE_DATE_EPOCH, '1786500000');
  assert.equal(environment.AXIOM_HOST_LAB, '1');
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.AXIOM_DATA_KEY, undefined);
});

async function withFixture(overrides, callback) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-lab-'));
  try {
    const policyPath = join(root, 'policy.json');
    const mkosiPath = join(root, 'mkosi.conf');
    const versionPath = join(root, 'mkosi.version');
    await Promise.all([
      writeFile(policyPath, overrides.policy ?? POLICY_TEXT),
      writeFile(mkosiPath, overrides.mkosi ?? MKOSI_TEXT),
      writeFile(versionPath, overrides.version ?? VERSION_TEXT)
    ]);
    await callback({
      policyUrl: pathToFileURL(policyPath),
      mkosiUrl: pathToFileURL(mkosiPath),
      versionUrl: pathToFileURL(versionPath)
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
