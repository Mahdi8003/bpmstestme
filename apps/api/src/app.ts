import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './env.js';
import { AppError } from './lib/errors.js';
import { closeDb } from './db/client.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerCaseTypeRoutes } from './modules/case-types/routes.js';
import { registerCaseRoutes } from './modules/cases/routes.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import { registerInsightRoutes } from './modules/insights/routes.js';
import { registerMasterDataRoutes } from './modules/master-data/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerSearchRoutes } from './modules/search/routes.js';
import { registerTaskRoutes } from './modules/tasks/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : true,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'اطلاعات ورودی کامل یا معتبر نیست.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }
    const fastifyError = error as {
      code?: string;
      validation?: unknown;
      statusCode?: number;
      message: string;
    };
    if (fastifyError.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({
        code: 'FILE_TOO_LARGE',
        message: 'حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.',
      });
    }
    if (fastifyError.validation) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'اطلاعات ورودی معتبر نیست.',
        details: fastifyError.validation,
      });
    }
    const statusCode = fastifyError.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }
    return reply.status(statusCode).send({
      code: statusCode >= 500 ? 'INTERNAL_ERROR' : (fastifyError.code ?? 'REQUEST_ERROR'),
      message:
        statusCode >= 500
          ? 'خطای پیش‌بینی‌نشده‌ای رخ داد. لطفاً دوباره تلاش کنید.'
          : fastifyError.message,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'مسیر درخواستی پیدا نشد.',
    });
  });

  app.get('/api/health', async () => ({
    ok: true,
    name: 'ravand-api',
    time: new Date().toISOString(),
  }));

  await app.register(
    async (api) => {
      await registerAuthRoutes(api);
      await registerCaseTypeRoutes(api);
      await registerCaseRoutes(api);
      await registerTaskRoutes(api);
      await registerDashboardRoutes(api);
      await registerInsightRoutes(api);
      await registerMasterDataRoutes(api);
      await registerNotificationRoutes(api);
      await registerAdminRoutes(api);
      await registerSearchRoutes(api);
    },
    { prefix: '/api' },
  );

  app.addHook('onClose', async () => {
    await closeDb();
  });

  return app;
}
