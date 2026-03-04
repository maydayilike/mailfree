import { Router } from '../middleware/router.js';
import { apiKeyAuth } from './auth.js';
import { getConfig } from './handlers/config.js';
import {
  createEmail,
  deleteMailbox,
  getMessageDetail,
  listEmails,
  listMailboxMessages
} from './handlers/emails.js';

export function createOpenApiRouter() {
  const router = new Router();
  router.use(apiKeyAuth);

  router.get('/api/config', getConfig);
  router.post('/api/emails/generate', createEmail);
  router.get('/api/emails', listEmails);
  router.get('/api/emails/:emailId', listMailboxMessages);
  router.delete('/api/emails/:emailId', deleteMailbox);
  router.get('/api/emails/:emailId/:messageId', getMessageDetail);

  return router;
}
