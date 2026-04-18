// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@blueprintjs/core';
import { useStore } from '../store/useStore';
import { theme } from '../styles/theme';

const RECENT_KEY = 'techno_global_search_recent';
const MAX_RECENT = 6;

interface SearchResult {
  id: string;
  type: 'workorder' | 'employee' | 'client' | 'material' | 'alert';
  label: string;
  sub?: string;
  route: string;
}

const TYPE_META: Record<SearchResult['type'], { icon: string; heLabel: string; color: string }> = {
  workorder: { icon: 'build',        heLabel: 'הזמנות עבודה', color: '#4a9eff' },
  employee:  { icon: 'person',       heLabel: 'עובדים',        color: '#3fb950' },
  client:    { icon: 'office',       heLabel: 'לקוחות',        color: '#d2a679' },
  material:  { icon: 'cube',         heLabel: 'חומרים',        color: '#d29922' },
  alert:     { icon: 'warning-sign', heLabel: 'התראות',        color: '#f85149' },
};

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function getRecent(): SearchResult[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(result: SearchResult) {
  const prev = getRecent().filter(r => r.id !== result.id);
  const next = [result, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(0,0,0,0.72)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 80,
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 640,
  background: '#13171c',
  border: '1px solid #2a3340',
  borderRadius: 8,
  boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
  overflow: 'hidden',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#e6edf3',
  fontSize: 16,
  padding: '14px 16px',
  fontFamily: 'inherit',
  direction: 'rtl',
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const snapshot = useStore(s => s.snapshot);
  const alerts = useStore(s => s.alerts);

  // Build searchable corpus from store
  const buildCorpus = useCallback((): SearchResult[] => {
    const items: SearchResult[] = [];

    // Work orders
    (snapshot?.activeOrders || []).forEach(wo => {
      items.push({
        id: `wo-${wo.id}`,
        type: 'workorder',
        label: `${wo.product || wo.id}`,
        sub: `לקוח: ${wo.client_name || '—'} | ${wo.status || ''}`,
        route: `/work-orders/${wo.id}`,
      });
      // Clients (deduplicated by name)
      if (wo.client_name) {
        if (!items.find(i => i.type === 'client' && i.label === wo.client_name)) {
          items.push({
            id: `client-${wo.client_name}`,
            type: 'client',
            label: wo.client_name,
            sub: 'לקוח',
            route: `/clients`,
          });
        }
      }
      // Materials
      if (wo.material_primary) {
        if (!items.find(i => i.type === 'material' && i.label === wo.material_primary)) {
          items.push({
            id: `mat-${wo.material_primary}`,
            type: 'material',
            label: wo.material_primary,
            sub: `קטגוריה: ${wo.category || '—'}`,
            route: `/materials`,
          });
        }
      }
      // Employees from assigned_employees
      (wo.assigned_employees || []).forEach(empName => {
        if (!items.find(i => i.type === 'employee' && i.label === empName)) {
          items.push({
            id: `emp-${empName}`,
            type: 'employee',
            label: empName,
            sub: 'עובד',
            route: `/employees`,
          });
        }
      });
    });

    // Alerts
    (alerts || []).filter(a => !a.is_resolved).forEach(a => {
      items.push({
        id: `alert-${a.id}`,
        type: 'alert',
        label: a.title,
        sub: a.message,
        route: `/alerts`,
      });
    });

    return items;
  }, [snapshot, alerts]);

  // Search
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setHighlighted(0);
      return;
    }
    const corpus = buildCorpus();
    const matched = corpus.filter(item =>
      fuzzyMatch(item.label, query) || fuzzyMatch(item.sub || '', query)
    );
    // Group: max 4 per type
    const grouped: SearchResult[] = [];
    const byType: Record<string, SearchResult[]> = {};
    matched.forEach(r => {
      if (!byType[r.type]) byType[r.type] = [];
      byType[r.type].push(r);
    });
    Object.values(byType).forEach(arr => grouped.push(...arr.slice(0, 4)));
    setResults(grouped.slice(0, 20));
    setHighlighted(0);
  }, [query, open, buildCorpus]);

  // Open/close with Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQuery('');
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const list = query ? results : recent;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (list[highlighted]) handleSelect(list[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const handleSelect = (result: SearchResult) => {
    saveRecent(result);
    setOpen(false);
    setQuery('');
    navigate(result.route);
  };

  if (!open) return null;

  const displayList = query.trim() ? results : recent;
  const showRecent = !query.trim() && recent.length > 0;
  const grouped: Record<string, SearchResult[]> = {};
  if (query.trim()) {
    displayList.forEach(r => {
      if (!grouped[r.type]) grouped[r.type] = [];
      grouped[r.type].push(r);
    });
  }

  return (
    <div style={overlayStyle} onMouseDown={() => { setOpen(false); setQuery(''); }}>
      <div style={modalStyle} onMouseDown={e => e.stopPropagation()}>
        {/* Search input row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #2a3340',
          direction: 'rtl',
          gap: 8,
          padding: '0 12px',
        }}>
          <Icon icon="search" size={16} color="#8b96a5" />
          <input
            ref={inputRef}
            style={inputStyle}
            placeholder="חפש פרויקטים, עובדים, לקוחות..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: '#8b96a5', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            >
              ✕
            </button>
          )}
          <kbd style={{
            background: '#1a2028', border: '1px solid #2a3340', borderRadius: 3,
            padding: '2px 6px', fontSize: 11, color: '#8b96a5', whiteSpace: 'nowrap',
          }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {showRecent && !query.trim() && (
            <div>
              <div style={{ padding: '8px 16px 4px', fontSize: 10, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.08em', direction: 'rtl' }}>
                חיפושים אחרונים
              </div>
              {recent.map((r, idx) => (
                <ResultRow
                  key={r.id}
                  result={r}
                  highlighted={highlighted === idx}
                  onSelect={handleSelect}
                  onHover={() => setHighlighted(idx)}
                />
              ))}
            </div>
          )}

          {query.trim() && results.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8b96a5', fontSize: 14 }}>
              לא נמצאו תוצאות עבור "{query}"
            </div>
          )}

          {query.trim() && results.length > 0 && (
            Object.entries(grouped).map(([type, items]) => {
              const meta = TYPE_META[type as SearchResult['type']];
              const typeOffset = Object.entries(grouped)
                .slice(0, Object.keys(grouped).indexOf(type))
                .reduce((acc, [, arr]) => acc + arr.length, 0);
              return (
                <div key={type}>
                  <div style={{
                    padding: '8px 16px 4px',
                    fontSize: 10,
                    color: meta?.color || '#8b96a5',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    direction: 'rtl',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Icon icon={meta?.icon as any} size={10} color={meta?.color} />
                    {meta?.heLabel || type}
                  </div>
                  {items.map((r, i) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      highlighted={highlighted === typeOffset + i}
                      onSelect={handleSelect}
                      onHover={() => setHighlighted(typeOffset + i)}
                    />
                  ))}
                </div>
              );
            })
          )}

          {!query.trim() && !recent.length && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8b96a5', fontSize: 13 }}>
              התחל להקליד כדי לחפש
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          borderTop: '1px solid #2a3340',
          padding: '8px 16px',
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: '#8b96a5',
          direction: 'rtl',
        }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> ניווט</span>
          <span><kbd style={kbdStyle}>Enter</kbd> בחר</span>
          <span><kbd style={kbdStyle}>Ctrl+K</kbd> פתח/סגור</span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background: '#1a2028',
  border: '1px solid #2a3340',
  borderRadius: 3,
  padding: '1px 5px',
  fontSize: 10,
  marginLeft: 4,
};

function ResultRow({
  result,
  highlighted,
  onSelect,
  onHover,
}: {
  result: SearchResult;
  highlighted: boolean;
  onSelect: (r: SearchResult) => void;
  onHover: () => void;
}) {
  const meta = TYPE_META[result.type];
  return (
    <div
      onMouseEnter={onHover}
      onClick={() => onSelect(result)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        cursor: 'pointer',
        direction: 'rtl',
        background: highlighted ? 'rgba(74,158,255,0.10)' : 'transparent',
        borderRight: highlighted ? `3px solid #4a9eff` : '3px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <Icon icon={meta?.icon as any} size={14} color={highlighted ? meta?.color : '#8b96a5'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: highlighted ? '#e6edf3' : '#c9d1d9', fontWeight: highlighted ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {result.label}
        </div>
        {result.sub && (
          <div style={{ fontSize: 11, color: '#8b96a5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {result.sub}
          </div>
        )}
      </div>
      <Icon icon="arrow-left" size={10} color={highlighted ? '#4a9eff' : 'transparent'} />
    </div>
  );
}

// Export a hook to open the search programmatically
export function useGlobalSearch() {
  const open = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  return { open };
}
