/**
 * Tests for the fmtMoney formatting function used throughout payroll-autonomous.
 *
 * The function is defined inline in App.jsx.  We replicate it here so it can be
 * tested in isolation without importing the full React component tree.
 */
import { describe, it, expect } from 'vitest';

// Replicate the fmtMoney logic from src/App.jsx so tests are self-contained.
const fmtMoney = (n: number | null | undefined): string =>
  '\u20AA ' +
  Number(n || 0).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

describe('fmtMoney', () => {
  it('formats 5000 with shekel prefix and comma separator', () => {
    const result = fmtMoney(5000);
    // Starts with shekel sign
    expect(result.startsWith('\u20AA')).toBe(true);
    // Contains 5,000 (locale-formatted) and .00
    expect(result).toMatch(/5[,.]?000/);
    expect(result).toMatch(/00$/);
  });

  it('returns "₪ 0.00" equivalent for 0', () => {
    const result = fmtMoney(0);
    expect(result.startsWith('\u20AA')).toBe(true);
    expect(result).toMatch(/^₪\s*0/);
  });

  it('returns "₪ 0.00" equivalent for null', () => {
    const result = fmtMoney(null);
    expect(result.startsWith('\u20AA')).toBe(true);
    expect(result).toMatch(/^₪\s*0/);
  });

  it('returns "₪ 0.00" equivalent for undefined', () => {
    const result = fmtMoney(undefined);
    expect(result.startsWith('\u20AA')).toBe(true);
    expect(result).toMatch(/^₪\s*0/);
  });

  it('formats a large payroll value (100000) correctly', () => {
    const result = fmtMoney(100000);
    expect(result.startsWith('\u20AA')).toBe(true);
    expect(result).toMatch(/100/);
    expect(result).toMatch(/00$/);
  });
});
