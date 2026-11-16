import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { requirePermission } from '../../lib/auth.js';
import { badRequest } from '../../lib/errors.js';
import {
  createUser,
  listAuditLogs,
  listUsers,
  resetUserPassword,
  updateUser,
} from './service.js';

const auditQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
  entityType: z.string().max(60).optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/users', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageUsers');
    return listUsers(auth);
  });

  app.post('/admin/users', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageUsers');
    const input = createUserSchema.parse(request.body);
    const created = await createUser(auth, input);
    reply.code(201);
    return created;
  });

  app.patch('/admin/users/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageUsers');
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) throw badRequest('شناسهٔ کاربر معتبر نیست.');
    const input = updateUserSchema.parse(request.body);
    return updateUser(auth, parsed.data.id, input);
  });

  app.post(
    '/admin/users/:id/reset-password',
    { preHandler: authenticate },
    async (request) => {
      const auth = authOf(request);
      requirePermission(auth, 'manageUsers');
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) throw badRequest('شناسهٔ کاربر معتبر نیست.');
      const input = resetPasswordSchema.parse(request.body);
      await resetUserPassword(auth, parsed.data.id, input.newPassword);
      return { ok: true };
    },
  );

  app.get('/admin/audit', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageUsers');
    const query = auditQuerySchema.parse(request.query);
    return listAuditLogs(auth, query);
  });
}
