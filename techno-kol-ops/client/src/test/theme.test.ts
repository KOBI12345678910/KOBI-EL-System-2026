/**
 * Tests for the Palantir dark theme color tokens used across techno-kol-ops client.
 * Values are sourced from src/styles/theme.ts.
 */
import { describe, it, expect } from 'vitest';
import { COLORS } from '../styles/theme';

describe('COLORS theme tokens', () => {
  it('COLORS.bg is the main background dark color', () => {
    // Actual value from src/styles/theme.ts
    expect(COLORS.bg).toBe('#10161A');
  });

  it('COLORS.accent is the primary blue accent', () => {
    // Actual value from src/styles/theme.ts
    expect(COLORS.accent).toBe('#2D72D2');
  });

  it('COLORS.success is the green success color', () => {
    expect(COLORS.success).toBe('#3DCC91');
  });

  it('COLORS.danger is the red danger color', () => {
    expect(COLORS.danger).toBe('#FF7373');
  });

  it('COLORS.text is the primary text color', () => {
    expect(COLORS.text).toBe('#F5F8FA');
  });
});
