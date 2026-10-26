import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSession, SESSION_COOKIE, type AuthContext } from '../lib/auth.js';
import { unauthorized } from '../lib/errors.js';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  const session = await getSession(token);
  if (!session) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    throw unauthorized('نشست شما منقضی شده است؛ دوباره وارد شوید.');
  }
  request.auth = session;
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
