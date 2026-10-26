import type { FastifyInstance } from 'fastify';
import { authenticate, authOf } from '../../plugins/auth.js';
import { getDashboard } from './service.js';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', { preHandler: authenticate }, async (request) => {
    return getDashboard(authOf(request));
  });
}
