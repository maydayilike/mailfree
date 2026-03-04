import { getInitializedDatabase } from '../db/connection.js';
import { createOpenApiRouter } from './router.js';

export default {
  async fetch(request, env, ctx) {
    let db;
    try {
      db = await getInitializedDatabase(env);
    } catch (error) {
      return jsonError(500, '数据库连接失败，请检查配置');
    }

    const router = createOpenApiRouter();
    const response = await router.handle(request, { request, env, ctx, db });
    if (response) return response;

    return jsonError(404, 'Not Found');
  }
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
