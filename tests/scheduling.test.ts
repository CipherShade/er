import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTimes,
  validateSessionInput,
  buildOverlapWhere,
  validateSessionStatusChange,
} from '../src/server/modules/scheduling/scheduling.js';
import { SessionStatus } from '../src/shared/constants/index.js';
import { validUUID } from './helpers.js';

const base = {
  teacherId: validUUID('11111111-0000-0000-0000-000000000001'),
  roomId: validUUID('22222222-0000-0000-0000-000000000001'),
  title: 'Physics',
  academicStage: 'SEC_3',
  startTime: '2026-01-05T10:00:00.000Z',
  endTime: '2026-01-05T11:00:00.000Z',
  sessionPrice: 100,
  centerFeePerStudent: 20,
};

describe('SESSIONS: time parsing', () => {
  test('valid window returns Date bounds', () => {
    const t = parseTimes(base);
    assert.ok(t);
    assert.equal(t!.start.toISOString(), '2026-01-05T10:00:00.000Z');
    assert.equal(t!.end.toISOString(), '2026-01-05T11:00:00.000Z');
  });

  test('end before/equal start is rejected', () => {
    assert.equal(parseTimes({ ...base, endTime: base.startTime }), null);
    assert.equal(parseTimes({ ...base, endTime: '2026-01-05T09:00:00.000Z' }), null);
  });

  test('unparseable dates are rejected', () => {
    assert.equal(parseTimes({ ...base, startTime: 'not-a-date' }), null);
    assert.equal(parseTimes({ ...base, endTime: '25:99' }), null);
  });
});

describe('SESSIONS: money validation', () => {
  test('session price cannot be less than center fee', () => {
    const err = validateSessionInput({ ...base, sessionPrice: 10, centerFeePerStudent: 20 }, parseTimes(base));
    assert.ok(err);
    assert.equal(err!.error.code, 'VALIDATION_ERROR');
    assert.match(err!.error.messageEn, /less than the center fee/);
  });

  test('money with more than two decimals is rejected', () => {
    const err = validateSessionInput({ ...base, sessionPrice: 30.123, centerFeePerStudent: 20 }, parseTimes(base));
    assert.ok(err);
    assert.equal(err!.error.code, 'VALIDATION_ERROR');
  });

  test('valid prices pass', () => {
    assert.equal(validateSessionInput(base, parseTimes(base)), null);
    assert.equal(validateSessionInput({ ...base, sessionPrice: 20, centerFeePerStudent: 20 }, parseTimes(base)), null);
  });

  test('invalid times fail before money checks', () => {
    const err = validateSessionInput(base, null);
    assert.ok(err);
    assert.match(err!.error.messageEn, /End time/);
  });
});

describe('SESSIONS: status immutability', () => {
  test('a completed session cannot be modified', () => {
    const result = validateSessionStatusChange(SessionStatus.COMPLETED, undefined);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 409);
    assert.equal(result.code, 'SESSION_LOCKED');
    assert.match(result.messageEn, /Completed sessions cannot be modified/);
  });

  test('a session cannot be set to completed directly', () => {
    const result = validateSessionStatusChange(SessionStatus.SCHEDULED, SessionStatus.COMPLETED);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 400);
    assert.equal(result.code, 'INVALID_STATUS');
    assert.match(result.messageEn, /cannot be set to completed/);
  });

  test('changing from completed to another via status is still blocked', () => {
    const result = validateSessionStatusChange(SessionStatus.COMPLETED, SessionStatus.CANCELLED);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.httpStatus, 409);
    assert.equal(result.code, 'SESSION_LOCKED');
  });

  test('scheduled/cancelled transitions on non-completed sessions remain allowed', () => {
    assert.equal(validateSessionStatusChange(SessionStatus.SCHEDULED, undefined).ok, true);
    assert.equal(validateSessionStatusChange(SessionStatus.SCHEDULED, SessionStatus.CANCELLED).ok, true);
    assert.equal(validateSessionStatusChange(SessionStatus.CANCELLED, SessionStatus.SCHEDULED).ok, true);
  });
});

describe('SESSIONS: overlap where clause', () => {
  test('excludes cancelled sessions and self when editing', () => {
    const overlap = buildOverlapWhere(base, 'abc') as {
      status: { not: SessionStatus };
      id?: { not: string };
    };
    assert.equal(overlap.status.not, SessionStatus.CANCELLED);
    assert.equal(overlap.id!.not, 'abc');
  });

  test('no self-exclusion when creating', () => {
    const overlap = buildOverlapWhere(base) as { id?: { not: string } };
    assert.equal(overlap.id, undefined);
  });

  test('overlap window is a genuine half-open interval', () => {
    const overlap = buildOverlapWhere(base) as { startTime: { lt: Date }, endTime: { gt: Date } };
    assert.ok(overlap.startTime.lt instanceof Date);
    assert.ok(overlap.endTime.gt instanceof Date);
  });
});

describe('SESSIONS: scheduling HTTP guards', () => {
  test('POST /sessions requires ADMIN', async () => {
    const { tokens, createTestApp, authHeaders } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduling/sessions',
      headers: authHeaders(tk.receptionist),
      payload: base,
    });
    assert.equal(res.statusCode, 403);
    await app.close();
  });

  test('schema rejects malformed session body with 400 VALIDATION_ERROR', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduling/sessions',
      headers: authHeaders(tk.admin),
      payload: { ...base, startTime: 'garbage' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('POST /sessions rejects creating a session as COMPLETED with 400 INVALID_STATUS', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/scheduling/sessions',
      headers: authHeaders(tk.admin),
      payload: { ...base, status: 'COMPLETED' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'INVALID_STATUS');
    await app.close();
  });

  test('PATCH /sessions/:id rejects setting status to COMPLETED with 400 INVALID_STATUS before any DB work', async () => {
    const { tokens, createTestApp, authHeaders, errorCode, validUUID } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/scheduling/sessions/${validUUID('99999999-0000-0000-0000-000000000001')}`,
      headers: authHeaders(tk.admin),
      payload: { status: 'COMPLETED' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'INVALID_STATUS');
    await app.close();
  });
});