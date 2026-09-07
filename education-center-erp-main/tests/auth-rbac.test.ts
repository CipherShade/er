import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '../src/shared/constants/index.js';
import { createTestApp, signToken, tokens, authHeaders, errorCode, validUUID } from './helpers.js';

describe('AUTHENTICATION via HTTP guards (no DB required)', () => {
  test('protected endpoint without a token returns 401 UNAUTHORIZED', async () => {
    const app = await createTestApp();
    const paths = [
      '/api/management/rooms',
      '/api/registry/students',
      '/api/shifts/current',
      '/api/attendances/sessions/active',
      '/api/reports/daily',
    ];
    for (const url of paths) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 401, `${url} should require auth`);
      assert.equal(errorCode(res.body), 'UNAUTHORIZED');
    }
    await app.close();
  });

  test('a malformed JWT returns 401 UNAUTHORIZED', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/management/rooms', headers: { authorization: 'Bearer not-a-real-jwt' } });
    assert.equal(res.statusCode, 401);
    assert.equal(errorCode(res.body), 'UNAUTHORIZED');
    await app.close();
  });

  test('an expired JWT returns 401 UNAUTHORIZED', async () => {
    const app = await createTestApp();
    const expired = app.jwt.sign({
      sub: 'x',
      username: 'x',
      role: Role.ADMIN,
      exp: Math.floor(Date.now() / 1000) - 10,
    } as never);
    const res = await app.inject({ method: 'GET', url: '/api/management/rooms', headers: { authorization: `Bearer ${expired}` } });
    assert.equal(res.statusCode, 401);
    assert.equal(errorCode(res.body), 'UNAUTHORIZED');
    await app.close();
  });

  test('unknown user id still passes verification at the auth preHandler layer', async () => {
    // The preHandler only verifies the JWT; the 404 for a missing account
    // happens in the handler (DB). We only assert the guard layer permits it.
    const app = await createTestApp();
    const token = signToken(app, { sub: validUUID('deadbeef-0000-0000-0000-000000000000'), username: 'ghost', role: Role.ADMIN });
    const res = await app.inject({ method: 'GET', url: '/api/management/rooms', headers: authHeaders(token) });
    // Without a DB the handler throws; the error handler must return a 500
    // envelope rather than leaking. We assert the guard passed (not 401/403).
    assert.notEqual(res.statusCode, 401);
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });

  test('rejects unsigned cookie tokens (Authorization bearer is the supported channel)', async () => {
    const app = await createTestApp();
    const token = signToken(app, { sub: 'u', username: 'u', role: Role.ADMIN });
    const res = await app.inject({ method: 'GET', url: '/api/management/rooms', headers: { cookie: `access_token=${token}` } });
    assert.equal(res.statusCode, 401);
    await app.close();
  });
});

describe('RBAC via HTTP guards (no DB required)', () => {
  test('receptionist cannot create a room (ADMIN only) -> 403 FORBIDDEN', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/management/rooms',
      headers: authHeaders(tk.receptionist),
      payload: { name: 'Q', capacity: 40 },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });

  test('receptionist cannot delete a student (ADMIN only) -> 403', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/registry/students/aaaaaaaa-0000-0000-0000-000000000001',
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });

  test('receptionist cannot schedule sessions (ADMIN only) -> 403', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduling/sessions',
      headers: authHeaders(tk.receptionist),
      payload: {
        teacherId: validUUID('1'), roomId: validUUID('2'), title: 'T',
        academicStage: '3', startTime: '2026-01-01T10:00:00.000Z', endTime: '2026-01-01T11:00:00.000Z',
        sessionPrice: 100, centerFeePerStudent: 20,
      },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });

  test('receptionist CAN reach receptionist-allowed routes (guard passes, not 403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/registry/students',
      headers: authHeaders(tk.receptionist),
      payload: { fullName: 'أحمد محمود', guardianPhone: '01011112222', academicStage: 'الثالث الثانوي' },
    });
    // Guard allows receptionist (2xx/4xx from handler/DB), but NOT 403.
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });

  test('admin CAN pass admin-only route guards (not 401/403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/management/rooms',
      headers: authHeaders(tk.admin),
      payload: { name: 'Q', capacity: 40 },
    });
    assert.notEqual(res.statusCode, 401);
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });
});