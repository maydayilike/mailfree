import { buildOpenApiConfig, jsonResponse } from '../format.js';

export async function getConfig(context) {
  return jsonResponse(buildOpenApiConfig(context.env));
}
