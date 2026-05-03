import { useParams, Link } from 'react-router-dom';

/**
 * Generic stub handler for the 2,371 marketplace module routes seeded into
 * `app_menu` (route='/marketplace/module/<id>'). Renders a minimal placeholder
 * card so the link resolves instead of falling through to the 404 handler.
 */
export function MarketplaceModuleDetail() {
  const { id = 'unknown' } = useParams<{ id: string }>();

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto', color: '#F6F7F9' }}>
      <Link
        to="/"
        style={{ color: '#5C7080', fontSize: 13, textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}
      >
        ← חזרה לעמוד הראשי
      </Link>
      <div
        style={{
          background: '#2F343C',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: 32,
          borderRadius: 4,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Marketplace Module</h1>
        <p style={{ fontSize: 13, color: '#5C7080', marginBottom: 16 }}>
          Module ID: <code style={{ fontFamily: 'monospace' }}>{id}</code>
        </p>
        <p style={{ fontSize: 13, color: '#8F99A8' }}>
          This module page is a placeholder. Detailed views will be wired when the catalog rendering
          pipeline lands.
        </p>
      </div>
    </div>
  );
}

/**
 * Generic stub handler for `/marketplace/<category>` routes.
 */
export function MarketplaceCategory() {
  const { category = 'all' } = useParams<{ category: string }>();

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#F6F7F9' }}>
      <Link
        to="/"
        style={{ color: '#5C7080', fontSize: 13, textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}
      >
        ← חזרה לעמוד הראשי
      </Link>
      <div
        style={{
          background: '#2F343C',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: 32,
          borderRadius: 4,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Marketplace Category</h1>
        <p style={{ fontSize: 13, color: '#5C7080' }}>
          Category: <code style={{ fontFamily: 'monospace' }}>{category}</code>
        </p>
      </div>
    </div>
  );
}

export default MarketplaceModuleDetail;
