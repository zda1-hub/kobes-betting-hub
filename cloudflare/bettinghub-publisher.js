const CALLBACK_PATH = "/auth/x/callback";
const START_PATH = "/auth/x/start";
const TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const AUTHORIZE_ENDPOINT = "https://x.com/i/oauth2/authorize";
const CREATE_POST_ENDPOINT = "https://api.x.com/2/tweets";
const MEDIA_UPLOAD_ENDPOINT = "https://api.x.com/2/media/upload";
const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const MAX_POST_LENGTH = 280;
const FREE_PICK_STATE_KEY = "free-picks/current.json";
const FREE_PICK_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchDuePosts(controller.scheduledTime, env));
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (url.pathname === "/health") {
    return json({ service: "bettinghub-publisher", status: "ready", xConnected: await hasXConnection(env), freePickReady: Boolean(env.FREE_PICK_MEDIA) });
  }
  if (url.pathname === START_PATH) return beginXAuthorization(url, env);
  if (url.pathname === CALLBACK_PATH) return completeXAuthorization(url, env);
  if (url.pathname === "/api/queue/x" && request.method === "POST") return enqueueXPost(request, env);
  if (url.pathname === "/api/queue/x" && request.method === "GET") return listRecentPosts(request, env);
  if (url.pathname === "/api/free-pick/current" && request.method === "GET") return getCurrentFreePick(request, env);
  if (url.pathname === "/media/free-pick/current" && request.method === "GET") return getCurrentFreePickImage(request, env);
  if (url.pathname === "/api/free-pick/publish" && request.method === "POST") return publishFreePick(request, env);
  return new Response("Not found", { status: 404 });
}

// This internal endpoint deliberately accepts approved text posts, not source URLs or downloaded media.
async function enqueueXPost(request, env) {
  if (!await hasBearer(request, env.QUEUE_INGEST_SECRET)) return json({ error: "Unauthorized" }, 401);
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const scheduleTime = Date.parse(typeof input.scheduledAt === "string" ? input.scheduledAt : "");
  const publishNow = input.publishNow === true;
  if (!body || body.length > MAX_POST_LENGTH) return json({ error: `body must contain 1–${MAX_POST_LENGTH} characters` }, 400);
  if (!Number.isFinite(scheduleTime)) return json({ error: "scheduledAt must be an ISO-8601 date" }, 400);

  const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(input.id) ? input.id : crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO approved_posts (id, channel, body, scheduled_at, status, created_at)
     VALUES (?, 'x', ?, ?, 'approved', ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(id, body, new Date(scheduleTime).toISOString(), new Date().toISOString()).run();
  if (result.meta.changes === 0) return json({ error: "A post with this id already exists" }, 409);
  if (publishNow) {
    const claim = await env.DB.prepare(
      `UPDATE approved_posts SET status = 'publishing', last_error = NULL
       WHERE id = ? AND status = 'approved'`,
    ).bind(id).run();
    if (claim.meta.changes === 1) await publishXPost({ id, body }, env);
    const current = await env.DB.prepare(
      `SELECT status, x_post_id AS xPostId, last_error AS lastError
       FROM approved_posts WHERE id = ?`,
    ).bind(id).first();
    return json({ id, status: current?.status, xPostId: current?.xPostId, lastError: current?.lastError }, current?.status === "published" ? 201 : 202);
  }
  return json({ id, status: "approved", scheduledAt: new Date(scheduleTime).toISOString() }, 201);
}

async function listRecentPosts(request, env) {
  if (!await hasBearer(request, env.QUEUE_INGEST_SECRET)) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    `SELECT id, body, scheduled_at AS scheduledAt, status, published_at AS publishedAt, x_post_id AS xPostId, last_error AS lastError
     FROM approved_posts ORDER BY created_at DESC LIMIT 25`,
  ).all();
  return json({ posts: results });
}

