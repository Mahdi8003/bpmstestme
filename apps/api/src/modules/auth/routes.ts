import type { FastifyInstance } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import {
  changePasswordSchema,
  loginSchema,
  updateProfileSchema,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import {
  createSession,
  destroySession,
  getSession,
  hashSessionToken,
  SESSION_COOKIE,
} from '../../lib/auth.js';
import { badRequest, tooManyRequests, unauthorized } from '../../lib/errors.js';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from '../../lib/password.js';
import { hitRateLimit } from '../../lib/rate-limit.js';
import { writeAudit } from '../../lib/audit.js';
import { env } from '../../env.js';
import { authenticate, authOf } from '../../plugins/auth.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPTS_PER_ACCOUNT = 10;
const LOGIN_ATTEMPTS_PER_IP = 50;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const email = input.email.trim().toLowerCase();
    const ipKey = `login:ip:${request.ip}`;
    const accountKey = `login:account:${request.ip}:${email}`;
    const ipLimit = hitRateLimit(ipKey, LOGIN_ATTEMPTS_PER_IP, LOGIN_WINDOW_MS);
    const accountLimit = hitRateLimit(
      accountKey,
      LOGIN_ATTEMPTS_PER_ACCOUNT,
      LOGIN_WINDOW_MS,
    );
    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        ipLimit.retryAfterSeconds,
        accountLimit.retryAfterSeconds,
      );
      reply.header('Retry-After', String(retryAfter));
      throw tooManyRequests('تلاش‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.', retryAfter);
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];
    if (!user) {
      await verifyDummyPassword(input.password);
      throw unauthorized('ایمیل یا رمز عبور صحیح نیست.');
    }
    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk || !user.isActive) {
      await writeAudit(db, {
        tenantId: user.tenantId,
        actorId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        ip: request.ip,
      });
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

    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions());

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

  app.patch('/auth/me', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const input = updateProfileSchema.parse(request.body);
    const [updated] = await db
      .update(users)
      .set({
        name: input.name?.trim() || auth.user.name,
        jobTitle:
          input.jobTitle !== undefined ? input.jobTitle.trim() || null : undefined,
      })
      .where(and(eq(users.id, auth.userId), eq(users.tenantId, auth.tenantId)))
      .returning();
    if (!updated) throw unauthorized();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'auth.profile_updated',
      entityType: 'user',
      entityId: auth.userId,
      after: { name: updated.name, jobTitle: updated.jobTitle },
    });
    return {
      user: {
        ...auth.user,
        name: updated.name,
        jobTitle: updated.jobTitle,
      },
      tenant: auth.tenant,
    };
  });

  app.post('/auth/change-password', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const input = changePasswordSchema.parse(request.body);
    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.id, auth.userId), eq(users.tenantId, auth.tenantId)))
      .limit(1);
    const current = rows[0];
    if (!current || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
      throw badRequest('رمز عبور فعلی صحیح نیست.');
    }
    if (input.currentPassword === input.newPassword) {
      throw badRequest('رمز عبور جدید باید با رمز فعلی متفاوت باشد.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await db
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, auth.userId), eq(users.tenantId, auth.tenantId)));

    const currentToken = request.cookies[SESSION_COOKIE];
    if (currentToken) {
      await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, auth.userId),
            ne(sessions.tokenHash, hashSessionToken(currentToken)),
          ),
        );
    }
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: auth.userId,
      ip: request.ip,
    });
    return { ok: true };
  });
}
