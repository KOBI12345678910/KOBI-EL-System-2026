/**
 * Unit tests for export utilities (exportToCSV, exportToJSON)
 * These tests mock DOM APIs (URL.createObjectURL, document.createElement) used by the export functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DOM mocks needed because the functions trigger a download via a <a> element ──
const clickMock = vi.fn();
const appendChildMock = vi.fn();
const removeChildMock = vi.fn();

beforeEach(() => {
  clickMock.mockClear();
  appendChildMock.mockClear();
  removeChildMock.mockClear();

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    appendChildMock(node);
    return node;
  });
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
    removeChildMock(node);
    return node;
  });
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag), {
      click: clickMock,
      href: '',
      download: '',
    });
    return el as HTMLElement;
  });
});

// We import AFTER mocking globals so the module picks them up
import { exportToCSV, exportToJSON } from './export';

// ── exportToCSV ──────────────────────────────────────────────────────────────
describe('exportToCSV', () => {
  it('triggers a download (click is called)', () => {
    exportToCSV([{ name: 'Alice', salary: 5000 }], 'test.csv');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it('creates a Blob with UTF-8 BOM prefix', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    exportToCSV([{ name: 'Alice' }], 'test.csv');
    const callArg: string = blobSpy.mock.calls[0]?.[0]?.[0] ?? '';
    expect(callArg.startsWith('\uFEFF')).toBe(true);
  });

  it('handles Hebrew characters without throwing', () => {
    expect(() =>
      exportToCSV([{ שם: 'אליס', משכורת: 8500 }], 'hebrew.csv')
    ).not.toThrow();
  });

  it('produces correct header row from object keys', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    exportToCSV([{ id: 1, name: 'Bob', dept: 'HR' }], 'test.csv');
    const content: string = blobSpy.mock.calls[0]?.[0]?.[0] ?? '';
    // First non-BOM line should be the header
    const lines = content.replace('\uFEFF', '').split('\n');
    expect(lines[0]).toBe('id,name,dept');
  });

  it('does nothing (no click) when given an empty array', () => {
    exportToCSV([], 'empty.csv');
    expect(clickMock).not.toHaveBeenCalled();
  });
});

// ── exportToJSON ─────────────────────────────────────────────────────────────
describe('exportToJSON', () => {
  it('triggers a download (click is called)', () => {
    exportToJSON({ key: 'value' }, 'test.json');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it('produces valid JSON content', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    const data = { employees: [{ id: 1, name: 'Alice' }] };
    exportToJSON(data, 'data.json');
    const content: string = blobSpy.mock.calls[0]?.[0]?.[0] ?? '';
    expect(() => JSON.parse(content)).not.toThrow();
    expect(JSON.parse(content)).toEqual(data);
  });

  it('pretty-prints JSON with 2-space indentation', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob');
    exportToJSON({ a: 1 }, 'data.json');
    const content: string = blobSpy.mock.calls[0]?.[0]?.[0] ?? '';
    expect(content).toContain('\n  ');
  });
});
