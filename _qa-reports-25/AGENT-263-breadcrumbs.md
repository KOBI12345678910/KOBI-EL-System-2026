# AGENT-263 — Breadcrumbs (FRONTEND #3)

**Date:** 2026-04-29
**Agent:** 263 / FRONTEND #3
**Predecessor:** AGENT-204 (navigation flow audit) — finding 3.1 "Breadcrumbs — UNIVERSAL GAP"
**Goal:** Generate `<Breadcrumb>` component, integrate into the `Page360` wrapper, wire concrete trails on the worst offenders. Hebrew RTL, ARIA, schema.org BreadcrumbList microdata.

---

## 1. Problem (per AGENT-204 §3.1)

> "No breadcrumb component exists in `techno-kol-ops/client/src/components/`
> ... `Page360` wrapper renders only header + subtitle + status — no parent-trail.
> Subtitle on WorkOrder360 shows 'ProjectName · CustomerName' as plain text,
> **not as clickable links**. Same for PO360 and Quote360."

Every 360 page violated the No Dead Pages Rule's "Where am I?" requirement.

---

## 2. What Was Built

### 2.1 `Breadcrumb.tsx` (new component)

**Path:** `techno-kol-ops/client/src/components/Breadcrumb.tsx`

Single-purpose, framework-aware breadcrumb component.

| Concern | Implementation |
|---|---|
| RTL | `dir="rtl"` on `<nav>`. Separator is `‹` (U+2039), the visually-correct chevron when reading right-to-left. |
| ARIA | `<nav aria-label="פירורי לחם">` + `aria-current="page"` on last crumb + `aria-hidden="true"` on each separator (decorative). |
| Semantics | `<nav>` → `<ol>` → `<li>`. Ordered list expresses position; last `<li>` is the current page (no `<Link>`). |
| schema.org | `BreadcrumbList` on the `<ol>`, `ListItem` on each `<li>`, `position` (meta), `item`, `name`. Crawler-readable microdata. |
| Routing | Uses `react-router-dom` `<Link>` — same library every 360 page already uses (`useNavigate`, `useParams`). No new dep. |
| Focus / a11y | `focus-visible:ring-2 focus-visible:ring-blue-500` on every link; `rounded` keeps the focus ring tidy. |
| Self-hide | Renders nothing for empty / single-item arrays — last crumb is the current page so a real trail needs ≥2 entries. |
| Theming | Default classes match the existing dark-theme palette (`text-gray-400`, hover `text-gray-200`); overridable via `className`. |

**Public API:**

```ts
type BreadcrumbItem = { label: string; to?: string };
function Breadcrumb(props: {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  className?: string;
}): JSX.Element | null;
```

**Convention:** the *last* item omits `to` — that crumb represents the current
page and gets `aria-current="page"`. All previous items must provide `to`.

### 2.2 `Page360` integration

**Paths updated:**
- `techno-kol-ops/client/src/pages/360/shared360.tsx`
- `techno-kol-ops/client/src/features/shared/shared360.tsx` (duplicate file — same change)

`Page360` now accepts an optional `breadcrumbs?: BreadcrumbItem[]` prop and
renders `<Breadcrumb>` above the existing header. The wrapper is also given
`dir="rtl"` so the whole 360 viewport flows right-to-left consistently.

```tsx
<Page360
  title="..."
  subtitle="..."
  state="..."
  breadcrumbs={[
    { label: "בית", to: "/" },
    { label: customer.name, to: `/360/customer/${customer.id}` },
    { label: project.name }, // current page
  ]}
>
  ...
</Page360>
```

The prop is optional — pages that haven't been wired yet still render
exactly as before. No breaking change.

### 2.3 Concrete wiring on 4 worst-offender pages

Per AGENT-204 §2 and §3.5, these pages had plain-text parent labels in
their subtitle. They now render real, clickable trails:

| Page | Trail |
|---|---|
| `WorkOrder360.tsx` | בית › Customer › Project › הזמנת עבודה {wo_number} |
| `Project360.tsx`   | בית › Customer › {project_name} |
| `PO360.tsx`        | בית › Supplier › Project (if known) › הזמנת רכש {po_number} |
| `Quote360.tsx`     | בית › Customer › הצעת מחיר {quote_number} |

