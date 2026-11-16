import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRoleSchema, updateRoleSchema } from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { requirePermission } from '../../lib/auth.js';
import { badRequest } from '../../lib/errors.js';
import {
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} from './service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerRoleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/roles', { preHandler: authenticate }, async (request) => {
    return listRoles(authOf(request));
  });

  app.post('/roles', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageRoles');
    const input = createRoleSchema.parse(request.body);
    const created = await createRole(auth, input);
    reply.code(201);
    return created;
  });

  app.patch('/roles/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageRoles');
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) throw badRequest('شناسهٔ نقش معتبر نیست.');
    const input = updateRoleSchema.parse(request.body);
    return updateRole(auth, parsed.data.id, input);
  });

  app.delete('/roles/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageRoles');
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) throw badRequest('شناسهٔ نقش معتبر نیست.');
    return deleteRole(auth, parsed.data.id);
  });
}
