import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authOf } from '../../plugins/auth.js';
import { search } from './service.js';

const querySchema = z.object({ q: z.string().optional().default('') });

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { q } = querySchema.parse(request.query);
    return search(auth, q);
  });
}
