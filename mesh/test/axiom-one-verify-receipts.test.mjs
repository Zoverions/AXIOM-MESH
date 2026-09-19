import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSignedReceiptFixture
} from '../../packages/axiom-verify/index.mjs';
import {
  startAxiomOnePreview
} from '../../apps/axiom-one/server.mjs';

const appUrl = new URL('../../apps/axiom-one/app.mjs', import.meta.url);
const presentationUrl = new URL('../../apps/axiom-one/presentation.mjs', import.meta.url);
const serverUrl = new URL('../../apps/axiom-one/server.mjs', import.meta.url);
const workerUrl = new URL('../../apps/axiom-one/sw.mjs', import.meta.url);

test('AXIOM One Receipts composes live chain integrity with Gateway-independent offline Verify', async t => {
  const [app, presentation, server, worker] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(presentationUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
    readFile(workerUrl, 'utf8')
  ]);
  const receiptsStart = app.indexOf('async function renderReceipts()');
  const receiptsEnd = app.indexOf('async function renderShare()');
  assert.ok(receiptsStart >= 0 && receiptsEnd > receiptsStart);
  const receipts = app.slice(receiptsStart, receiptsEnd);

  assert.match(receipts, /state\.client\.call\('audit\.verify'/);
  assert.match(receipts, /\/local\/verify/);
  assert.match(receipts, /human\.verifyReport\(/);
  assert.match(receipts, /Integrity versus truth/i);
  assert.match(receipts, /not external-world truth/i);
  assert.match(receipts, /audit.*integrity/i);
  assert.match(presentation, /verifyReport/);
  assert.match(presentation, /PASS.*not external-world truth/is);
  assert.match(server, /handleLocalVerify/);
  assert.match(server, /packages\/axiom-verify/);
  assert.match(server, /gateway_authority_client:\s*false/);
  assert.match(worker, /url\.pathname\.startsWith\('\/local\/'\)/);

  const { receipt, publicKeyPem } = createSignedReceiptFixture();
  const gatewayHits = [];
  const gateway = createServer((req, res) => {
    gatewayHits.push(req.url);
    res.writeHead(500);
    res.end('Gateway must not be consulted for local offline Verify');
  });
  await new Promise((resolve, reject) => {
    gateway.once('error', reject);
    gateway.listen(0, '127.0.0.1', resolve);
  });
  const preview = await startAxiomOnePreview({
    port: 0,
    gatewayOrigin: `http://127.0.0.1:${gateway.address().port}`
  });
  t.after(async () => {
    await preview.stop();
    await new Promise((resolve, reject) => gateway.close(error => error ? reject(error) : resolve()));
  });

  const sameOriginHeaders = {
    origin: preview.url,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json'
  };
  const passResponse = await fetch(`${preview.url}/local/verify`, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: JSON.stringify({
      mode: 'receipt',
      artifact: receipt,
      public_key_pem: publicKeyPem
    })
  });
  assert.equal(passResponse.status, 200);
  const passReport = await passResponse.json();
  assert.equal(passReport.schema, 'axiom-verify-report.v0');
  assert.equal(passReport.verdict, 'PASS');
  assert.equal(passReport.ok, true);
  assert.equal(passReport.gateway_authority_client, false);
  assert.match(passReport.integrity_versus_truth, /Integrity versus truth/);
  assert.equal(gatewayHits.length, 0);

  const altered = structuredClone(receipt);
  altered.statement.intent.action = 'system.hash';
  const failResponse = await fetch(`${preview.url}/local/verify`, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: JSON.stringify({
      mode: 'receipt',
      artifact: altered,
      public_key_pem: publicKeyPem
    })
  });
  assert.equal(failResponse.status, 200);
  const failReport = await failResponse.json();
  assert.equal(failReport.verdict, 'FAIL');
  assert.equal(failReport.ok, false);
  assert.equal(typeof failReport.reason, 'string');
  assert.equal(gatewayHits.length, 0);

  const crossOrigin = await fetch(`${preview.url}/local/verify`, {
    method: 'POST',
    headers: {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      mode: 'receipt',
      artifact: receipt,
      public_key_pem: publicKeyPem
    })
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(gatewayHits.length, 0);
});
