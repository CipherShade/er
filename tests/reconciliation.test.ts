import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDiscrepancy, validateReconciliationInput, validateReconciledHeadcount } from '../src/server/modules/reconciliation/reconciliation.js';

test('computeDiscrepancy returns assistant minus lobby count', () => {
  assert.equal(computeDiscrepancy(70, 69), 1);
  assert.equal(computeDiscrepancy(70, 70), 0);
  assert.equal(computeDiscrepancy(69, 70), -1);
});

test('validateReconciliationInput requires resolution notes when discrepancy is non-zero', () => {
  assert.equal(
    validateReconciliationInput({ assistantCount: 70, lobbyCount: 69, resolutionNotes: undefined }).ok,
    false,
  );

  assert.equal(
    validateReconciliationInput({ assistantCount: 70, lobbyCount: 69, resolutionNotes: 'Matched after late arrival' }).ok,
    true,
  );
});

test('validateReconciliationInput rejects counts below zero', () => {
  assert.equal(validateReconciliationInput({ assistantCount: -1, lobbyCount: 10 }).ok, false);
  assert.equal(validateReconciliationInput({ assistantCount: 10, lobbyCount: -1 }).ok, false);
});

test('validateReconciliationInput allows a zero discrepancy without notes', () => {
  assert.equal(validateReconciliationInput({ assistantCount: 10, lobbyCount: 10 }).ok, true);
});

test('validateReconciliationInput rejects too-short resolution notes', () => {
  assert.equal(validateReconciliationInput({ assistantCount: 10, lobbyCount: 9, resolutionNotes: '' }).ok, false);
  assert.equal(validateReconciliationInput({ assistantCount: 10, lobbyCount: 9, resolutionNotes: '  a ' }).ok, false);
  assert.equal(validateReconciliationInput({ assistantCount: 10, lobbyCount: 9, resolutionNotes: 'حضور متأخر' }).ok, true);
});

test('validateReconciledHeadcount allows headcount at or below room capacity', () => {
  assert.equal(validateReconciledHeadcount(30, 40).ok, true);
  assert.equal(validateReconciledHeadcount(40, 40).ok, true);
});

test('validateReconciledHeadcount rejects headcount above room capacity', () => {
  const result = validateReconciledHeadcount(41, 40);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /cannot exceed the room capacity \(40\)/);
});

test('validateReconciledHeadcount rejects inflation regardless of discrepancy notes', () => {
  const result = validateReconciledHeadcount(100, 30);
  assert.equal(result.ok, false);
});