// Staff uses this endpoint once with the final daily image. The stored image is
// then served to the public Free Pick page and attached to the corresponding X Post.
async function publishFreePick(request, env) {
  if (!await hasBearer(request, env.QUEUE_INGEST_SECRET)) return json({ error: "Unauthorized" }, 401);
  if (!env.FREE_PICK_MEDIA) return json({ error: "Free Pick media storage is not configured" }, 503);
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return json({ error: "Expected multipart form data" }, 400);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Could not read the image upload" }, 400);
  }
  const image = form.get("image");
  const contentType = image instanceof File ? image.type : "";
  const extension = ALLOWED_IMAGE_TYPES.get(contentType);
  if (!extension || !(image instanceof File)) return json({ error: "image must be a JPG, PNG, or WebP file" }, 400);
  if (image.size < 1 || image.size > FREE_PICK_MAX_BYTES) return json({ error: "image must be no larger than 5 MB" }, 400);

  const publishedDate = validDate(String(form.get("date") || "")) || phoenixDate();
  const caption = String(form.get("caption") || `Today’s free pick is live. https://kobesbettinghub.com/free-pick`).trim();
  if (!caption || caption.length > MAX_POST_LENGTH) return json({ error: `caption must contain 1–${MAX_POST_LENGTH} characters` }, 400);
  const replace = String(form.get("replace") || "").toLowerCase() === "true";
  const existing = await readFreePick(env);
  if (existing?.publishedDate === publishedDate && existing.xStatus === "published" && !replace) {
    return json({ error: "A free pick has already been published for this date. Send replace=true only when intentionally replacing it." }, 409);
  }

  const objectKey = `free-picks/${publishedDate}/${crypto.randomUUID()}.${extension}`;
  await env.FREE_PICK_MEDIA.put(objectKey, image, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });

  const pick = { publishedDate, caption, objectKey, updatedAt: new Date().toISOString(), xStatus: "pending" };
  await writeFreePick(pick, env);
  try {
    const xPostId = await publishFreePickToX(image, contentType, caption, env);
    pick.xStatus = "published";
    pick.xPostId = xPostId;
    pick.xPublishedAt = new Date().toISOString();
    await writeFreePick(pick, env);
    return json({ ...publicFreePick(pick, new URL(request.url).origin), xPosted: true }, 201);
  } catch (error) {
    pick.xStatus = "needs_attention";
    pick.xError = String(error.message || error).slice(0, 300);
    await writeFreePick(pick, env);
    console.error("Free Pick site update succeeded but X publish did not", { publishedDate, message: pick.xError });
    return json({ ...publicFreePick(pick, new URL(request.url).origin), xPosted: false, message: "The Free Pick page is live, but X needs attention before the post can be published." }, 202);
  }
}

async function getCurrentFreePick(request, env) {
  if (!env.FREE_PICK_MEDIA) return json({ error: "Free Pick media storage is not configured" }, 503, corsHeaders(request));
  const pick = await readFreePick(env);
  if (!pick) return json({ error: "No current free pick" }, 404, corsHeaders(request));
  return json(publicFreePick(pick, new URL(request.url).origin), 200, corsHeaders(request));
}

async function getCurrentFreePickImage(request, env) {
  if (!env.FREE_PICK_MEDIA) return new Response("Free Pick media storage is not configured", { status: 503, headers: corsHeaders(request) });
  const pick = await readFreePick(env);
  if (!pick) return new Response("No current free pick", { status: 404, headers: corsHeaders(request) });
  const object = await env.FREE_PICK_MEDIA.get(pick.objectKey);
  if (!object) return new Response("Current free pick image was not found", { status: 404, headers: corsHeaders(request) });
  const headers = new Headers(corsHeaders(request));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=300");
  return new Response(object.body, { headers });
}

async function readFreePick(env) {
  const object = await env.FREE_PICK_MEDIA.get(FREE_PICK_STATE_KEY);
  if (!object) return null;
  try {
    const pick = JSON.parse(await object.text());
    return validDate(pick?.publishedDate) && typeof pick?.objectKey === "string" && typeof pick?.caption === "string" ? pick : null;
  } catch {
    return null;
  }
}

async function writeFreePick(pick, env) {
  await env.FREE_PICK_MEDIA.put(FREE_PICK_STATE_KEY, JSON.stringify(pick), {
    httpMetadata: { contentType: "application/json; charset=UTF-8", cacheControl: "no-store" },
  });
}

function publicFreePick(pick, origin) {
  return {
    publishedDate: pick.publishedDate,
    caption: pick.caption,
    imageUrl: `${origin}/media/free-pick/current?v=${encodeURIComponent(pick.updatedAt || pick.publishedDate)}`,
  };
}

