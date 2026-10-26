import type { FastifyInstance } from 'fastify';
import { authenticate, authOf } from '../../plugins/auth.js';
import { getInsights } from './service.js';

export async function registerInsightRoutes(app: FastifyInstance): Promise<void> {
  app.get('/insights', { preHandler: authenticate }, async (request) => {
    return getInsights(authOf(request));
  });
}
