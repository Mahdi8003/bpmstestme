import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  caseListQuerySchema,
  commentSchema,
  createCaseSchema,
  updateCaseDataSchema,
} from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { badRequest } from '../../lib/errors.js';
import { openStoredFile, saveUpload } from '../../lib/files.js';
import {
  addComment,
  addDocument,
  cancelCase,
  createCase,
  getCaseDetail,
  getDocumentForDownload,
  listCases,
  updateCaseData,
} from './service.js';

const cancelSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/cases', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = caseListQuerySchema.parse(request.query);
    return listCases(auth, query);
  });

  app.post('/cases', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const input = createCaseSchema.parse(request.body);
    const created = await createCase(auth, input);
    reply.code(201);
    return created;
  });

  app.get('/cases/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    return getCaseDetail(auth, id);
  });

  app.patch('/cases/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const input = updateCaseDataSchema.parse(request.body);
    return updateCaseData(auth, id, input);
  });

  app.post('/cases/:id/comments', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const { body } = commentSchema.parse(request.body);
    const comment = await addComment(auth, id, body);
    reply.code(201);
    return comment;
  });

  app.post('/cases/:id/cancel', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const input = cancelSchema.parse(request.body ?? {});
    return cancelCase(auth, id, input.reason);
  });

  app.post('/cases/:id/documents', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const query = request.query as { documentKey?: string; taskId?: string };
    const file = await request.file();
    if (!file) throw badRequest('فایلی برای بارگذاری انتخاب نشده است.');
    const buffer = await file.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) {
      throw badRequest('حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.');
    }
    if (!buffer.length) throw badRequest('فایل خالی است.');
    const saved = await saveUpload({
      tenantId: auth.tenantId,
      caseId: id,
      fileName: file.filename,
      data: buffer,
    });
    const document = await addDocument(auth, id, {
      name: saved.name,
      documentKey: query.documentKey ?? null,
      mimeType: file.mimetype,
      size: saved.size,
      storagePath: saved.storagePath,
      taskId: query.taskId ?? null,
    });
    reply.code(201);
    return document;
  });

  app.get('/documents/:id/download', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id } = request.params as { id: string };
    const document = await getDocumentForDownload(auth, id);
    const stream = openStoredFile(document.storagePath);
    if (!stream) throw badRequest('فایل روی سرور پیدا نشد.');
    reply.header('Content-Type', document.mimeType);
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    );
    return reply.send(stream);
  });
}
