/**
 * HelpCenter.jsx — Agent X-22
 * ─────────────────────────────────────────────
 * Internal knowledge base / help center UI for Techno-Kol Uzi mega-ERP.
 *
 * Palantir dark theme, Hebrew RTL by default, bilingual (he / en).
 * Zero external UI libs — inline styles only, no CSS imports.
 *
 * Props:
 *   kb         : instance returned by kb-engine.createKB()
 *                (must expose: listCategories, getCategory, getArticle,
 *                 searchKB, markHelpful, getPopular, getRelated)
 *   lang       : 'he' (default) | 'en'
 *   onLangChange: (lang) => void           — optional
 *   onOpenArticle: (id) => void            — optional telemetry hook
 *
 * The component is defensive — if `kb` is undefined it renders an empty
 * help-center shell with a clear Hebrew error, never crashes.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Palantir dark theme                                                */
/* ------------------------------------------------------------------ */

const THEME = {
  bg: '#0b0d10',
  panel: '#13171c',
  panelAlt: '#181d24',
  border: '#232a33',
  borderSoft: '#1a2029',
  accent: '#4a9eff',
  accentSoft: 'rgba(74,158,255,0.12)',
  text: '#e6edf3',
  textDim: '#8b95a5',
  textMuted: '#5a6472',
  good: '#3ddc84',
  bad: '#ff5c5c',
  warn: '#f5a623',
  hoverRow: '#1b2028',
  selectedRow: '#1f2730',
};

/* ------------------------------------------------------------------ */
/*  Bilingual labels                                                   */
/* ------------------------------------------------------------------ */

const L = {
  he: {
    title: 'מרכז עזרה',
    subtitle: 'ידע שימושי למשתמשי מערכת Techno-Kol',
    searchPlaceholder: 'חיפוש במאגר הידע…',
    search: 'חפש',
    clear: 'נקה',
    categories: 'קטגוריות',
    allArticles: 'כל המאמרים',
    popular: 'מאמרים פופולריים',
    related: 'קשור',
    faqs: 'שאלות נפוצות',
    helpful: 'עזר לי',
    notHelpful: 'לא עזר לי',
    helpfulCount: 'עזר ל־',
    version: 'גרסה',
    lastUpdated: 'עודכן לאחרונה',
    author: 'נכתב ע״י',
    views: 'צפיות',
    tags: 'תגיות',
    breadcrumbHome: 'בית',
    noArticles: 'לא נמצאו מאמרים בקטגוריה זו',
    noSearchResults: 'לא נמצאו תוצאות לחיפוש',
    searchResultsFor: 'תוצאות חיפוש עבור',
    resultsFound: 'תוצאות נמצאו',
    chooseArticle: 'בחרו מאמר מהרשימה כדי להתחיל',
    readMore: 'קרא עוד',
    langSwitch: 'English',
    kbMissing: 'מאגר הידע אינו זמין',
    thanksForFeedback: 'תודה על המשוב',
    ariaSearch: 'שדה חיפוש',
    ariaCategoryTree: 'עץ קטגוריות',
    ariaArticleBody: 'גוף מאמר',
  },
  en: {
    title: 'Help Center',
    subtitle: 'Knowledge base for Techno-Kol users',
    searchPlaceholder: 'Search the knowledge base…',
    search: 'Search',
    clear: 'Clear',
    categories: 'Categories',
    allArticles: 'All articles',
    popular: 'Popular articles',
    related: 'Related',
    faqs: 'FAQs',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    helpfulCount: 'Helpful for',
    version: 'Version',
    lastUpdated: 'Last updated',
    author: 'Written by',
    views: 'Views',
    tags: 'Tags',
    breadcrumbHome: 'Home',
    noArticles: 'No articles in this category',
    noSearchResults: 'No search results',
    searchResultsFor: 'Search results for',
    resultsFound: 'results',
    chooseArticle: 'Pick an article from the list to begin',
    readMore: 'Read more',
    langSwitch: 'עברית',
    kbMissing: 'Knowledge base unavailable',
    thanksForFeedback: 'Thanks for the feedback',
    ariaSearch: 'Search input',
    ariaCategoryTree: 'Category tree',
    ariaArticleBody: 'Article body',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(ts, lang) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return String(ts);
  }
}

function pick(obj, lang) {
  if (!obj) return '';
  return obj[lang] || obj.he || obj.en || '';
}