async function publishFreePickToX(image, contentType, caption, env) {
  const token = await getUsableXToken(env);
  const encodedImage = base64FromArrayBuffer(await image.arrayBuffer());
  const mediaResponse = await fetch(MEDIA_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ media: encodedImage, media_category: "tweet_image" }),
  });
  const mediaPayload = await mediaResponse.json().catch(() => ({}));
  const mediaId = mediaPayload?.data?.id;
  if (!mediaResponse.ok || !mediaId) throw new Error(xErrorDetail(mediaPayload, mediaResponse.status));

  const postResponse = await fetch(CREATE_POST_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ text: caption, media: { media_ids: [String(mediaId)] } }),
  });
  const postPayload = await postResponse.json().catch(() => ({}));
  if (!postResponse.ok || !postPayload?.data?.id) throw new Error(xErrorDetail(postPayload, postResponse.status));
  return String(postPayload.data.id);
}

async function dispatchDuePosts(scheduledTime, env) {
  const now = new Date(scheduledTime || Date.now()).toISOString();
  await recoverStuckPosts(now, env);
  const { results: posts } = await env.DB.prepare(
    `SELECT id, body FROM approved_posts
     WHERE channel = 'x' AND status = 'approved' AND scheduled_at <= ?
     ORDER BY scheduled_at ASC LIMIT 10`,
  ).bind(now).all();
  for (const post of posts) {
    const claim = await env.DB.prepare(
      `UPDATE approved_posts SET status = 'publishing', last_error = NULL
       WHERE id = ? AND status = 'approved'`,
    ).bind(post.id).run();
    if (claim.meta.changes === 1) await publishXPost(post, env);
  }
}

async function recoverStuckPosts(now, env) {
  const cutoff = new Date(Date.parse(now) - 15 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE approved_posts SET status = 'approved', last_error = 'Recovered after interrupted publish attempt'
     WHERE status = 'publishing' AND scheduled_at < ?`,
  ).bind(cutoff).run();
}

async function publishXPost(post, env) {
  try {
    const token = await getUsableXToken(env);
    const response = await fetch(CREATE_POST_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: post.body }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.data?.id) {
      const publishedAt = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`UPDATE approved_posts SET status = 'published', published_at = ?, x_post_id = ?, last_error = NULL WHERE id = ?`)
          .bind(publishedAt, payload.data.id, post.id),
        env.DB.prepare(`INSERT INTO delivery_logs (post_id, attempted_at, outcome, http_status, detail) VALUES (?, ?, 'success', ?, ?)`)
          .bind(post.id, publishedAt, response.status, `X post ${payload.data.id}`),
      ]);
      return;
    }
    await recordDeliveryFailure(post.id, response.status, xErrorDetail(payload, response.status), response.status === 429 || response.status >= 500, env);
  } catch (error) {
    await recordDeliveryFailure(post.id, null, "Network or token error while publishing", true, env);
    console.error("X publish failed", { postId: post.id, message: String(error) });
  }
}

async function recordDeliveryFailure(postId, httpStatus, detail, retryable, env) {
  const attemptedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE approved_posts SET status = ?, last_error = ? WHERE id = ?`)
      .bind(retryable ? "approved" : "failed", detail.slice(0, 500), postId),
    env.DB.prepare(`INSERT INTO delivery_logs (post_id, attempted_at, outcome, http_status, detail) VALUES (?, ?, ?, ?, ?)`)
      .bind(postId, attemptedAt, retryable ? "retry" : "failed", httpStatus, detail.slice(0, 500)),
  ]);
}

function xErrorDetail(payload, status) {
  const message = payload?.detail || payload?.title || payload?.errors?.[0]?.message || "X did not accept the post";
  return `X ${status}: ${String(message)}`;
}

async function getUsableXToken(env) {
  const token = await readXToken(env);
  if (!token?.access_token) throw new Error("No X connection exists");
  const expiresAt = Date.parse(token._storedAt || 0) + Number(token.expires_in || 0) * 1000;
  if (!token.refresh_token || !Number.isFinite(expiresAt) || Date.now() < expiresAt - 60_000) return token;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token }),
  });
  if (!response.ok) throw new Error(`X refresh failed: ${response.status}`);
  const refreshed = await response.json();
  await saveXToken(refreshed, env);
  return refreshed;
}

