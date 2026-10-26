import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { loginSchema } from '@ravand/shared';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import {
  createSession,
  destroySession,
  getSession,
  SESSION_COOKIE,
} from '../../lib/auth.js';
import { unauthorized } from '../../lib/errors.js';
import { verifyPassword } from '../../lib/password.js';
import { writeAudit } from '../../lib/audit.js';
import { env } from '../../env.js';
import { authenticate, authOf } from '../../plugins/auth.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const email = input.email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw unauthorized('ایمیل یا رمز عبور صحیح نیست.');
    }

    const token = await createSession(user.id, user.tenantId);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await writeAudit(db, {
      tenantId: user.tenantId,
      actorId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip: request.ip,
    });

    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    const session = await getSession(token);
    if (!session) throw unauthorized();
    return session;
  });

  app.post('/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const token = request.cookies[SESSION_COOKIE];
    await destroySession(token);
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: auth.userId,
      ip: request.ip,
    });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    return { user: auth.user, tenant: auth.tenant };
  });
}
