import { jsonError } from './format.js';

export async function apiKeyAuth(context) {
  const { request, env } = context;
  const expected = String(env.OPENAPI_API_KEY || '').trim();
  if (!expected) {
    return jsonError(500, 'OPENAPI_API_KEY 未配置');
  }

  const provided = String(
    request.headers.get('X-API-Key') || request.headers.get('x-api-key') || ''
  ).trim();

  if (!provided || provided !== expected) {
    return jsonError(401, 'Unauthorized');
  }

  context.auth = { authType: 'apiKey' };
  return null;
}
