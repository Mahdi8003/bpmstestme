import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AuthSession, RoleKey } from '@ravand/shared';
import { db } from '../db/client.js';
import { sessions, tenants, users } from '../db/schema.js';
import { AppError, forbidden, unauthorized } from './errors.js';

export const SESSION_COOKIE = 'ravand_session';
const SESSION_DAYS = 7;

export interface AuthContext extends AuthSession {
  userId: string;
  tenantId: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, tenantId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    tenantId,
    expiresAt,
  });
  return token;
}

export async function getSession(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      email: users.email,
      role: users.role,
      jobTitle: users.jobTitle,
      avatarColor: users.avatarColor,
      isActive: users.isActive,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  return {
    userId: row.userId,
    tenantId: row.tenantId,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.email,
      role: row.role,
      jobTitle: row.jobTitle,
      avatarColor: row.avatarColor,
    },
    tenant: {
      id: row.tenantId,
      name: row.tenantName,
      slug: row.tenantSlug,
    },
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export function assertAuthenticated(
  auth: AuthContext | null | undefined,
): asserts auth is AuthContext {
  if (!auth) throw unauthorized();
}

export function requireRole(auth: AuthContext, roles: RoleKey[]): void {
  if (auth.user.role === 'admin') return;
  if (!roles.includes(auth.user.role)) {
    throw forbidden();
  }
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.user.role === 'admin';
}

export function canBuild(auth: AuthContext): boolean {
  return ['admin', 'builder', 'manager'].includes(auth.user.role);
}

export function assertCanBuild(auth: AuthContext): void {
  if (!canBuild(auth)) {
    throw new AppError(403, 'تنها مالک فرآیند یا مدیر سیستم می‌تواند فرآیند بسازد.', 'FORBIDDEN');
  }
}
