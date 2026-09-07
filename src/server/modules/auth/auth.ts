import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/index.js';

export type AuthTokenPayload = {
  sub: string;
  username: string;
  role: Role;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

type LoginBody = { username: string; password: string };

const publicUserSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  preferredLanguage: true,
  phoneNumber: true,
} as const;

function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('access_token', token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: config.sessionCookieMaxAgeSeconds,
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولاً.', messageEn: 'Authentication is required.' },
    });
  }
}

export function requireRoles(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user || !roles.includes(request.user.role)) {
      await reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', messageEn: 'You do not have permission to perform this action.' },
      });
    }
  };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginBody }>('/login', {
    preHandler: [app.rateLimit.login],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: { username: { type: 'string', minLength: 1, maxLength: 50 }, password: { type: 'string', minLength: 1, maxLength: 200 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { username: request.body.username }, select: { ...publicUserSelect, passwordHash: true, isActive: true } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, request.body.password))) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة.', messageEn: 'Invalid username or password.' },
      });
    }

    const token = await app.jwt.sign({ sub: user.id, username: user.username, role: user.role as Role }, { expiresIn: config.jwtExpiresIn });
    setAuthCookie(reply, token);
    const { passwordHash: _passwordHash, isActive: _isActive, ...safeUser } = user;
    return reply.send({ success: true, data: { user: safeUser } });
  });

  app.post('/logout', async (_request, reply) => {
    return reply.clearCookie('access_token', { path: '/' }).send({ success: true, data: null });
  });

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub }, select: publicUserSelect });
    if (!user) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'الحساب غير موجود.', messageEn: 'Account not found.' } });
    return reply.send({ success: true, data: { user } });
  });
};

export default authRoutes;
