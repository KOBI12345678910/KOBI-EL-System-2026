/**
 * ShortcutsModal — Keyboard shortcuts reference
 * Triggered by Ctrl+/ or "?" button in the header.
 * Dismiss with Escape or click outside.
 */

import React, { useEffect } from 'react';

const theme = {
  bg: '#0b0d10',
  panel: '#13171c',
  panel2: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  textDim: '#8b96a5',
  accent: '#4a9eff',
};

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', '1'],  description: 'דשבורד' },
  { keys: ['Ctrl', '2'],  description: 'תלושי שכר' },
  { keys: ['Ctrl', '3'],  description: 'עובדים' },
  { keys: ['Ctrl', '4'],  description: 'השוואת הצעות' },
  { keys: ['Ctrl', '5'],  description: 'דוח BI' },
  { keys: ['Ctrl', '/'],  description: 'הצג קיצורי מקלדת' },
  { keys: ['Escape'],     description: 'סגור חלון פתוח' },
];

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: 0,
          width: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          direction: 'rtl',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: theme.text }}>
            קיצורי מקלדת
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.textDim,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 11, color: theme.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>
                פעולה
              </th>
              <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, color: theme.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>
                קיצור
              </th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((sc, i) => (
              <tr key={i} style={{ borderBottom: i < SHORTCUTS.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                <td style={{ padding: '11px 20px', fontSize: 13, color: theme.text, textAlign: 'right' }}>
                  {sc.description}
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'left' }}>
                  <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-start', flexDirection: 'row-reverse' }}>
                    {sc.keys.map((k, ki) => (
                      <React.Fragment key={ki}>
                        {ki > 0 && <span style={{ color: theme.textDim, lineHeight: '22px', fontSize: 11 }}>+</span>}
                        <kbd style={{
                          background: theme.panel2,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 12,
                          color: theme.accent,
                          fontFamily: 'monospace',
                          lineHeight: '18px',
                          display: 'inline-block',
                        }}>
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: 11,
          color: theme.textDim,
          textAlign: 'center',
        }}>
          לחץ <kbd style={{ background: theme.panel2, border: `1px solid ${theme.border}`, borderRadius: 3, padding: '1px 6px', fontSize: 10, color: theme.textDim }}>Escape</kbd> או לחץ מחוץ לחלון כדי לסגור
        </div>
      </div>
    </div>
  );
}
