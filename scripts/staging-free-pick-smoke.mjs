import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const baseUrl = process.env.STAGING_FREE_PICK_URL;
const secret = process.env.STAGING_FREE_PICK_SECRET;

if (!baseUrl || !secret) {
  throw new Error('STAGING_FREE_PICK_URL and STAGING_FREE_PICK_SECRET are required');
}

const endpoint = baseUrl.replace(/\/$/, '');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const expectedSha256 = createHash('sha256').update(png).digest('hex');

const healthResponse = await fetch(`${endpoint}/health`);
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.freePickReady, true);
assert.equal(health.xConnected, false);

const unauthorizedResponse = await fetch(`${endpoint}/api/free-pick/publish`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ selection: 'unauthorized fixture' }),
});
assert.equal(unauthorizedResponse.status, 401);

const form = new FormData();
form.set('image', new Blob([png], { type: 'image/png' }), 'staging-free-pick.png');
form.set('publishedDate', '2099-01-01');
form.set('caption', 'Isolated staging image acceptance fixture — not for publication.');
form.set('sport', 'test');
form.set('event', 'isolated staging acceptance');
form.set('selection', 'fixture only');
form.set('odds', '+100');
form.set('units', '0');
form.set('reason', 'Verifies image storage and exact-byte retrieval without public delivery.');

const publishResponse = await fetch(`${endpoint}/api/free-pick/publish`, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
  body: form,
});
assert.equal(publishResponse.status, 201);
const published = await publishResponse.json();
assert.equal(published.publishedDate, '2099-01-01');
assert.equal(published.details.selection, 'fixture only');
assert.equal(published.xPosted, false);
assert.match(published.imageUrl, /^https:\/\//);

const currentResponse = await fetch(`${endpoint}/api/free-pick/current`);
assert.equal(currentResponse.status, 200);
const current = await currentResponse.json();
assert.deepEqual(current.details, published.details);
assert.equal(current.imageUrl, published.imageUrl);

const imageResponse = await fetch(current.imageUrl);
assert.equal(imageResponse.status, 200);
assert.equal(imageResponse.headers.get('content-type'), 'image/png');
const returnedImage = Buffer.from(await imageResponse.arrayBuffer());
const actualSha256 = createHash('sha256').update(returnedImage).digest('hex');
assert.equal(actualSha256, expectedSha256);

console.log(JSON.stringify({
  ok: true,
  worker: health.service,
  healthStatus: healthResponse.status,
  unauthorizedStatus: unauthorizedResponse.status,
  publishStatus: publishResponse.status,
  currentStatus: currentResponse.status,
  imageStatus: imageResponse.status,
  imageContentType: imageResponse.headers.get('content-type'),
  imageBytes: returnedImage.length,
  imageSha256: actualSha256,
  xConnected: health.xConnected,
  xPosted: published.xPosted,
  publishedDate: current.publishedDate,
  selection: current.details.selection,
}, null, 2));
