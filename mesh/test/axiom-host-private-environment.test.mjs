import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { laboratoryEnvironment } from '../src/axiom-host-lab.mjs';

test('AXIOM Host builder replaces user HOME and XDG state with a private run directory', () => {
  const privateHome = resolve('/tmp/axiom-host-private-test');
  const environment = laboratoryEnvironment(1_786_500_000, {
    PATH: '/usr/bin',
    HOME: '/home/operator',
    XDG_CONFIG_HOME: '/home/operator/.config',
    XDG_CACHE_HOME: '/home/operator/.cache',
    XDG_RUNTIME_DIR: '/run/user/1000',
    GITHUB_TOKEN: 'must-not-pass'
  }, { privateHome });

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.HOME, privateHome);
  assert.equal(environment.XDG_CONFIG_HOME, resolve(privateHome, 'config'));
  assert.equal(environment.XDG_CACHE_HOME, resolve(privateHome, 'cache'));
  assert.equal(environment.XDG_RUNTIME_DIR, resolve(privateHome, 'runtime'));
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.SOURCE_DATE_EPOCH, '1786500000');
  assert.equal(environment.AXIOM_HOST_LAB, '1');
});
