import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

/**
 * GenericMenuPage
 * ─────────────────────────────────────────────────────────────────────────
 * Catch-all renderer for the thousands of dynamic menu routes seeded into
 * `public.app_menu` (registry, marketplace, db, rpc, view, component, hook,
 * api-doc, addons, integrations, platform-module, combo, template, …).
 *
 * Strategy:
 *  1. On mount, fetch /api/app-menu?flat=1 once and locate the entry whose
 *     `route` matches the current pathname (or, failing that, longest prefix
 *     match — handy for deeply-nested /component/* routes).
 *  2. If the URL looks like /db/:schema/:table or /rpc/:schema/:name (or the
 *     equivalent /view/:schema/:name), kick off a parallel fetch to
 *     /api/db-entity/:schema/:table or /api/rpc-meta/:schema/:name to
 *     surface the entity description. These endpoints may not exist yet —
 *     we degrade gracefully on 404 / network error.
 *  3. Render header (label_he or fallback), breadcrumb derived from the
 *     URL segments, and a stub body explaining the entity.
 *
 * The component is intentionally self-contained — no external state,
 * no new packages.
 */

interface AppMenuEntry {
  id?: number | string;
  label?: string;
  label_he?: string;
  route?: string;
  icon?: string | null;
  parent_id?: number | string | null;
}

interface AppMenuResponse {
  source?: string;
  count?: number;
  items?: AppMenuEntry[];
}

interface EntityMeta {
  schema?: string;
  table?: string;
  name?: string;
  description?: string | null;
  description_he?: string | null;
  columns?: Array<{ name: string; type?: string }>;
  args?: Array<{ name: string; type?: string }>;
  [key: string]: unknown;
}

const cardStyle: React.CSSProperties = {
  background: '#2F343C',
  border: '1px solid rgba(255,255,255,0.1)',
  padding: 24,
  borderRadius: 4,
  marginBottom: 16,
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  background: 'rgba(255,255,255,0.05)',
  padding: '2px 6px',
  borderRadius: 3,
  fontSize: 12,
};

