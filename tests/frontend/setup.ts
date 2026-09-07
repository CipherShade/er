import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import '../../src/client/locales/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});