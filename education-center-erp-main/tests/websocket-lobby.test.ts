import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLobbyAttendancePayload } from '../src/server/lib/socket.js';

test('buildLobbyAttendancePayload includes event metadata for desk sync', () => {
  const payload = buildLobbyAttendancePayload({
    sessionId: 'session-123',
    studentId: 'student-456',
    studentName: 'يوسف أحمد',
    deskIdentifier: 'Desk 1',
    paymentMethod: 'CASH',
    newLobbyCount: 42,
    timestamp: new Date('2026-09-04T12:00:00.000Z'),
  });

  assert.equal(payload.sessionId, 'session-123');
  assert.equal(payload.studentId, 'student-456');
  assert.equal(payload.deskIdentifier, 'Desk 1');
  assert.equal(payload.studentName, 'يوسف أحمد');
  assert.equal(payload.paymentMethod, 'CASH');
  assert.equal(payload.newLobbyCount, 42);
  assert.equal(payload.timestamp, '2026-09-04T12:00:00.000Z');
});

test('buildLobbyAttendancePayload serializes any digital method through unchanged', () => {
  const payload = buildLobbyAttendancePayload({
    sessionId: 's1',
    studentId: 'st1',
    studentName: 'مريم خالد',
    deskIdentifier: 'Desk 2',
    paymentMethod: 'INSTAPAY',
    newLobbyCount: 7,
    timestamp: new Date('2026-09-04T13:00:00.000Z'),
  });

  assert.equal(payload.paymentMethod, 'INSTAPAY');
  assert.equal(payload.deskIdentifier, 'Desk 2');
  assert.equal(payload.newLobbyCount, 7);
});
