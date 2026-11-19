const MATCH = /^\/assets\/road_to_truck\/((?:daily-)?\d{4}-\d{2}-\d{2})\.png$/;
const respond = (body, status = 200) => Response.json(body, { status });

export default {
  async fetch(request, env) {
    const match = new URL(request.url).pathname.match(MATCH);
    if (!match) return respond({ error: 'Not found' }, 404);
    const key = `assets/road_to_truck/${match[1]}.png`;
    if (request.method === 'GET') {
      const object = await env.TRUCK_ASSETS.get(key);
      if (!object) return respond({ error: 'Not found' }, 404);
      return new Response(object.body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    if (request.method !== 'PUT') return respond({ error: 'Method not allowed' }, 405);
    if (!env.TRUCK_ASSET_SECRET || request.headers.get('authorization') !== `Bearer ${env.TRUCK_ASSET_SECRET}`)
      return respond({ error: 'Unauthorized' }, 401);
    if (request.headers.get('content-type') !== 'image/png') return respond({ error: 'PNG required' }, 415);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength < 100 || bytes.byteLength > 5_000_000) return respond({ error: 'Invalid image size' }, 413);
    const image = new Uint8Array(bytes);
    if (![137,80,78,71,13,10,26,10].every((value, index) => image[index] === value)) return respond({ error: 'Invalid PNG' }, 422);
    await env.TRUCK_ASSETS.put(key, bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
    return respond({ url: `${new URL(request.url).origin}/${key}`, key });
  }
};
