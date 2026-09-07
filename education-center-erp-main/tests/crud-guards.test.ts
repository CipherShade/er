import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, createTestApp, authHeaders, errorCode, validUUID } from './helpers.js';

function badId(seed: string): string {
  return seed;
}

describe('ROOM CRUD HTTP guards (no DB required)', () => {
  test('PATCH a room with an invalid UUID returns 400 before any DB access', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/management/rooms/${badId('not-a-uuid')}`,
      headers: authHeaders(tk.admin),
      payload: { name: 'Renamed' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('DELETE a room is ADMIN only -> 403 FORBIDDEN for receptionist', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/management/rooms/${validUUID('11111111-0000-0000-0000-000000000099')}`,
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });

  test('DELETE a room with an invalid UUID returns 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/management/rooms/${badId('oops')}`,
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('PATCH a room is ADMIN only -> 403 FORBIDDEN for receptionist', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/management/rooms/${validUUID('11111111-0000-0000-0000-000000000098')}`,
      headers: authHeaders(tk.receptionist),
      payload: { capacity: 30 },
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });
});

describe('TEACHER CRUD HTTP guards (no DB required)', () => {
  test('PATCH a teacher with an invalid UUID returns 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/management/teachers/${badId('bad-id')}`,
      headers: authHeaders(tk.admin),
      payload: { subject: 'Physics' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('DELETE a teacher is ADMIN only -> 403 FORBIDDEN for receptionist', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/management/teachers/${validUUID('22222222-0000-0000-0000-000000000099')}`,
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  test('DELETE a teacher with an invalid UUID returns 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/management/teachers/not-a-uuid-at-all',
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe('STUDENT CRUD HTTP guards (no DB required)', () => {
  test('PATCH a student with an invalid UUID returns 400 (receptionist + admin allowed)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/registry/students/${badId('invalid')}`,
      headers: authHeaders(tk.receptionist),
      payload: { academicStage: 'الثاني الثانوي' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('DELETE a student is ADMIN only -> 403 FORBIDDEN for receptionist', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/registry/students/${validUUID('33333333-0000-0000-0000-000000000099')}`,
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });

  test('DELETE a student with an invalid UUID returns 400 for admin', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/registry/students/zzz',
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('POST a student with a bad guardian phone is rejected by the schema', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/registry/students',
      headers: authHeaders(tk.receptionist),
      payload: { fullName: 'أحمد محمود', guardianPhone: '01912345678', academicStage: 'الصف الثالث' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('PATCH a student with an invalid guardian phone is rejected before DB access', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/registry/students/${validUUID('33333333-0000-0000-0000-000000000098')}`,
      headers: authHeaders(tk.receptionist),
      payload: { guardianPhone: '01812345678' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe('SESSION CRUD HTTP guards (no DB required)', () => {
  test('PATCH a session with an invalid UUID returns 400 (ADMIN only route)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/scheduling/sessions/${badId('nope')}`,
      headers: authHeaders(tk.admin),
      payload: { title: 'Physics 2' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('DELETE a session is ADMIN only -> 403 FORBIDDEN for receptionist', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/scheduling/sessions/${validUUID('44444444-0000-0000-0000-000000000099')}`,
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  test('DELETE a session with an invalid UUID returns 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/scheduling/sessions/invalid!',
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('GET sessions with an invalid from date returns 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/scheduling/sessions?from=not-a-date',
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});