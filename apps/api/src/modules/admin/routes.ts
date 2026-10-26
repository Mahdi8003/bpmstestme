import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUserSchema, updateUserSchema } from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { requireRole } from '../../lib/auth.js';
import { createUser, listAuditLogs, listUsers, updateUser } from './service.js';

const auditQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  entityType: z.string().optional(),
});

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/users', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requireRole(auth, ['admin']);
    return listUsers(auth);
  });

  app.post('/admin/users', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requireRole(auth, ['admin']);
    const input = createUserSchema.parse(request.body);
    const created = await createUser(auth, input);
    reply.code(201);
    return created;
  });

  app.patch('/admin/users/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requireRole(auth, ['admin']);
    const { id } = request.params as { id: string };
    const input = updateUserSchema.parse(request.body);
    return updateUser(auth, id, input);
  });

  app.get('/admin/audit', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requireRole(auth, ['admin']);
    const query = auditQuerySchema.parse(request.query);
    return listAuditLogs(auth, query);
  });
}
