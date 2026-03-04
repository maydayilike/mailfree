const ALLOWED_DEFAULT_ROLES = new Set(['CIVILIAN', 'KNIGHT', 'DUKE']);

export function parseMailDomains(raw) {
  return String(raw || 'temp.example.com')
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function buildOpenApiConfig(env) {
  const role = String(env.OPENAPI_DEFAULT_ROLE || 'CIVILIAN').trim().toUpperCase();

  return {
    defaultRole: ALLOWED_DEFAULT_ROLES.has(role) ? role : 'CIVILIAN',
    emailDomains: parseMailDomains(env.MAIL_DOMAIN).join(','),
    adminContact: String(env.OPENAPI_ADMIN_CONTACT || ''),
    maxEmails: String(env.OPENAPI_MAX_EMAILS ?? '10')
  };
}

export function toIsoStringOrNull(value) {
  if (!value) return null;
  const normalized = normalizeDateInput(value);
  const ts = Date.parse(normalized);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

export function toTimestampMs(value) {
  if (!value) return 0;
  const normalized = normalizeDateInput(value);
  const ts = Date.parse(normalized);
  if (Number.isFinite(ts)) return ts;

  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonError(status, message) {
  return jsonResponse({ error: message }, status);
}

function normalizeDateInput(value) {
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return `${s.replace(' ', 'T')}Z`;
  }
  return s;
}
