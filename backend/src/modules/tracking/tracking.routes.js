// Public endpoints used by email recipients and Amazon SNS (no login).
import express, { Router } from 'express';
import * as c from './tracking.controller.js';

const router = Router();
router.get('/t/o/:file', c.open);
router.get('/t/c/:token/:linkId', c.click);
router.get('/u/:token', c.unsubscribePage);
router.post('/u/:token', express.urlencoded({ extended: false, limit: '10kb' }), c.unsubscribe);
router.post('/webhooks/ses', express.text({ type: '*/*', limit: '256kb' }), c.sesWebhook);
export default router;
