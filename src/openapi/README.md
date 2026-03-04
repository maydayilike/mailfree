# OpenAPI Standalone Service

This standalone Cloudflare Worker implements only the OpenAPI-compatible endpoints below, isolated from the legacy app routes.

## Endpoints

1. `GET /api/config`
2. `POST /api/emails/generate`
3. `GET /api/emails?cursor=xxx`
4. `GET /api/emails/{emailId}?cursor=xxx`
5. `DELETE /api/emails/{emailId}`
6. `GET /api/emails/{emailId}/{messageId}`

## Auth

All endpoints require a single global API key via header:

- `X-API-Key: <OPENAPI_API_KEY>`

No user-level binding or data isolation is applied in this service.

## Data Layer

The service reuses existing D1/R2 structures:

- D1 tables: `mailboxes`, `messages`, `users`, `user_mailboxes`
- R2 bucket: raw EML objects referenced by `messages.r2_object_key`

## Environment Variables

Required / supported:

- `OPENAPI_API_KEY`
- `MAIL_DOMAIN` (comma/space separated domain whitelist)
- `OPENAPI_DEFAULT_ROLE` (`CIVILIAN|KNIGHT|DUKE`, default `CIVILIAN`)
- `OPENAPI_ADMIN_CONTACT` (default empty string)
- `OPENAPI_MAX_EMAILS` (returned as string, default `10`)

## Deploy

Use the standalone Wrangler config:

```bash
wrangler deploy --config wrangler.openapi.toml
```

## Notes

- Cursor paging uses base64url(JSON).
- Mailbox list sort: `id DESC`.
- Message list sort: `received_at DESC, id DESC`.
- If R2 object is missing, message detail still returns metadata, with `content`/`html` as empty strings.