async function beginXAuthorization(url, env) {
  const verifier = randomBase64Url(64);
  const payload = base64UrlEncodeText(JSON.stringify({ verifier, exp: Date.now() + 600000 }));
  const state = `${payload}.${await hmac(payload, env)}`;
  const authorize = new URL(AUTHORIZE_ENDPOINT);
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: env.X_CLIENT_ID, redirect_uri: `${url.origin}${CALLBACK_PATH}`,
    scope: X_SCOPES.join(" "), state, code_challenge: await sha256Base64Url(verifier), code_challenge_method: "S256",
  }).toString();
  return Response.redirect(authorize.toString(), 302);
}

async function completeXAuthorization(url, env) {
  if (url.searchParams.get("error")) return html("X authorization was declined or cancelled. You can close this page and try again.", 400);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return html("The authorization response was incomplete.", 400);
  const data = await verifyState(state, env);
  if (!data) return html("The authorization request expired or could not be verified. Start again.", 400);
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: `${url.origin}${CALLBACK_PATH}`, code_verifier: data.verifier }),
  });
  if (!tokenResponse.ok) {
    console.error("X token exchange failed", { status: tokenResponse.status });
    return html("X could not complete the connection. No credential was saved; please start again.", 502);
  }
  await saveXToken(await tokenResponse.json(), env);
  return html("Kobe's Betting Hub is connected to X. You can close this page.");
}

async function saveXToken(token, env) {
  await env.DB.prepare(
    `INSERT INTO oauth_tokens (provider, encrypted_payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET encrypted_payload = excluded.encrypted_payload, updated_at = excluded.updated_at`,
  ).bind("x", await encrypt(JSON.stringify(token), env), new Date().toISOString()).run();
}

async function readXToken(env) {
  const row = await env.DB.prepare("SELECT encrypted_payload, updated_at FROM oauth_tokens WHERE provider = ?").bind("x").first();
  if (!row) return null;
  const token = JSON.parse(await decrypt(row.encrypted_payload, env));
  token._storedAt = row.updated_at;
  return token;
}

async function hasXConnection(env) {
  const row = await env.DB.prepare("SELECT 1 AS connected FROM oauth_tokens WHERE provider = ?").bind("x").first();
  return Boolean(row?.connected);
}

async function hasBearer(request, expected) {
  const actual = request.headers.get("authorization");
  return Boolean(expected && actual) && constantTimeEqual(actual, `Bearer ${expected}`);
}

async function verifyState(state, env) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !constantTimeEqual(signature, await hmac(payload, env))) return null;
  try {
    const data = JSON.parse(base64UrlDecodeText(payload));
    return data.exp > Date.now() && typeof data.verifier === "string" ? data : null;
  } catch {
    return null;
  }
}

async function hmac(value, env) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.OAUTH_STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncodeBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function sha256Base64Url(value) {
  return base64UrlEncodeBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function encrypt(plainText, env) {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(env.TOKEN_ENCRYPTION_KEY), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));
  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(new Uint8Array(encrypted))}`;
}

async function decrypt(payload, env) {
  const [iv, cipherText] = payload.split(".");
  if (!iv || !cipherText) throw new Error("Stored X token is malformed");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(env.TOKEN_ENCRYPTION_KEY), { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, key, base64UrlToBytes(cipherText));
  return new TextDecoder().decode(plain);
}

function randomBase64Url(bytes) {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(bytes)));
}
function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}
function base64UrlDecodeText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}
function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join(""));
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? value : null;
}
function phoenixDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}
function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({ vary: "Origin" });
  if (origin === "https://kobesbettinghub.com" || origin === "https://www.kobesbettinghub.com") {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
  }
  return headers;
}
function json(value, status = 200, extraHeaders = undefined) {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=UTF-8");
  return new Response(JSON.stringify(value), { status, headers });
}
function html(message, status = 200) {
  return new Response(`<!doctype html><title>Betting Hub</title><p>${message}</p>`, { status, headers: { "content-type": "text/html; charset=UTF-8" } });
}
