import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateTeacherPhones, cleanRoomName } from '../src/server/modules/management/management.js';

describe('ROOMS & TEACHERS: pure domain logic', () => {
  test('valid teacher + assistant Egyptian phones pass', () => {
    assert.equal(validateTeacherPhones('01012345678'), null);
    assert.equal(validateTeacherPhones('01112345678', '01298765432'), null);
    assert.equal(validateTeacherPhones('01512345678', null), null);
  });

  test('invalid teacher/assistant phones are rejected', () => {
    assert.notEqual(validateTeacherPhones('010123'), null);
    assert.notEqual(validateTeacherPhones('01912345678'), null);
    assert.notEqual(validateTeacherPhones('01012345678', '01812345678'), null);
  });

  test('room names are trimmed', () => {
    assert.equal(cleanRoomName('  قاعة ١  '), 'قاعة ١');
  });
});

describe('management HTTP guards', () => {
  test('POST /teachers requires ADMIN role -> 403 FORBIDDEN for receptionist', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/management/teachers',
      headers: authHeaders(tk.receptionist),
      payload: { fullName: 'م. أحمد', phoneNumber: '01012345678', subject: 'رياضيات', defaultCenterFee: 20 },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
    await app.close();
  });
});