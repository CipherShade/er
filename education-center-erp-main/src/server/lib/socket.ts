import { Server, Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { Role } from '../../shared/constants/index.js';
import { config } from '../config/index.js';
import { extractCookieHeader, unsignCookieValue } from './security.js';
import type { AuthTokenPayload } from '../modules/auth/auth.js';

const ACCESS_TOKEN_COOKIE = 'access_token';
const LOBBY_ROOM = 'center:lobby';
const LOBBY_STAFF_ROLES: Role[] = [Role.ADMIN, Role.RECEPTIONIST];

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export type LobbyAttendanceEvent = {
  sessionId: string;
  studentId: string;
  studentName: string;
  deskIdentifier: string;
  paymentMethod: string;
  newLobbyCount: number;
  timestamp: Date;
};

export function buildLobbyAttendancePayload(event: LobbyAttendanceEvent) {
  return {
    ...event,
    timestamp: event.timestamp.toISOString(),
  };
}

/** Reject unauthenticated socket connections; require a valid staff JWT. */
export function createSocketAuthMiddleware(app: FastifyInstance) {
  return async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const handshakeAuth = socket.handshake.auth as { token?: string } | undefined;
      let token: string | undefined = handshakeAuth?.token;

      if (!token) {
        const cookieHeader = socket.handshake.headers.cookie;
        const signedValue = extractCookieHeader(cookieHeader, ACCESS_TOKEN_COOKIE);
        if (signedValue) {
          token = unsignCookieValue(signedValue, config.cookieSecret) ?? undefined;
        }
      }

      if (!token) return next(new Error('unauthorized'));

      const payload = await app.jwt.verify<AuthTokenPayload>(token);
      if (!payload || !payload.sub || !LOBBY_STAFF_ROLES.includes(payload.role)) {
        return next(new Error('forbidden'));
      }

      socket.data.user = { sub: payload.sub, username: payload.username, role: payload.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  };
}

export function attachSocketServer(app: FastifyInstance, io: Server) {
  io.use(createSocketAuthMiddleware(app));

  io.on('connection', (socket) => {
    socket.on('join:lobby', async () => {
      const user = socket.data.user as AuthTokenPayload | undefined;
      if (!user || !LOBBY_STAFF_ROLES.includes(user.role)) {
        socket.emit('lobby:denied', { code: 'FORBIDDEN', message: 'ليس لديك صلاحية لمشاهدة لوحة الاستقبال.', messageEn: 'You do not have permission to view the lobby.' });
        return;
      }
      await socket.join(LOBBY_ROOM);
      socket.emit('lobby:joined', { room: LOBBY_ROOM, joinedAt: new Date().toISOString() });
    });

    socket.on('leave:lobby', async () => {
      await socket.leave(LOBBY_ROOM);
      socket.emit('lobby:left', { room: LOBBY_ROOM, leftAt: new Date().toISOString() });
    });
  });

  app.decorate('io', io);
}