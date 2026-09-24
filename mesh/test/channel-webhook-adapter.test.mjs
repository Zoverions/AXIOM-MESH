import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createFixedRecipientWebhookSender } from '../src/channel-webhook-adapter.mjs';

const DESTINATION = 'https://messaging.example.invalid/hooks/fixed';
const CONFIG = Object.freeze({
  account_id: 'account:operator',
  recipient_id: 'room:operations',
  origin: 'https://messaging.example.invalid',
  destination_url: DESTINATION,
  credential: 'synthetic-test-token',
  timeout_ms: 1_000
});

function command(overrides = {}) {
  return {
    account_id: CONFIG.account_id,
    recipient_id: CONFIG.recipient_id,
    confirmed_recipient_id: CONFIG.recipient_id,
    body: 'A bounded message',
    idempotency_key: 'delivery:fixed-room:0001',
    ...overrides
  };
}

test('fixed HTTPS destination sends once and returns a content-free endpoint receipt', async () => {
  const requests = [];
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    state: new Map(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response('', { status: 202 });
    }
  });
  const first = await sender.send(command());
  const second = await sender.send(command());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, DESTINATION);
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers.authorization, 'Bearer synthetic-test-token');
  assert.equal(requests[0].options.headers['idempotency-key'], command().idempotency_key);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    account_id: CONFIG.account_id,
    recipient_id: CONFIG.recipient_id,
    text: command().body
  });
  assert.deepEqual(second, first);
  assert.equal(first.state, 'accepted_by_endpoint');
  assert.equal(first.recipient_delivery_verified, false);
  assert.equal(JSON.stringify(first).includes(command().body), false);
  assert.equal(JSON.stringify(first).includes(CONFIG.credential), false);
  assert.equal(JSON.stringify(sender).includes(CONFIG.credential), false);
});

test('wrong account, recipient, or confirmation and caller destination fail before I/O', async () => {
  let calls = 0;
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    fetchImpl: async () => { calls += 1; throw new Error('unexpected I/O'); }
  });
  for (const change of [
    { account_id: 'account:other' },
    { recipient_id: 'room:other' },
    { confirmed_recipient_id: 'room:other' },
    { destination_url: 'https://elsewhere.invalid/send' },
    { body: 'x'.repeat(8_193) }
  ]) {
    await assert.rejects(sender.send(command(change)));
  }
  assert.equal(calls, 0);
  for (const invalidConfig of [
    { destination_url: 'http://messaging.example.invalid/hooks/fixed' },
    { destination_url: 'https://other.example.invalid/hooks/fixed' },
    { destination_url: `${DESTINATION}?token=secret` },
    { origin: 'https://messaging.example.invalid/other' }
  ]) {
    assert.throws(() => createFixedRecipientWebhookSender({ ...CONFIG, ...invalidConfig }));
  }
});

test('idempotency conflicts and concurrent duplicates cannot dispatch twice', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    state: new Map(),
    fetchImpl: async () => {
      calls += 1;
      await gate;
      return new Response('', { status: 204 });
    }
  });
  const first = sender.send(command());
  const duplicate = sender.send(command());
  await assert.rejects(sender.send(command({ body: 'changed message' })), /idempotency conflict/);
  release();
  assert.deepEqual(await duplicate, await first);
  assert.equal(calls, 1);
});

test('failed or ignored reservation causes zero transport attempts', async () => {
  let calls = 0;
  for (const state of [
    new (class BrokenMap extends Map { set() { throw new Error('state unavailable'); } })(),
    new (class NoopMap extends Map { set() { return this; } })()
  ]) {
    const sender = createFixedRecipientWebhookSender(CONFIG, {
      state,
      fetchImpl: async () => {
        calls += 1;
        return new Response('', { status: 202 });
      }
    });
    await assert.rejects(sender.send(command()), /idempotency state unavailable/);
  }
  assert.equal(calls, 0);
});

test('validated timeout is pinned before the caller mutates configuration', async () => {
  const config = { ...CONFIG };
  const sender = createFixedRecipientWebhookSender(config, {
    fetchImpl: async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Response('', { status: 202 });
    }
  });
  config.timeout_ms = 0;
  assert.equal((await sender.send(command())).state, 'accepted_by_endpoint');
});

test('timeout, lost response, redirects, non-2xx and oversized responses remain uncertain', async () => {
  const transports = [
    async () => ({ status: 200, body: null }),
    async () => { throw new Error('synthetic-test-token and message might leak'); },
    async () => new Response('', { status: 302, headers: { location: 'https://other.invalid/' } }),
    async () => new Response('', { status: 503 }),
    async () => new Response('x'.repeat(4_097), { status: 200 }),
    async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })
  ];
  for (const fetchImpl of transports) {
    const sender = createFixedRecipientWebhookSender({ ...CONFIG, timeout_ms: 20 }, {
      state: new Map(), fetchImpl
    });
    const first = await sender.send(command());
    const second = await sender.send(command());
    assert.equal(first.state, 'uncertain');
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(first).includes(CONFIG.credential), false);
    assert.equal(JSON.stringify(first).includes(command().body), false);
  }
});

test('pre-aborted request is cancelled without any network I/O', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    fetchImpl: async () => { calls += 1; throw new Error('unexpected I/O'); }
  });
  const result = await sender.send(command(), { signal: controller.signal });
  assert.equal(result.state, 'cancelled_before_dispatch');
  assert.equal(calls, 0);
});

test('pre-dispatch cancellation leaves the same key available for a later valid attempt', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    state: new Map(),
    fetchImpl: async () => {
      calls += 1;
      return new Response('', { status: 202 });
    }
  });
  assert.equal((await sender.send(command(), { signal: controller.signal })).state, 'cancelled_before_dispatch');
  assert.equal((await sender.send(command())).state, 'accepted_by_endpoint');
  assert.equal(calls, 1);
});

test('abort after dispatch is uncertain and does not retry the same key', async () => {
  const controller = new AbortController();
  let calls = 0;
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    state: new Map(),
    fetchImpl: async (_url, options) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('network outcome unknown')), {
          once: true
        });
        controller.abort();
      });
    }
  });
  assert.equal((await sender.send(command(), { signal: controller.signal })).state, 'uncertain');
  assert.equal((await sender.send(command())).state, 'uncertain');
  assert.equal(calls, 1);
});

test('a dispatched request reaches only a loopback test receiver', async t => {
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ path: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    response.writeHead(202).end();
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('sandbox denies loopback listeners; run this test in CI');
      return;
    }
    throw error;
  }
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const sender = createFixedRecipientWebhookSender(CONFIG, {
    state: new Map(),
    fetchImpl: (url, options) => {
      assert.equal(url, DESTINATION);
      return fetch(`http://127.0.0.1:${port}/hooks/fixed`, options);
    }
  });
  const receipt = await sender.send(command());
  assert.equal(receipt.state, 'accepted_by_endpoint');
  assert.deepEqual(received, [{
    path: '/hooks/fixed',
    body: { account_id: CONFIG.account_id, recipient_id: CONFIG.recipient_id, text: command().body }
  }]);
});
