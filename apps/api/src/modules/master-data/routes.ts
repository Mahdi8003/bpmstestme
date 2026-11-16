import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  masterDataRecordSchema,
  masterDataTypeSchema,
  masterDataTypeUpdateSchema,
} from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { requirePermission } from '../../lib/auth.js';
import {
  createMasterDataRecord,
  createMasterDataType,
  deleteMasterDataRecord,
  deleteMasterDataType,
  deleteSystemDataRecord,
  duplicateMasterDataRecord,
  getMasterDataType,
  getMasterOptions,
  listItems,
  listMasterDataRecords,
  listMasterDataTypes,
  listParties,
  listStockMovements,
  listWarehouses,
  updateMasterDataRecord,
  updateMasterDataType,
  updateSystemDataRecord,
} from './service.js';

const partyQuerySchema = z.object({
  kind: z.enum(['customer', 'supplier']).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

const itemQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

const movementQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
});

const masterRecordQuerySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().min(1).max(2000).optional().default(200),
  offset: z.coerce.number().min(0).optional().default(0),
});

const typeParamsSchema = z.object({ id: z.string().uuid() });
const recordParamsSchema = z.object({ id: z.string().uuid(), recordId: z.string().uuid() });
const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerMasterDataRoutes(app: FastifyInstance): Promise<void> {
  app.get('/master/options', { preHandler: authenticate }, async (request) => {
    return getMasterOptions(authOf(request));
  });

  app.get('/master/types', { preHandler: authenticate }, async (request) => {
    return listMasterDataTypes(authOf(request));
  });

  app.post('/master/types', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const input = masterDataTypeSchema.parse(request.body);
    const created = await createMasterDataType(auth, input);
    reply.code(201);
    return created;
  });

  app.get('/master/types/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = typeParamsSchema.parse(request.params);
    return getMasterDataType(auth, id);
  });

  app.patch('/master/types/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const { id } = typeParamsSchema.parse(request.params);
    const input = masterDataTypeUpdateSchema.parse(request.body);
    return updateMasterDataType(auth, id, input);
  });

  app.delete('/master/types/:id', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const { id } = typeParamsSchema.parse(request.params);
    await deleteMasterDataType(auth, id);
    reply.code(204);
    return null;
  });

  app.get('/master/types/:id/records', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = typeParamsSchema.parse(request.params);
    const query = masterRecordQuerySchema.parse(request.query);
    return listMasterDataRecords(auth, id, query);
  });

  app.post('/master/types/:id/records', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const { id } = typeParamsSchema.parse(request.params);
    const input = masterDataRecordSchema.parse(request.body);
    const created = await createMasterDataRecord(auth, id, input);
    reply.code(201);
    return created;
  });

  app.patch(
    '/master/types/:id/records/:recordId',
    { preHandler: authenticate },
    async (request) => {
      const auth = authOf(request);
      requirePermission(auth, 'manageMasterData');
      const { id, recordId } = recordParamsSchema.parse(request.params);
      const input = masterDataRecordSchema.parse(request.body);
      return updateSystemDataRecord(auth, id, recordId, input);
    },
  );

  app.post(
    '/master/types/:id/records/:recordId/duplicate',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = authOf(request);
      requirePermission(auth, 'manageMasterData');
      const { id, recordId } = recordParamsSchema.parse(request.params);
      const created = await duplicateMasterDataRecord(auth, id, recordId);
      reply.code(201);
      return created;
    },
  );

  app.patch('/master/records/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const { id } = idParamsSchema.parse(request.params);
    const input = masterDataRecordSchema.parse(request.body);
    return updateMasterDataRecord(auth, id, input);
  });

  app.delete(
    '/master/types/:id/records/:recordId',
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = authOf(request);
      requirePermission(auth, 'manageMasterData');
      const { id, recordId } = recordParamsSchema.parse(request.params);
      await deleteSystemDataRecord(auth, id, recordId);
      reply.code(204);
      return null;
    },
  );

  app.delete('/master/records/:id', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requirePermission(auth, 'manageMasterData');
    const { id } = idParamsSchema.parse(request.params);
    await deleteMasterDataRecord(auth, id);
    reply.code(204);
    return null;
  });

  app.get('/parties', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = partyQuerySchema.parse(request.query);
    return listParties(auth, query);
  });

  app.get('/items', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = itemQuerySchema.parse(request.query);
    return listItems(auth, query);
  });

  app.get('/warehouses', { preHandler: authenticate }, async (request) => {
    return listWarehouses(authOf(request));
  });

  app.get('/stock/movements', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = movementQuerySchema.parse(request.query);
    return listStockMovements(auth, query);
  });
}