/* ------------------------------------------------------------------ */
/*  Sub-components (plain functional, no memo required)                */
/* ------------------------------------------------------------------ */

function CategoryTree({ kb, lang, onSelectCategory, selectedCategory }) {
  const cats = kb ? kb.listCategories() : [];
  const roots = cats.filter((c) => !c.parent);
  const childrenOf = (id) => cats.filter((c) => c.parent === id);

  const renderNode = (cat, depth) => {
    const isSelected = selectedCategory === cat.id;
    const kids = childrenOf(cat.id);
    return (
      <div key={cat.id} style={{ marginInlineStart: depth * 14 }}>
        <button
          type="button"
          onClick={() => onSelectCategory(cat.id)}
          style={{
            ...styles.catBtn,
            background: isSelected ? THEME.accentSoft : 'transparent',
            color: isSelected ? THEME.accent : THEME.text,
            borderInlineStart: isSelected
              ? `3px solid ${THEME.accent}`
              : '3px solid transparent',
          }}
          aria-pressed={isSelected}
        >
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>
            {pick(cat.name, lang)}
          </span>
        </button>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <nav aria-label={L[lang].ariaCategoryTree} style={styles.navBox}>
      <div style={styles.sideHeader}>{L[lang].categories}</div>
      <button
        type="button"
        onClick={() => onSelectCategory(null)}
        style={{
          ...styles.catBtn,
          color: selectedCategory == null ? THEME.accent : THEME.text,
          background:
            selectedCategory == null ? THEME.accentSoft : 'transparent',
          borderInlineStart:
            selectedCategory == null
              ? `3px solid ${THEME.accent}`
              : '3px solid transparent',
        }}
      >
        {L[lang].allArticles}
      </button>
      {roots.map((c) => renderNode(c, 0))}
    </nav>
  );
}

function Breadcrumb({ items, lang, onNavigate }) {
  return (
    <div style={styles.breadcrumb} aria-label="breadcrumb">
      {items.map((it, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span style={styles.breadSep}>{lang === 'he' ? '›' : '/'}</span>}
          {it.onClick ? (
            <button
              type="button"
              onClick={it.onClick}
              style={styles.breadLink}
            >
              {it.label}
            </button>
          ) : (
            <span style={styles.breadCurrent}>{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ArticleCard({ article, lang, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      style={styles.articleCard}
    >
      <div style={styles.articleCardTitle}>{pick(article.title, lang)}</div>
      <div style={styles.articleCardMeta}>
        <span>v{article.version}</span>
        <span>•</span>
        <span>{fmtDate(article.last_updated, lang)}</span>
        <span>•</span>
        <span>
          {article.views} {L[lang].views}
        </span>
      </div>
      {article.tags && article.tags.length > 0 && (
        <div style={styles.tagRow}>
          {article.tags.slice(0, 4).map((t) => (
            <span key={t} style={styles.tag}>{t}</span>
          ))}
        </div>
      )}
    </button>
  );
}

function FeedbackBar({ article, kb, lang, onFeedback }) {
  const [submitted, setSubmitted] = useState(null);
  const submit = (ok) => {
    if (!kb || !article) return;
    try {
      kb.markHelpful(article.id, ok);
      setSubmitted(ok);
      onFeedback && onFeedback(article.id, ok);
    } catch (_err) {
      // stay silent, just don't crash
    }
  };
  return (
    <div style={styles.feedbackBox}>
      {submitted == null ? (
        <>
          <span style={{ color: THEME.textDim, marginInlineEnd: 8 }}>
            {lang === 'he' ? 'האם המאמר עזר?' : 'Was this article helpful?'}
          </span>
          <button
            type="button"
            onClick={() => submit(true)}
            style={{ ...styles.btnGhost, color: THEME.good, borderColor: THEME.good }}
          >
            {L[lang].helpful}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            style={{ ...styles.btnGhost, color: THEME.bad, borderColor: THEME.bad }}
          >
            {L[lang].notHelpful}
          </button>
        </>
      ) : (
        <span style={{ color: submitted ? THEME.good : THEME.warn }}>
          {L[lang].thanksForFeedback}
        </span>
      )}
      <span style={{ flex: 1 }} />
      <span style={{ color: THEME.textMuted, fontSize: 12 }}>
        {L[lang].helpfulCount}: {article.helpful_count} / {article.not_helpful_count}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function HelpCenter({
  kb,
  lang: langProp = 'he',
  onLangChange,
  onOpenArticle,
}) {
  const [lang, setLang] = useState(langProp);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedArticleId, setSelectedArticleId] = useState(null);

  useEffect(() => {
    setLang(langProp);
  }, [langProp]);

  const toggleLang = () => {
    const next = lang === 'he' ? 'en' : 'he';
    setLang(next);
    onLangChange && onLangChange(next);
  };

  const dir = lang === 'he' ? 'rtl' : 'ltr';

  /* ---- data derived from kb ---- */
  const selectedArticle = useMemo(() => {
    if (!kb || !selectedArticleId) return null;
    return kb.getArticle(selectedArticleId, { incrementViews: false });
  }, [kb, selectedArticleId]);

  const categoryView = useMemo(() => {
    if (!kb || !selectedCategory) return null;
    return kb.getCategory(selectedCategory);
  }, [kb, selectedCategory]);

  const popular = useMemo(() => {
    if (!kb) return [];
    return kb.getPopular(5);
  }, [kb]);

  const relatedArticles = useMemo(() => {
    if (!kb || !selectedArticleId) return [];
    return kb.getRelated(selectedArticleId, 4);
  }, [kb, selectedArticleId]);

  /* ---- handlers ---- */
  const handleSearch = useCallback(() => {
    if (!kb) return;
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const results = kb.searchKB(q, lang);
    setSearchResults(results);
    setSelectedArticleId(null);
  }, [kb, query, lang]);

  const handleOpenArticle = useCallback(
    (id) => {
      if (!kb) return;
      setSelectedArticleId(id);
      kb.getArticle(id, { incrementViews: true });
      onOpenArticle && onOpenArticle(id);
    },
    [kb, onOpenArticle]
  );

  const handleCategorySelect = useCallback((catId) => {
    setSelectedCategory(catId);
    setSelectedArticleId(null);
    setSearchResults(null);
  }, []);

  const clearSearch = () => {
    setQuery('');
    setSearchResults(null);
  };

  /* ---- early abort on missing kb ---- */
  if (!kb) {
    return (
      <div style={{ ...styles.root, direction: dir }}>
        <div style={styles.errorBox}>{L[lang].kbMissing}</div>
      </div>
    );
  }

  /* ---- all articles (flat) when neither category nor search ---- */
  const flatArticles = useMemo(() => {
    if (!kb) return [];
    const map = kb._state && kb._state.articles;
    if (!map) return [];
    return Array.from(map.values());
  }, [kb, searchResults, selectedCategory]);

  /* ---- derived list to render in middle pane ---- */
  let listArticles = flatArticles;
  let listHeader = L[lang].allArticles;
  if (searchResults != null) {
    listArticles = searchResults.map((r) => r.article);
    listHeader = `${L[lang].searchResultsFor} "${query}" (${searchResults.length} ${L[lang].resultsFound})`;
  } else if (categoryView) {
    listArticles = categoryView.articles;
    listHeader = pick(categoryView.category.name, lang);
  }

  /* ---- breadcrumb items ---- */
  const crumbs = [{ label: L[lang].breadcrumbHome, onClick: () => { setSelectedCategory(null); setSelectedArticleId(null); setSearchResults(null); } }];
  if (categoryView) {
    crumbs.push({
      label: pick(categoryView.category.name, lang),
      onClick: selectedArticle
        ? () => setSelectedArticleId(null)
        : null,
    });
  }
  if (selectedArticle) {
    crumbs.push({ label: pick(selectedArticle.title, lang), onClick: null });
  }

  /* ---- render ---- */
  return (
    <div
      style={{ ...styles.root, direction: dir }}
      lang={lang}
      data-testid="helpcenter-root"
    >
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>{L[lang].title}</h1>
          <div style={styles.h2}>{L[lang].subtitle}</div>
        </div>
        <button
          type="button"
          onClick={toggleLang}
          style={styles.langBtn}
          aria-label="toggle language"
        >
          {L[lang].langSwitch}
        </button>
      </header>

      {/* Search bar */}
      <div style={styles.searchBar}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          placeholder={L[lang].searchPlaceholder}
          aria-label={L[lang].ariaSearch}
          style={styles.searchInput}
        />
        <button type="button" onClick={handleSearch} style={styles.btnPrimary}>
          {L[lang].search}
        </button>
        {query && (
          <button type="button" onClick={clearSearch} style={styles.btnGhost}>
            {L[lang].clear}
          </button>
        )}
      </div>

      {/* Three-pane layout */}
      <div style={styles.body}>
        {/* Left: category tree + popular */}
        <aside style={styles.sideLeft}>
          <CategoryTree
            kb={kb}
            lang={lang}
            onSelectCategory={handleCategorySelect}
            selectedCategory={selectedCategory}
          />

          <div style={styles.popBox}>
            <div style={styles.sideHeader}>{L[lang].popular}</div>
            {popular.length === 0 ? (
              <div style={styles.emptyDim}>—</div>
            ) : (
              popular.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleOpenArticle(a.id)}
                  style={styles.popLink}
                >
                  {pick(a.title, lang)}{' '}
                  <span style={{ color: THEME.textMuted }}>({a.views})</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Center: list or article body */}
        <main style={styles.center}>
          <Breadcrumb items={crumbs} lang={lang} />

          {selectedArticle ? (
            <article style={styles.articleView} aria-label={L[lang].ariaArticleBody}>
              <h2 style={styles.articleTitle}>{pick(selectedArticle.title, lang)}</h2>
              <div style={styles.articleMetaRow}>
                <span>
                  {L[lang].author}: {selectedArticle.author}
                </span>
                <span>
                  {L[lang].version} {selectedArticle.version}
                </span>
                <span>
                  {L[lang].lastUpdated}: {fmtDate(selectedArticle.last_updated, lang)}
                </span>
                <span>
                  {selectedArticle.views} {L[lang].views}
                </span>
              </div>

              <div style={styles.articleBody}>
                {pick(selectedArticle.body, lang)
                  .split(/\n\n+/)
                  .map((p, i) => (
                    <p key={i} style={styles.p}>
                      {p}
                    </p>
                  ))}
              </div>

              {selectedArticle.tags && selectedArticle.tags.length > 0 && (
                <div style={styles.tagRowWide}>
                  <span style={{ color: THEME.textDim, marginInlineEnd: 8 }}>
                    {L[lang].tags}:
                  </span>
                  {selectedArticle.tags.map((t) => (
                    <span key={t} style={styles.tag}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <FeedbackBar
                article={selectedArticle}
                kb={kb}
                lang={lang}
                onFeedback={() => {
                  // force a re-render with fresh counts
                  setSelectedArticleId(selectedArticle.id);
                }}
              />
            </article>
          ) : (
            <section>
              <div style={styles.listHeader}>{listHeader}</div>

              {/* FAQs for the selected category */}
              {categoryView &&
                categoryView.category.faqs &&
                categoryView.category.faqs.length > 0 && (
                  <div style={styles.faqBox}>
                    <div style={styles.sideHeader}>{L[lang].faqs}</div>
                    {categoryView.category.faqs.map((f, i) => (
                      <details key={i} style={styles.faqDetails}>
                        <summary style={styles.faqSummary}>{pick(f.q, lang)}</summary>
                        <p style={styles.faqAnswer}>{pick(f.a, lang)}</p>
                      </details>
                    ))}
                  </div>
                )}

              {/* Article list */}
              {listArticles.length === 0 ? (
                <div style={styles.emptyBox}>
                  {searchResults != null
                    ? L[lang].noSearchResults
                    : L[lang].noArticles}
                </div>
              ) : (
                <div style={styles.grid}>
                  {listArticles.map((a) => (
                    <ArticleCard
                      key={a.id}
                      article={a}
                      lang={lang}
                      onOpen={handleOpenArticle}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        {/* Right: related articles sidebar (only when viewing an article) */}
        <aside style={styles.sideRight}>
          <div style={styles.sideHeader}>{L[lang].related}</div>
          {selectedArticle && relatedArticles.length > 0 ? (
            relatedArticles.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => handleOpenArticle(a.id)}
                style={styles.relatedLink}
              >
                {pick(a.title, lang)}
              </button>
            ))
          ) : (
            <div style={styles.emptyDim}>
              {selectedArticle ? '—' : L[lang].chooseArticle}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline styles                                                      */
/* ------------------------------------------------------------------ */

const styles = {
  root: {
    background: THEME.bg,
    color: THEME.text,
    fontFamily:
      "'Heebo','Segoe UI','Rubik',system-ui,-apple-system,sans-serif",
    minHeight: '100vh',
    padding: 16,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingInline: 8,
    marginBottom: 12,
  },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: THEME.text },
  h2: { fontSize: 13, color: THEME.textDim, marginTop: 4 },
  langBtn: {
    background: THEME.panelAlt,
    color: THEME.accent,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
  },
  searchBar: {
    display: 'flex',
    gap: 8,
    padding: 10,
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    background: THEME.bg,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '8px 10px',
    fontSize: 14,
    outline: 'none',
  },
  btnPrimary: {
    background: THEME.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  btnGhost: {
    background: 'transparent',
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 13,
  },
  body: {
    display: 'grid',
    gridTemplateColumns: '220px 1fr 220px',
    gap: 12,
    alignItems: 'start',
  },
  sideLeft: {
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 10,
    minHeight: 300,
  },
  sideRight: {
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 10,
    minHeight: 300,
  },
  center: {
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 14,
    minHeight: 400,
  },
  sideHeader: {
    fontSize: 11,
    color: THEME.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${THEME.borderSoft}`,
  },
  navBox: { marginBottom: 16 },
  catBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    background: 'transparent',
    color: THEME.text,
    border: 'none',
    padding: '6px 8px',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 3,
  },
  popBox: {},
  popLink: {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    background: 'transparent',
    color: THEME.text,
    border: 'none',
    padding: '6px 0',
    fontSize: 12,
    cursor: 'pointer',
  },
  breadcrumb: {
    fontSize: 12,
    color: THEME.textDim,
    marginBottom: 10,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  breadLink: {
    background: 'transparent',
    border: 'none',
    color: THEME.accent,
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
  },
  breadCurrent: { color: THEME.text },
  breadSep: { color: THEME.textMuted },
  listHeader: {
    fontSize: 14,
    color: THEME.text,
    fontWeight: 600,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${THEME.borderSoft}`,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 10,
  },
  articleCard: {
    background: THEME.panelAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 12,
    cursor: 'pointer',
    textAlign: 'start',
    color: THEME.text,
    fontFamily: 'inherit',
  },
  articleCardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: THEME.text,
    marginBottom: 6,
  },
  articleCardMeta: {
    display: 'flex',
    gap: 6,
    fontSize: 11,
    color: THEME.textMuted,
  },
  tagRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 },
  tagRowWide: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
    margin: '12px 0',
  },
  tag: {
    background: THEME.accentSoft,
    color: THEME.accent,
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
  },
  articleView: {},
  articleTitle: {
    margin: 0,
    fontSize: 22,
    color: THEME.text,
    fontWeight: 700,
    marginBottom: 8,
  },
  articleMetaRow: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
    color: THEME.textDim,
    fontSize: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `1px solid ${THEME.borderSoft}`,
  },
  articleBody: {
    lineHeight: 1.7,
    fontSize: 14,
    color: THEME.text,
  },
  p: { margin: '0 0 12px' },
  feedbackBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    background: THEME.panelAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    marginTop: 16,
    fontSize: 13,
  },
  relatedLink: {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    background: 'transparent',
    color: THEME.text,
    border: `1px solid ${THEME.borderSoft}`,
    borderRadius: 4,
    padding: '8px 10px',
    marginBottom: 6,
    cursor: 'pointer',
    fontSize: 12,
  },
  faqBox: {
    background: THEME.panelAlt,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  faqDetails: {
    borderBottom: `1px solid ${THEME.borderSoft}`,
    padding: '6px 0',
  },
  faqSummary: {
    cursor: 'pointer',
    color: THEME.accent,
    fontSize: 13,
  },
  faqAnswer: {
    color: THEME.text,
    margin: '8px 0 0 0',
    fontSize: 13,
    lineHeight: 1.6,
  },
  emptyBox: {
    textAlign: 'center',
    color: THEME.textDim,
    padding: 40,
    background: THEME.panelAlt,
    border: `1px dashed ${THEME.border}`,
    borderRadius: 6,
    fontSize: 14,
  },
  emptyDim: { color: THEME.textMuted, fontSize: 12, padding: 4 },
  errorBox: {
    padding: 16,
    background: THEME.panel,
    border: `1px solid ${THEME.bad}`,
    color: THEME.bad,
    borderRadius: 6,
    textAlign: 'center',
  },
};
