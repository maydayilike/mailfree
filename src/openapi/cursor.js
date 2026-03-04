const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();

export function encodeCursor(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const text = DECODER.decode(base64UrlDecode(raw));
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function base64UrlEncode(text) {
  const bytes = ENCODER.encode(String(text));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(raw) {
  let s = String(raw).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
