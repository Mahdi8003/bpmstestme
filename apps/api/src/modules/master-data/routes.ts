import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  itemSchema,
  partySchema,
  stockMovementSchema,
  warehouseSchema,
} from '@ravand/shared';
import { authenticate, authOf } from '../../plugins/auth.js';
import { requireRole } from '../../lib/auth.js';
import {
  createItem,
  createParty,
  createStockMovement,
  createWarehouse,
  getMasterOptions,
  listItems,
  listParties,
  listStockMovements,
  listWarehouses,
  updateItem,
  updateParty,
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

const partyUpdateSchema = partySchema.partial();
const itemUpdateSchema = itemSchema.partial();

export async function registerMasterDataRoutes(app: FastifyInstance): Promise<void> {
  app.get('/master/options', { preHandler: authenticate }, async (request) => {
    return getMasterOptions(authOf(request));
  });

  app.get('/parties', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = partyQuerySchema.parse(request.query);
    return listParties(auth, query);
  });

  app.post('/parties', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'builder', 'manager', 'procurement']);
    const input = partySchema.parse(request.body);
    const created = await createParty(auth, input);
    reply.code(201);
    return created;
  });

  app.patch('/parties/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'builder', 'manager', 'procurement']);
    const { id } = request.params as { id: string };
    return updateParty(auth, id, partyUpdateSchema.parse(request.body));
  });

  app.get('/items', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = itemQuerySchema.parse(request.query);
    return listItems(auth, query);
  });

  app.post('/items', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'builder', 'manager', 'procurement', 'warehouse']);
    const input = itemSchema.parse(request.body);
    const created = await createItem(auth, input);
    reply.code(201);
    return created;
  });

  app.patch('/items/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'builder', 'manager', 'procurement', 'warehouse']);
    const { id } = request.params as { id: string };
    return updateItem(auth, id, itemUpdateSchema.parse(request.body));
  });

  app.get('/warehouses', { preHandler: authenticate }, async (request) => {
    return listWarehouses(authOf(request));
  });

  app.post('/warehouses', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'builder', 'manager', 'warehouse']);
    const input = warehouseSchema.parse(request.body);
    const created = await createWarehouse(auth, input);
    reply.code(201);
    return created;
  });

  app.get('/stock/movements', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = movementQuerySchema.parse(request.query);
    return listStockMovements(auth, query);
  });

  app.post('/stock/movements', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    requireRole(auth, ['admin', 'manager', 'warehouse']);
    const input = stockMovementSchema.parse(request.body);
    await createStockMovement(auth, input);
    reply.code(201);
    return { ok: true };
  });
}
