import { generateRandomId } from '../../utils/common.js';
import { parseEmailBody } from '../../email/parser.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { jsonError, jsonResponse, parseMailDomains, toIsoStringOrNull, toTimestampMs } from '../format.js';

function buildEmptyMessageList() {
  return {
    messages: [],
    nextCursor: null,
    total: 0
  };
}

const ALLOWED_EXPIRY_TIME = new Set([0, 3600000, 86400000, 604800000]);

export async function createEmail(context) {
  const { request, db, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonError(400, 'Invalid JSON body');
  }

  const domain = String(body?.domain || '').trim().toLowerCase();
  if (!domain) return jsonError(400, 'domain is required');

  const domains = parseMailDomains(env.MAIL_DOMAIN);
  if (!domains.includes(domain)) return jsonError(400, 'domain is not allowed');

  const hasExpiry = body && Object.prototype.hasOwnProperty.call(body, 'expiryTime');
  const expiryTime = hasExpiry ? Number(body.expiryTime) : 3600000;
  if (!Number.isFinite(expiryTime) || !ALLOWED_EXPIRY_TIME.has(expiryTime)) {
    return jsonError(400, 'expiryTime is invalid');
  }

  const localPart = normalizeLocalPart(body?.name);
  if (!localPart) return jsonError(400, 'name is invalid');
  if (localPart.length > 64) return jsonError(400, 'name is invalid');

  const address = `${localPart}@${domain}`;
  let existing = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(address).first();

  let attempts = 0;
  let finalLocalPart = localPart;
  while (existing && attempts < 5) {
    attempts += 1;
    const suffix = generateRandomId(4);
    finalLocalPart = localPart.length > 59 ? `${localPart.slice(0, 59)}-${suffix}` : `${localPart}-${suffix}`;
    const candidateAddress = `${finalLocalPart}@${domain}`;
    existing = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(candidateAddress).first();
    if (!existing) {
      const expiresAt = expiryTime === 0 ? null : new Date(Date.now() + expiryTime).toISOString();
      const insert = await db
        .prepare('INSERT INTO mailboxes (address, local_part, domain, password_hash, last_accessed_at, expires_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP, ?)')
        .bind(candidateAddress, finalLocalPart, domain, expiresAt)
        .run();

      const mailboxId = Number(insert?.meta?.last_row_id || 0);
      return jsonResponse({ id: String(mailboxId), email: candidateAddress });
    }
  }

  if (existing) {
    return jsonError(409, 'email already exists');
  }

  const expiresAt = expiryTime === 0 ? null : new Date(Date.now() + expiryTime).toISOString();
  const insert = await db
    .prepare('INSERT INTO mailboxes (address, local_part, domain, password_hash, last_accessed_at, expires_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP, ?)')
    .bind(address, finalLocalPart, domain, expiresAt)
    .run();

  const mailboxId = Number(insert?.meta?.last_row_id || 0);
  return jsonResponse({ id: String(mailboxId), email: address });
}

