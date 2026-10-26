import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { ItemDto, PartyDto, UserSummary, WarehouseDto } from '@ravand/shared';
import { db } from '../../db/client.js';
import {
  items,
  parties,
  stockMovements,
  users,
  warehouses,
} from '../../db/schema.js';
import { writeAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../lib/auth.js';

function partyDto(row: typeof parties.$inferSelect): PartyDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    code: row.code,
    email: row.email,
    phone: row.phone,
    taxId: row.taxId,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
  };
}

function itemDto(
  row: typeof items.$inferSelect,
  stock?: number,
): ItemDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    category: row.category,
    unitCost: Number(row.unitCost),
    reorderPoint: Number(row.reorderPoint),
    active: row.active,
    stock: stock ?? undefined,
  };
}

function warehouseDto(row: typeof warehouses.$inferSelect): WarehouseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
  };
}

export async function listParties(
  auth: AuthContext,
  query: { kind?: 'customer' | 'supplier'; q?: string; limit: number },
): Promise<PartyDto[]> {
  const conditions = [eq(parties.tenantId, auth.tenantId)];
  if (query.kind) conditions.push(eq(parties.kind, query.kind));
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    const search = or(ilike(parties.name, term), ilike(parties.code, term));
    if (search) conditions.push(search);
  }
  const rows = await db
    .select()
    .from(parties)
    .where(and(...conditions))
    .orderBy(desc(parties.createdAt))
    .limit(query.limit);
  return rows.map(partyDto);
}

export async function createParty(
  auth: AuthContext,
  input: {
    kind: 'customer' | 'supplier';
    name: string;
    code: string;
    email?: string;
    phone?: string;
    taxId?: string;
    address?: string;
  },
): Promise<PartyDto> {
  const existing = await db
    .select({ id: parties.id })
    .from(parties)
    .where(
      and(eq(parties.tenantId, auth.tenantId), eq(parties.code, input.code.trim())),
    )
    .limit(1);
  if (existing[0]) throw conflict('کد طرف حساب قبلاً ثبت شده است.');
  const [created] = await db
    .insert(parties)
    .values({
      tenantId: auth.tenantId,
      kind: input.kind,
      name: input.name.trim(),
      code: input.code.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      taxId: input.taxId?.trim() || null,
      address: input.address?.trim() || null,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'party.created',
    entityType: 'party',
    entityId: created.id,
    after: { name: created.name, code: created.code },
  });
  return partyDto(created);
}

export async function updateParty(
  auth: AuthContext,
  id: string,
  input: {
    kind?: 'customer' | 'supplier';
    name?: string;
    code?: string;
    email?: string;
    phone?: string;
    taxId?: string;
    address?: string;
  },
): Promise<PartyDto> {
  const rows = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, id), eq(parties.tenantId, auth.tenantId)))
    .limit(1);
  const current = rows[0];
  if (!current) throw notFound('طرف حساب پیدا نشد.');
  if (input.code && input.code.trim() !== current.code) {
    const duplicate = await db
      .select({ id: parties.id })
      .from(parties)
      .where(
        and(eq(parties.tenantId, auth.tenantId), eq(parties.code, input.code.trim())),
      )
      .limit(1);
    if (duplicate[0]) throw conflict('کد طرف حساب قبلاً ثبت شده است.');
  }
  const [updated] = await db
    .update(parties)
    .set({
      kind: input.kind ?? current.kind,
      name: input.name?.trim() ?? current.name,
      code: input.code?.trim() ?? current.code,
      email: input.email !== undefined ? input.email.trim() || null : current.email,
      phone: input.phone !== undefined ? input.phone.trim() || null : current.phone,
      taxId: input.taxId !== undefined ? input.taxId.trim() || null : current.taxId,
      address: input.address !== undefined ? input.address.trim() || null : current.address,
    })
    .where(and(eq(parties.id, id), eq(parties.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'party.updated',
    entityType: 'party',
    entityId: id,
    before: { name: current.name, code: current.code },
    after: { name: updated.name, code: updated.code },
  });
  return partyDto(updated);
}

export async function listItems(
  auth: AuthContext,
  query: { q?: string; limit: number },
): Promise<ItemDto[]> {
  const conditions = [eq(items.tenantId, auth.tenantId)];
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    const search = or(ilike(items.name, term), ilike(items.sku, term));
    if (search) conditions.push(search);
  }
  const rows = await db
    .select({
      item: items,
      stock: sql<number>`coalesce((select sum(case when ${stockMovements.type} = 'out' then -${stockMovements.quantity} else ${stockMovements.quantity} end) from ${stockMovements} where ${stockMovements.itemId} = ${items.id} and ${stockMovements.tenantId} = ${items.tenantId}), 0)::float`,
    })
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.createdAt))
    .limit(query.limit);
  return rows.map((row) => itemDto(row.item, Number(row.stock ?? 0)));
}

export async function createItem(
  auth: AuthContext,
  input: {
    sku: string;
    name: string;
    unit: string;
    category?: string;
    unitCost: number;
    reorderPoint: number;
  },
): Promise<ItemDto> {
  const existing = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.tenantId, auth.tenantId), eq(items.sku, input.sku.trim())))
    .limit(1);
  if (existing[0]) throw conflict('کد کالا قبلاً ثبت شده است.');
  const [created] = await db
    .insert(items)
    .values({
      tenantId: auth.tenantId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      unit: input.unit.trim(),
      category: input.category?.trim() || null,
      unitCost: String(input.unitCost),
      reorderPoint: String(input.reorderPoint),
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'item.created',
    entityType: 'item',
    entityId: created.id,
    after: { name: created.name, sku: created.sku },
  });
  return itemDto(created, 0);
}

