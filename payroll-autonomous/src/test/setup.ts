import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom does not implement URL.createObjectURL/revokeObjectURL — polyfill so
// modules that trigger downloads (utils/export.ts) can be spied on in tests.
if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
}
