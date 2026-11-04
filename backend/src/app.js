import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import crypto from 'node:crypto';
import config from './config/environment.js';
import logger from './config/logger.js';
import { checkDatabase } from './config/database.js';
import { checkRedis } from './config/redis.js';
import { apiLimiter } from './middleware/rateLimitMiddleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';

import authRoutes from './modules/auth/auth.routes.js';
import accountRoutes from './modules/account/account.routes.js';
import salesIdRoutes from './modules/sales-ids/salesId.routes.js';
import sharingRoutes from './modules/sharing/sharing.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import leadRoutes from './modules/leads/leads.routes.js';
import contactRoutes from './modules/contacts/contacts.routes.js';
import companyRoutes from './modules/companies/companies.routes.js';
import { dealRoutes, pipelineRoutes } from './modules/deals/deals.routes.js';
import taskRoutes from './modules/tasks/tasks.routes.js';
import { noteRoutes, activityRoutes } from './modules/notes-activities/notes.routes.js';
import tagRoutes from './modules/tags/tags.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import smtpRoutes from './modules/smtp-accounts/smtpAccounts.routes.js';
import emailListRoutes from './modules/email-lists/emailLists.routes.js';
import templateRoutes from './modules/templates/templates.routes.js';
import suppressionRoutes from './modules/suppressions/suppressions.routes.js';
import campaignRoutes from './modules/campaign/campaign.routes.js';
import automationRoutes from './modules/automations/automations.routes.js';
import trackingRoutes from './modules/tracking/tracking.routes.js';

// Each module owns its router; app.js only mounts them.
const MODULES = [
  ['/auth', authRoutes],
  ['/account', accountRoutes],
  ['/sales-ids', salesIdRoutes],
  ['/records', sharingRoutes],
  ['/audit-logs', auditRoutes],
  ['/dashboard', dashboardRoutes],
  ['/leads', leadRoutes],
  ['/contacts', contactRoutes],
  ['/companies', companyRoutes],
  ['/deals', dealRoutes],
  ['/pipelines', pipelineRoutes],
  ['/tasks', taskRoutes],
  ['/notes', noteRoutes],
  ['/activities', activityRoutes],
  ['/tags', tagRoutes],
  ['/notifications', notificationRoutes],
  ['/reports', reportRoutes],
  ['/smtp-accounts', smtpRoutes],
  ['/email-lists', emailListRoutes],
  ['/templates', templateRoutes],
  ['/suppressions', suppressionRoutes],
  ['/campaigns', campaignRoutes],
  ['/automations', automationRoutes],
];

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] && /^[\w-]{8,64}$/.test(req.headers['x-request-id']) ? req.headers['x-request-id'] : crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Sales-Id', 'X-Requested-With', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // Liveness: the process is up. Readiness: dependencies answer.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    const checks = {};
    try {
      await checkDatabase();
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    try {
      checks.redis = await checkRedis();
    } catch {
      checks.redis = 'down';
    }
    const ready = checks.database === 'ok' && checks.redis !== 'down';
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
  });

  // Public tracking, unsubscribe and provider webhooks (no login).
  app.use(trackingRoutes);

  const api = express.Router();
  api.use(apiLimiter);
  for (const [path, router] of MODULES) api.use(path, router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export default createApp;