export async function listEmails(context) {
  const { db, query } = context;
  const cursorRaw = query.cursor || '';
  const cursor = decodeCursor(cursorRaw);

  if (cursorRaw && !cursor) return jsonError(400, 'invalid cursor');
  if (cursor && !Number.isFinite(Number(cursor.id))) return jsonError(400, 'invalid cursor');

  const limit = 20;
  const binds = [];
  let whereClause = '';

  if (cursor) {
    whereClause = 'WHERE m.id < ?';
    binds.push(Number(cursor.id));
  }

  const rowsResult = await db
    .prepare(`
      SELECT
        m.id,
        m.address,
        m.created_at,
        m.expires_at,
        (
          SELECT um2.user_id
          FROM user_mailboxes um2
          WHERE um2.mailbox_id = m.id
          ORDER BY um2.id ASC
          LIMIT 1
        ) AS user_id
      FROM mailboxes m
      ${whereClause}
      ORDER BY m.id DESC
      LIMIT ?
    `)
    .bind(...binds, limit + 1)
    .all();

  const rows = Array.isArray(rowsResult?.results) ? rowsResult.results : [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const emails = pageRows.map((row) => ({
    id: String(row.id),
    address: row.address,
    createdAt: toIsoStringOrNull(row.created_at),
    expiresAt: toIsoStringOrNull(row.expires_at),
    userId: row.user_id == null ? null : String(row.user_id)
  }));

  const nextCursor = hasMore
    ? encodeCursor({ id: Number(pageRows[pageRows.length - 1].id) })
    : null;

  const totalRow = await db.prepare('SELECT COUNT(*) AS total FROM mailboxes').first();

  return jsonResponse({
    emails,
    nextCursor,
    total: Number(totalRow?.total || 0)
  });
}

export async function listMailboxMessages(context) {
  const { db, params, query } = context;
  const emailId = Number(params.emailId);
  if (!Number.isFinite(emailId) || emailId <= 0) return jsonError(400, 'invalid emailId');

  const mailbox = await db.prepare('SELECT id FROM mailboxes WHERE id = ? LIMIT 1').bind(emailId).first();
  if (!mailbox) return jsonResponse(buildEmptyMessageList());

  const cursorRaw = query.cursor || '';
  const cursor = decodeCursor(cursorRaw);
  if (cursorRaw && !cursor) return jsonError(400, 'invalid cursor');

  const limit = 20;
  const binds = [emailId];
  let whereClause = 'WHERE mailbox_id = ?';

  if (cursor) {
    const receivedAt = Number(cursor.receivedAt);
    const id = Number(cursor.id);
    if (!Number.isFinite(receivedAt) || !Number.isFinite(id)) {
      return jsonError(400, 'invalid cursor');
    }

    const cursorIso = new Date(receivedAt).toISOString();
    whereClause += ' AND (received_at < ? OR (received_at = ? AND id < ?))';
    binds.push(cursorIso, cursorIso, id);
  }

  const rowsResult = await db
    .prepare(`
      SELECT id, sender, subject, received_at
      FROM messages
      ${whereClause}
      ORDER BY received_at DESC, id DESC
      LIMIT ?
    `)
    .bind(...binds, limit + 1)
    .all();

  const rows = Array.isArray(rowsResult?.results) ? rowsResult.results : [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const messages = pageRows.map((row) => ({
    id: String(row.id),
    from_address: row.sender,
    subject: row.subject,
    received_at: toTimestampMs(row.received_at)
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore
    ? encodeCursor({ id: Number(last.id), receivedAt: toTimestampMs(last.received_at) })
    : null;

  const totalRow = await db
    .prepare('SELECT COUNT(*) AS total FROM messages WHERE mailbox_id = ?')
    .bind(emailId)
    .first();

  return jsonResponse({
    messages,
    nextCursor,
    total: Number(totalRow?.total || 0)
  });
}

export async function deleteMailbox(context) {
  const { db, params } = context;
  const emailId = Number(params.emailId);
  if (!Number.isFinite(emailId) || emailId <= 0) return jsonError(400, 'invalid emailId');

  const mailbox = await db.prepare('SELECT id FROM mailboxes WHERE id = ? LIMIT 1').bind(emailId).first();
  if (!mailbox) return jsonError(404, 'mailbox not found');

  try {
    await db.exec('BEGIN');
    await db.prepare('DELETE FROM messages WHERE mailbox_id = ?').bind(emailId).run();
    await db.prepare('DELETE FROM user_mailboxes WHERE mailbox_id = ?').bind(emailId).run();
    const deleted = await db.prepare('DELETE FROM mailboxes WHERE id = ?').bind(emailId).run();
    await db.exec('COMMIT');

    return jsonResponse({ success: Number(deleted?.meta?.changes || 0) > 0 });
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch (_) {
      // ignore rollback error
    }
    return jsonError(500, 'delete failed');
  }
}

export async function getMessageDetail(context) {
  const { db, env, params } = context;
  const emailId = Number(params.emailId);
  const messageId = Number(params.messageId);

  if (!Number.isFinite(emailId) || emailId <= 0) return jsonError(400, 'invalid emailId');
  if (!Number.isFinite(messageId) || messageId <= 0) return jsonError(400, 'invalid messageId');

  const row = await db
    .prepare(`
      SELECT id, mailbox_id, sender, subject, received_at, r2_object_key
      FROM messages
      WHERE id = ? AND mailbox_id = ?
      LIMIT 1
    `)
    .bind(messageId, emailId)
    .first();

  if (!row) return jsonError(404, 'message not found');

  let content = '';
  let html = '';

  if (row.r2_object_key && env.MAIL_EML) {
    try {
      const object = await env.MAIL_EML.get(row.r2_object_key);
      if (object) {
        let raw = '';
        if (typeof object.text === 'function') raw = await object.text();
        else if (typeof object.arrayBuffer === 'function') raw = await new Response(await object.arrayBuffer()).text();
        else raw = await new Response(object.body).text();

        const parsed = parseEmailBody(raw || '');
        content = parsed.text || '';
        html = parsed.html || '';
      }
    } catch (_) {
      content = '';
      html = '';
    }
  }

  return jsonResponse({
    message: {
      id: String(row.id),
      from_address: row.sender,
      subject: row.subject,
      content,
      html,
      received_at: toTimestampMs(row.received_at)
    }
  });
}

function normalizeLocalPart(name) {
  const raw = String(name || '').trim().toLowerCase();
  const base = raw || generateRandomId(8);
  if (!/^[a-z0-9._-]{1,64}$/.test(base)) return '';
  return base;
}
