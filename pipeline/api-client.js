const { recordApiCall, sha256 } = require('./audit-store');

function inferredService(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'api.x.com' || host.endsWith('.twitter.com')) return 'x';
  if (host === 'api.openai.com') return 'openai';
  if (host === 'discord.com') return 'discord';
  if (host.includes('espn.com')) return 'espn';
  if (host.includes('stripe.com')) return 'stripe';
  if (host.endsWith('.workers.dev')) return 'cloudflare-worker';
  return host;
}

function endpointClass(url) {
  return new URL(url).pathname
    .replace(/\/\d{6,}(?=\/|$)/g, '/{id}')
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/{id}');
}

function requestBodyHash(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return sha256(body);
  if (body instanceof URLSearchParams) return sha256(body.toString());
  return null;
}

async function responseBodyHash(response) {
  const type = response.headers?.get?.('content-type') || '';
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (!/(?:json|text|javascript|xml)/i.test(type) || length > 1_000_000) return null;
  try {
    return sha256(await response.clone().text());
  } catch {
    return null;
  }
}

async function auditedFetch(url, init = {}, context = {}, fetchImpl = fetch) {
  const method = String(init.method || 'GET').toUpperCase();
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, init);
    await recordApiCall({
      service: context.service || inferredService(url),
      endpointClass: context.endpointClass || endpointClass(url),
      method,
      callerComponent: context.callerComponent || 'node-worker',
      triggerType: context.triggerType || 'runtime',
      operationId: context.operationId,
      workflowId: context.workflowId,
      pickId: context.pickId,
      memberId: context.memberId,
      providerRequestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('cf-ray') || null,
      clientRequestId: context.clientRequestId,
      requestPayloadSha256: requestBodyHash(init.body),
      responsePayloadSha256: await responseBodyHash(response),
      responseStatus: response.status,
      outcome: response.ok ? 'SUCCEEDED' : 'HTTP_ERROR',
      errorClass: response.ok ? null : 'HTTP_ERROR',
      retryCount: context.retryCount || 0,
      latencyMs: Date.now() - startedAt
    });
    return response;
  } catch (error) {
    await recordApiCall({
      service: context.service || inferredService(url),
      endpointClass: context.endpointClass || endpointClass(url),
      method,
      callerComponent: context.callerComponent || 'node-worker',
      triggerType: context.triggerType || 'runtime',
      operationId: context.operationId,
      workflowId: context.workflowId,
      pickId: context.pickId,
      memberId: context.memberId,
      clientRequestId: context.clientRequestId,
      requestPayloadSha256: requestBodyHash(init.body),
      outcome: 'NETWORK_ERROR',
      errorClass: error?.name || 'NETWORK_ERROR',
      retryCount: context.retryCount || 0,
      latencyMs: Date.now() - startedAt
    });
    throw error;
  }
}

module.exports = { auditedFetch, endpointClass, inferredService, requestBodyHash };