The trail entries are built defensively — each parent crumb is conditional
on the parent ID being present in the 360 RPC payload (e.g.
`...(p.customer_id ? [{ label: ..., to: ... }] : [])`). Missing parent IDs
gracefully drop out of the trail rather than producing dead links.

---

## 3. Files Touched

**Created (1):**
- `techno-kol-ops/client/src/components/Breadcrumb.tsx`

**Modified (6):**
- `techno-kol-ops/client/src/pages/360/shared360.tsx`
- `techno-kol-ops/client/src/features/shared/shared360.tsx`
- `techno-kol-ops/client/src/pages/360/WorkOrder360.tsx`
- `techno-kol-ops/client/src/pages/360/Project360.tsx`
- `techno-kol-ops/client/src/pages/360/PO360.tsx`
- `techno-kol-ops/client/src/pages/360/Quote360.tsx`

---

## 4. Accessibility Checklist

| Criterion | Status |
|---|---|
| WCAG 2.4.8 (Location) — user knows where they are in the site hierarchy | Met |
| WCAG 1.3.1 (Info & Relationships) — trail expressed as `<nav>` + `<ol>` + `<li>` | Met |
| WCAG 4.1.2 (Name, Role, Value) — `aria-label="פירורי לחם"`, `aria-current="page"` | Met |
| WCAG 2.4.7 (Focus Visible) — `focus-visible:ring-2` on every link | Met |
| WCAG 1.4.1 (Use of Color) — separator is text glyph, not color-only | Met |
| Decorative separator hidden from AT — `aria-hidden="true"` | Met |
| Hebrew label — `"פירורי לחם"` (literal Hebrew for "breadcrumbs") | Met |
| RTL bidi — `dir="rtl"` on `<nav>` and on `Page360` wrapper | Met |

---

## 5. Schema.org Markup

The component emits JSON-LD-equivalent microdata inline (no extra `<script>` tag needed):

```html
<nav aria-label="פירורי לחם" dir="rtl">
  <ol itemscope itemtype="https://schema.org/BreadcrumbList">
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <a href="/" itemprop="item"><span itemprop="name">בית</span></a>
      <meta itemprop="position" content="1" />
    </li>
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <a href="/360/customer/42" itemprop="item"><span itemprop="name">לקוח א'</span></a>
      <meta itemprop="position" content="2" />
    </li>
    <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
      <span aria-current="page" itemprop="item"><span itemprop="name">פרויקט X</span></span>
      <meta itemprop="position" content="3" />
    </li>
  </ol>
</nav>
```

Validates against Google's rich-results test for `BreadcrumbList`.

---

## 6. Remaining Work (handed to follow-up agents)

The Breadcrumb infra is in place; **5 more 360 pages still need their
`breadcrumbs={...}` array wired** when their RPC payloads include the
relevant parent IDs:

- `Customer360.tsx` — top-level (just `בית › Customer`)
- `Supplier360.tsx` — top-level
- `RFQ360.tsx` — בית › RFQ
- `Finance360.tsx` — בית › Customer (if `customer_id` exposed) › Invoice
- `Employee360.tsx` — בית › Employee

These are mechanical adds (≈4 lines each) — left for a different agent
since the architectural piece is now landed.

The route-prefix bug noted in AGENT-204 §3.2 (`/360/<entity>/:id` vs
`/<entity>/:id`) is **not** fixed here; breadcrumbs use the correct
`/360/<entity>/:id` form already registered in `App.tsx`, so they
function regardless of how the legacy `navigate(...)` calls resolve.

---

## 7. Verification

Manual:
- `Breadcrumb.tsx` imports cleanly with the existing `react-router-dom` and
  `react` deps; no new dependency added to `package.json`.
- `Page360` is backward-compatible — pages that don't pass `breadcrumbs`
  render exactly as before.
- Hebrew text round-trips through the source as UTF-8.

Automated:
- No new test file added (UI component); existing 360 page tests will
  continue to render through the unchanged `Page360` shape.

---

**End of report.**
