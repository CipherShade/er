import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { SchoolType } from '../src/shared/constants/index.js';

import {
  validateStudentPhones,
  buildStudentSearchWhere,
  nextStudentCodeFromLatest,
} from '../src/server/modules/students/students.js';
import { normalizeArabicText } from '../src/shared/utils/arabicNormalization.js';
import { parsePagination, isValidUUID, isValidMoneyAmount, parseAuditPagination, MAX_PAGE_SIZE } from '../src/server/lib/http.js';
import { validUUID } from './helpers.js';

describe('STUDENTS: pure domain logic', () => {
  test('Egyptian mobile phones validate for guardian and optional student phone', () => {
    const valid = { fullName: 'أ', guardianPhone: '01012345678', academicStage: '3' };
    assert.equal(validateStudentPhones(valid), null);

    // Each allowed prefix accepted.
    for (const prefix of ['010', '011', '012', '015']) {
      assert.equal(validateStudentPhones({ ...valid, guardianPhone: `${prefix}12345678` }), null);
    }
  });

  test('rejects invalid guardian and student phones', () => {
    const base = { fullName: 'أ', academicStage: '3' };
    assert.notEqual(validateStudentPhones({ ...base, guardianPhone: '010123' }), null);
    assert.notEqual(validateStudentPhones({ ...base, guardianPhone: '02012345678' }), null);
    assert.notEqual(validateStudentPhones({ ...base, guardianPhone: '01012345678', studentPhone: '01912345678' }), null);
  });

  test('Arabic-normalized search where clause unifies Alef/Taa variants', () => {
    const where = buildStudentSearchWhere('أحمد');
    assert.ok(where.OR);
    const searchNameClause = where.OR.find((c) => 'searchName' in c);
    assert.equal(searchNameClause.searchName.contains, 'احمد');

    // No search -> empty where (returns all).
    assert.deepEqual(buildStudentSearchWhere(undefined), {});
    assert.deepEqual(buildStudentSearchWhere('   '), {});
  });

  test('normalized name dictionary: different spellings map to the same key', () => {
    assert.equal(normalizeArabicText('أحمد'), 'احمد');
    assert.equal(normalizeArabicText('إحمد'), 'احمد');
    assert.equal(normalizeArabicText('آحمد'), 'احمد');
    assert.equal(normalizeArabicText('مدرسة'), normalizeArabicText('مدرسه'));
    assert.equal(normalizeArabicText('مرحبا'), normalizeArabicText('مرحبا'));
  });

  test('nextStudentCodeFromLatest increments the trailing numeric run', () => {
    assert.equal(nextStudentCodeFromLatest('STU-00001'), 'STU-00002');
    assert.equal(nextStudentCodeFromLatest('STU-00099'), 'STU-00100');
    assert.equal(nextStudentCodeFromLatest('STU-010492'), 'STU-10493');
    assert.equal(nextStudentCodeFromLatest(undefined), 'STU-00001');
    assert.equal(nextStudentCodeFromLatest(null), 'STU-00001');
  });
});

describe('STUDENTS: pagination helpers', () => {
  test('parsePagination defaults and bounds', () => {
    assert.deepEqual(parsePagination({}), { ok: true, page: 1, limit: 30, skip: 0 });
    assert.deepEqual(parsePagination({ page: '2', limit: '50' }), { ok: true, page: 2, limit: 50, skip: 50 });
    assert.equal(parsePagination({ page: '0' }).ok, false);
    assert.equal(parsePagination({ page: '1.5' }).ok, false);
    assert.equal(parsePagination({ limit: '0' }).ok, false);
    assert.equal(parsePagination({ limit: String(MAX_PAGE_SIZE + 1) }).ok, false);
    assert.equal(parsePagination({ page: '-1' }).ok, false);
  });

  test('parseAuditPagination validates date ranges', () => {
    const ok = parseAuditPagination({ page: '1', limit: '200', from: '2026-01-01', to: '2026-01-31' });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.limit, 200);
      assert.ok(ok.from instanceof Date);
      assert.ok(ok.to instanceof Date);
    }
    assert.equal(parseAuditPagination({ from: 'not-a-date' }).ok, false);
    assert.equal(parseAuditPagination({ from: '2026-02-01', to: '2026-01-01' }).ok, false);
    // Audit cap at 500 even if a larger limit is passed.
    const capped = parseAuditPagination({ limit: '9999' });
    assert.equal(capped.ok, true);
    if (capped.ok) assert.equal(capped.limit, 500);
  });

  test('isValidUUID and isValidMoneyAmount', () => {
    const uuid = validUUID('1234567890abcdef1234567890abcdef');
    assert.equal(isValidUUID(uuid), true);
    assert.equal(isValidUUID('not-a-uuid'), false);
    assert.equal(isValidUUID('12345678-1234-1234-1234-1234567890ab'), false); // version nibble wrong

    assert.equal(isValidMoneyAmount(12.34), true);
    assert.equal(isValidMoneyAmount(0), true);
    assert.equal(isValidMoneyAmount(1.234), false); // more than 2 dp
    assert.equal(isValidMoneyAmount(-1), false);
    assert.equal(isValidMoneyAmount(Number.NaN), false);
    assert.equal(isValidMoneyAmount(10.1), true);
  });
});

describe('STUDENTS: create/update serialization and search-code shape', () => {
  test('studentCode preserves zero-padding', () => {
    assert.match(nextStudentCodeFromLatest('STU-00042'), /^STU-\d{5}$/);
  });

  test('schoolType enum membership is restricted', () => {
    const types = Object.values(SchoolType);
    assert.deepEqual(types.sort(), ['AZHAR', 'GENERAL', 'LANGUAGES']);
  });
});