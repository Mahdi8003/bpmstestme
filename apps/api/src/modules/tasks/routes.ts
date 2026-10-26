import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  commentSchema,
  completeTaskSchema,
  reassignSchema,
  taskListQuerySchema,
} from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { addComment } from '../cases/service.js';
import {
  claimTask,
  completeTask,
  decideTask,
  getTaskDetail,
  listTasks,
  reassignTask,
  releaseTask,
} from './service.js';

const decisionBodySchema = z.object({
  decision: z.enum(['approve', 'reject', 'return', 'request_info']),
  comment: z.string().max(2000).optional(),
});

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tasks', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = taskListQuerySchema.parse(request.query);
    return listTasks(auth, query);
  });

  app.get('/tasks/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return getTaskDetail(auth, id);
  });

  app.post('/tasks/:id/claim', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return claimTask(auth, id);
  });

  app.post('/tasks/:id/release', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return releaseTask(auth, id);
  });

  app.post('/tasks/:id/complete', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const input = completeTaskSchema.parse(request.body ?? {});
    return completeTask(auth, id, input);
  });

  app.post('/tasks/:id/decision', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const input = decisionBodySchema.parse(request.body);
    return decideTask(auth, id, input.decision, input.comment);
  });

  app.post('/tasks/:id/reassign', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const input = reassignSchema.parse(request.body);
    return reassignTask(auth, id, input.userId, input.comment);
  });

  app.post('/tasks/:id/comments', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const { body } = commentSchema.parse(request.body);
    const detail = await getTaskDetail(auth, id);
    const comment = await addComment(auth, detail.task.caseId, body, id);
    reply.code(201);
    return comment;
  });
}