function buildBreadcrumb(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

function findMenuEntry(items: AppMenuEntry[], pathname: string): AppMenuEntry | undefined {
  // Exact match first
  let match = items.find((it) => it.route === pathname);
  if (match) return match;
  // Strip trailing slash
  const stripped = pathname.replace(/\/+$/, '');
  match = items.find((it) => it.route === stripped);
  if (match) return match;
  // Longest-prefix match (handy for /component/foo/bar patterns)
  let best: AppMenuEntry | undefined;
  let bestLen = 0;
  for (const it of items) {
    const r = it.route;
    if (!r || r === '/' || !pathname.startsWith(r)) continue;
    if (r.length > bestLen) {
      best = it;
      bestLen = r.length;
    }
  }
  return best;
}

export function GenericMenuPage() {
  const location = useLocation();
  const params = useParams();
  const [menuEntry, setMenuEntry] = useState<AppMenuEntry | undefined>();
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [meta, setMeta] = useState<EntityMeta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);

  const pathname = location.pathname;
  const breadcrumb = useMemo(() => buildBreadcrumb(pathname), [pathname]);
  const segments = breadcrumb;
  const root = segments[0] ?? '';

  // Detect /db/:schema/:table, /rpc/:schema/:name, /view/:schema/:name
  const entityHint = useMemo(() => {
    if ((root === 'db' || root === 'rpc' || root === 'view') && segments.length >= 3) {
      return { kind: root as 'db' | 'rpc' | 'view', schema: segments[1], name: segments[2] };
    }
    return null;
  }, [root, segments]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/app-menu?flat=1', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<AppMenuResponse>) : Promise.resolve(null)))
      .then((data) => {
        if (cancelled) return;
        const items = data?.items ?? [];
        setMenuEntry(findMenuEntry(items, pathname));
        setMenuLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMenuLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!entityHint) {
      setMetaLoaded(true);
      return;
    }
    let cancelled = false;
    const url =
      entityHint.kind === 'rpc'
        ? `/api/rpc-meta/${encodeURIComponent(entityHint.schema)}/${encodeURIComponent(entityHint.name)}`
        : `/api/db-entity/${encodeURIComponent(entityHint.schema)}/${encodeURIComponent(entityHint.name)}`;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<EntityMeta>) : Promise.resolve(null)))
      .then((data) => {
        if (cancelled) return;
        setMeta(data ?? null);
        setMetaLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMetaLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityHint]);

  const title =
    menuEntry?.label_he ||
    menuEntry?.label ||
    (entityHint ? `${entityHint.schema}.${entityHint.name}` : segments[segments.length - 1] || pathname);

  const kindLabel =
    entityHint?.kind === 'db'
      ? 'טבלה (Database Entity)'
      : entityHint?.kind === 'rpc'
      ? 'פונקציה (RPC)'
      : entityHint?.kind === 'view'
      ? 'תצוגה (View)'
      : root || 'דף דינמי';

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', color: '#F6F7F9' }}>
      <Link
        to="/"
        style={{
          color: '#5C7080',
          fontSize: 13,
          textDecoration: 'none',
          marginBottom: 16,
          display: 'inline-block',
        }}
      >
        ← חזרה לעמוד הראשי
      </Link>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#5C7080', marginBottom: 12 }}>
        {segments.length === 0 ? (
          <span>/</span>
        ) : (
          segments.map((seg, idx) => {
            const href = '/' + segments.slice(0, idx + 1).join('/');
            const isLast = idx === segments.length - 1;
            return (
              <span key={`${href}-${idx}`}>
                {idx > 0 && <span style={{ margin: '0 6px', color: '#5C7080' }}>/</span>}
                {isLast ? (
                  <span style={{ color: '#A7B6C2' }}>{seg}</span>
                ) : (
                  <Link to={href} style={{ color: '#5C7080', textDecoration: 'none' }}>
                    {seg}
                  </Link>
                )}
              </span>
            );
          })
        )}
      </div>

      {/* Header */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#5C7080', letterSpacing: '0.08em', marginBottom: 6 }}>
          {kindLabel.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, marginBottom: 8 }}>{title}</h1>
        <div style={{ fontSize: 13, color: '#8F99A8' }}>
          <span style={codeStyle}>{pathname}</span>
        </div>
      </div>

      {/* Entity / RPC metadata */}
      {entityHint && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#5C7080', letterSpacing: '0.08em', marginBottom: 8 }}>
            METADATA
          </div>
          {!metaLoaded ? (
            <div style={{ fontSize: 13, color: '#8F99A8' }}>טוען מידע…</div>
          ) : meta ? (
            <div style={{ fontSize: 13, color: '#D6D9DC' }}>
              <div style={{ marginBottom: 6 }}>
                <strong>Schema:</strong> <span style={codeStyle}>{entityHint.schema}</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong>Name:</strong> <span style={codeStyle}>{entityHint.name}</span>
              </div>
              {(meta.description_he || meta.description) && (
                <div style={{ marginTop: 10, color: '#A7B6C2' }}>
                  {meta.description_he || meta.description}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#8F99A8' }}>
              אין עדיין מידע מטא ל-<span style={codeStyle}>{entityHint.schema}.{entityHint.name}</span>.
              ה-API <span style={codeStyle}>
                /api/{entityHint.kind === 'rpc' ? 'rpc-meta' : 'db-entity'}/…
              </span>{' '}
              ייטען כשייפרס.
            </div>
          )}
        </div>
      )}

      {/* Stub body */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#5C7080', letterSpacing: '0.08em', marginBottom: 8 }}>
          ABOUT THIS PAGE
        </div>
        <p style={{ fontSize: 13, color: '#A7B6C2', lineHeight: 1.7, margin: 0 }}>
          זהו דף דינמי שנוצר אוטומטית מתפריט המערכת (<span style={codeStyle}>app_menu</span>).
          הוא משמש כמתאם בין הניווט לבין הישות / המודול הסופי, וייפרס לתצוגה ייעודית כשהמודול
          המתאים ייטען.
        </p>
        {menuLoaded && !menuEntry && (
          <p style={{ fontSize: 12, color: '#5C7080', marginTop: 10 }}>
            (לא נמצאה רשומה תואמת ב-<span style={codeStyle}>app_menu</span> עבור{' '}
            <span style={codeStyle}>{pathname}</span> — ייתכן שמדובר בתת-נתיב עמוק.)
          </p>
        )}
        {Object.keys(params).length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#8F99A8' }}>
            <strong>פרמטרים:</strong>{' '}
            <span style={codeStyle}>
              {JSON.stringify(params)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GenericMenuPage;
