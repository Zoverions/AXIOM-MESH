import assert from 'node:assert/strict';
import test from 'node:test';
import { startAxiomOnePreview } from '../../apps/axiom-one/server.mjs';

const EXPECTED_PNG_ASSETS = Object.freeze([
  ['/icons/icon-192.png', 192, 192],
  ['/icons/icon-512.png', 512, 512],
  ['/icons/icon-maskable-192.png', 192, 192],
  ['/icons/icon-maskable-512.png', 512, 512],
  ['/screenshots/screenshot-wide.png', 1280, 720],
  ['/screenshots/screenshot-narrow.png', 390, 844]
]);

test('AXIOM One serves every manifest PNG with the declared type and dimensions', async t => {
  const preview = await startAxiomOnePreview({ port: 0 });
  t.after(async () => preview.stop());

  for (const [assetPath, expectedWidth, expectedHeight] of EXPECTED_PNG_ASSETS) {
    const response = await fetch(`${preview.url}${assetPath}`);
    assert.equal(response.status, 200, `${assetPath} status`);
    assert.match(response.headers.get('content-type') ?? '', /^image\/png(?:;|$)/, `${assetPath} content type`);

    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.length >= 24, `${assetPath} has a PNG header`);
    assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${assetPath} PNG signature`);
    assert.equal(body.subarray(12, 16).toString('ascii'), 'IHDR', `${assetPath} IHDR marker`);
    assert.equal(body.readUInt32BE(16), expectedWidth, `${assetPath} width`);
    assert.equal(body.readUInt32BE(20), expectedHeight, `${assetPath} height`);
  }
});
