import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  caseTypeDefinitionSchema,
  createCaseTypeSchema,
  updateCaseTypeSchema,
} from '@ravand/shared';
import { assertCanBuild, canBuild } from '../../lib/auth.js';
import { authenticate, authOf } from '../../plugins/auth.js';
import {
  archiveCaseType,
  createCaseType,
  duplicateCaseType,
  getCaseType,
  healthCheck,
  listCaseTypes,
  listTemplates,
  publishCaseType,
  updateCaseType,
} from './service.js';

const healthBodySchema = z.object({
  definition: caseTypeDefinitionSchema.optional(),
});

export async function registerCaseTypeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/case-types', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const types = await listCaseTypes(auth);
    return canBuild(auth) ? types : types.filter((type) => type.status === 'published');
  });

  app.get('/case-types/templates', { preHandler: authenticate }, async (request) => {
    assertCanBuild(authOf(request));
    return listTemplates();
  });

  app.get('/case-types/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return getCaseType(auth, id);
  });

  app.post('/case-types', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    assertCanBuild(auth);
    const input = createCaseTypeSchema.parse(request.body);
    const created = await createCaseType(auth, input);
    reply.code(201);
    return created;
  });

  app.put('/case-types/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    assertCanBuild(auth);
    const { id } = request.params as { id: string };
    const input = updateCaseTypeSchema.parse(request.body);
    return updateCaseType(auth, id, input);
  });

  app.post(
    '/case-types/:id/health-check',
    { preHandler: authenticate },
    async (request) => {
      const auth = authOf(request);
      assertCanBuild(auth);
      const { id } = request.params as { id: string };
      const body = healthBodySchema.parse(request.body ?? {});
      return healthCheck(auth, id, body.definition);
    },
  );

  app.post(
    '/case-types/:id/publish',
    { preHandler: authenticate },
    async (request) => {
      const auth = authOf(request);
      assertCanBuild(auth);
      const { id } = request.params as { id: string };
      return publishCaseType(auth, id);
    },
  );

  app.post(
    '/case-types/:id/duplicate',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = authOf(request);
      assertCanBuild(auth);
      const { id } = request.params as { id: string };
      const copy = await duplicateCaseType(auth, id);
      reply.code(201);
      return copy;
    },
  );

  app.post(
    '/case-types/:id/archive',
    { preHandler: authenticate },
    async (request) => {
      const auth = authOf(request);
      assertCanBuild(auth);
      const { id } = request.params as { id: string };
      return archiveCaseType(auth, id);
    },
  );
}
