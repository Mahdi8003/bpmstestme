import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, authOf } from '../../plugins/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './service.js';

const querySchema = z.object({
  unread: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    return listNotifications(auth, querySchema.parse(request.query));
  });

  app.post('/notifications/read-all', { preHandler: authenticate }, async (request) => {
    return markAllNotificationsRead(authOf(request));
  });

  app.post('/notifications/:id/read', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return markNotificationRead(auth, id);
  });
}