export async function updateItem(
  auth: AuthContext,
  id: string,
  input: {
    sku?: string;
    name?: string;
    unit?: string;
    category?: string;
    unitCost?: number;
    reorderPoint?: number;
    active?: boolean;
  },
): Promise<ItemDto> {
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.tenantId, auth.tenantId)))
    .limit(1);
  const current = rows[0];
  if (!current) throw notFound('کالا پیدا نشد.');
  if (input.sku && input.sku.trim() !== current.sku) {
    const duplicate = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.tenantId, auth.tenantId), eq(items.sku, input.sku.trim())))
      .limit(1);
    if (duplicate[0]) throw conflict('کد کالا قبلاً ثبت شده است.');
  }
  const [updated] = await db
    .update(items)
    .set({
      sku: input.sku?.trim() ?? current.sku,
      name: input.name?.trim() ?? current.name,
      unit: input.unit?.trim() ?? current.unit,
      category: input.category !== undefined ? input.category.trim() || null : current.category,
      unitCost: input.unitCost !== undefined ? String(input.unitCost) : current.unitCost,
      reorderPoint:
        input.reorderPoint !== undefined ? String(input.reorderPoint) : current.reorderPoint,
      active: input.active ?? current.active,
    })
    .where(and(eq(items.id, id), eq(items.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'item.updated',
    entityType: 'item',
    entityId: id,
    before: { sku: current.sku, name: current.name },
    after: { sku: updated.sku, name: updated.name },
  });
  return itemDto(updated);
}

export async function listWarehouses(auth: AuthContext): Promise<WarehouseDto[]> {
  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.tenantId, auth.tenantId))
    .orderBy(warehouses.name);
  return rows.map(warehouseDto);
}

export async function createWarehouse(
  auth: AuthContext,
  input: { code: string; name: string; location?: string },
): Promise<WarehouseDto> {
  const existing = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenantId, auth.tenantId),
        eq(warehouses.code, input.code.trim()),
      ),
    )
    .limit(1);
  if (existing[0]) throw conflict('کد انبار قبلاً ثبت شده است.');
  const [created] = await db
    .insert(warehouses)
    .values({
      tenantId: auth.tenantId,
      code: input.code.trim(),
      name: input.name.trim(),
      location: input.location?.trim() || null,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'warehouse.created',
    entityType: 'warehouse',
    entityId: created.id,
    after: { name: created.name, code: created.code },
  });
  return warehouseDto(created);
}

export async function listStockMovements(
  auth: AuthContext,
  query: { itemId?: string; warehouseId?: string; limit: number },
): Promise<
  {
    id: string;
    itemId: string;
    itemName: string;
    warehouseId: string;
    warehouseName: string;
    type: 'in' | 'out' | 'adjust';
    quantity: number;
    reference: string | null;
    note: string | null;
    createdByName: string | null;
    createdAt: string;
  }[]
> {
  const conditions = [eq(stockMovements.tenantId, auth.tenantId)];
  if (query.itemId) conditions.push(eq(stockMovements.itemId, query.itemId));
  if (query.warehouseId) conditions.push(eq(stockMovements.warehouseId, query.warehouseId));
  const rows = await db
    .select({
      movement: stockMovements,
      itemName: items.name,
      warehouseName: warehouses.name,
      createdByName: users.name,
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(query.limit);
  return rows.map(({ movement, itemName, warehouseName, createdByName }) => ({
    id: movement.id,
    itemId: movement.itemId,
    itemName,
    warehouseId: movement.warehouseId,
    warehouseName,
    type: movement.type,
    quantity: Number(movement.quantity),
    reference: movement.reference,
    note: movement.note,
    createdByName,
    createdAt: movement.createdAt.toISOString(),
  }));
}

export async function createStockMovement(
  auth: AuthContext,
  input: {
    itemId: string;
    warehouseId: string;
    type: 'in' | 'out' | 'adjust';
    quantity: number;
    reference?: string;
    note?: string;
  },
): Promise<void> {
  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, input.itemId), eq(items.tenantId, auth.tenantId)))
    .limit(1);
  if (!item) throw notFound('کالا پیدا نشد.');
  const [warehouse] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.id, input.warehouseId),
        eq(warehouses.tenantId, auth.tenantId),
      ),
    )
    .limit(1);
  if (!warehouse) throw notFound('انبار پیدا نشد.');
  const [created] = await db
    .insert(stockMovements)
    .values({
      tenantId: auth.tenantId,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: String(input.quantity),
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      createdBy: auth.userId,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'stock.movement_created',
    entityType: 'stock_movement',
    entityId: created.id,
    after: {
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: input.quantity,
    },
  });
}

export async function listUserOptions(auth: AuthContext): Promise<UserSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      jobTitle: users.jobTitle,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(and(eq(users.tenantId, auth.tenantId), eq(users.isActive, true)))
    .orderBy(users.name);
  return rows;
}

export async function getMasterOptions(auth: AuthContext): Promise<{
  parties: PartyDto[];
  items: ItemDto[];
  warehouses: WarehouseDto[];
  users: UserSummary[];
}> {
  const [partyList, itemList, warehouseList, userList] = await Promise.all([
    listParties(auth, { limit: 200 }),
    listItems(auth, { limit: 200 }),
    listWarehouses(auth),
    listUserOptions(auth),
  ]);
  return { parties: partyList, items: itemList, warehouses: warehouseList, users: userList };
}
