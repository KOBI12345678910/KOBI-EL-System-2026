# onyx-procurement / web

Front-end layer of the **Techno-Kol Uzi ERP 2026** platform. Hebrew RTL, Palantir-dark theme.
This folder contains the mega index landing page that stitches every dashboard and service in
the Mega-ERP together, plus the individual dashboard files.

---

## Folder structure

```
onyx-procurement/web/
├── index.html                 # Mega landing page — grid of every dashboard tile
├── status.html                # Live system-wide health poller (vanilla JS)
├── onyx-dashboard.jsx         # Procurement dashboard  (Agent-25)
├── vat-dashboard.jsx          # VAT reporting dashboard (Agent-26)
├── bank-dashboard.jsx         # Bank reconciliation     (Agent-27)
├── annual-tax-dashboard.jsx   # Annual tax              (Agent-28)
└── README.md                  # This file
```

> `*.jsx` files are pre-compiled / bundled into matching `*.html` files (e.g.
> `onyx-dashboard.html`) by the build step. The index page links to the **html**
> output — which is what gets served in production.

---

## Dashboard tiles on `index.html`

| # | Module                | Hebrew            | Link                         |
|---|-----------------------|-------------------|------------------------------|
| 1 | Procurement           | רכש               | `onyx-dashboard.html`        |
| 2 | VAT                   | מע"מ              | `vat-dashboard.html`         |
| 3 | Bank Reconciliation   | התאמת בנק         | `bank-dashboard.html`        |
| 4 | Annual Tax            | מס שנתי           | `annual-tax-dashboard.html`  |
| 5 | Payroll               | שכר               | `http://localhost:5173`      |
| 6 | Operations (OPS)      | תפעול             | `../../techno-kol-ops/client/index.html` |
| 7 | Onyx AI               | בינה מלאכותית     | `http://localhost:3200`      |
| 8 | System Status         | סטטוס             | `status.html`                |

Each tile is a dark card with:
- Inline SVG icon
- Hebrew + English title
- Short description
- CTA button

The footer polls `/api/health` every 30 s and updates a status dot (ok / err).

---

## `status.html` — live health page

Pure HTML + vanilla JS (no React, no bundler). Polls each of the 8 services every
**15 seconds** with a **5 s timeout**. Each row shows:
- Service name (Hebrew + English)
- Endpoint URL (mono font)
- Latency in ms
- UP / DOWN / CHECKING badge with a pulsing dot

A summary strip at the top shows total / up / down counts and a human-readable
overall message in Hebrew.

Services checked:

| ID       | URL                              |
|----------|----------------------------------|
| onyx     | `/api/health`                    |
| vat      | `/api/vat/health`                |
| bank     | `/api/bank/health`               |
| tax      | `/api/tax/health`                |
| payroll  | `http://localhost:5173/health`   |
| ops      | `http://localhost:4000/health`   |
| ai       | `http://localhost:3200/health`   |
| db       | `/api/health/db`                 |

Cross-origin services must send `Access-Control-Allow-Origin` or the probe will
fail (and show DOWN) — that's expected behavior.

---

## How to serve

### Option A — `express.static` (recommended, already wired)

The existing `onyx-procurement/server.js` already serves this folder. Add (or
verify) these lines near the top of the Express app:

```js
const path    = require('path');
const express = require('express');
const app     = express();

// serve everything in /web at the site root
app.use(express.static(path.join(__dirname, 'web')));

// send index.html for the root URL
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// health endpoint consumed by index.html + status.html
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', uptime: process.uptime(), ts: Date.now() });
});

app.listen(3000, () => console.log('Onyx web on http://localhost:3000'));
```

Then:

```bash
cd onyx-procurement
node server.js
# browse to http://localhost:3000/
```

### Option B — standalone `http-server` (quick preview)

For a static preview without the Express backend (note: `/api/health` will 404
and the footer dot will turn red, which is fine for a visual check):

```bash
npm install -g http-server
cd onyx-procurement/web
http-server -p 8080 -c-1
# browse to http://localhost:8080/
```

### Option C — VS Code Live Server

Right-click `index.html` in VS Code → **"Open with Live Server"**. Works out of
the box for layout / styling work.

---

## Theme conventions

All dashboards in this folder follow the **Palantir Dark** design system:

| Token         | Value       | Use                    |
|---------------|-------------|------------------------|
| `--bg-0`      | `#05070a`   | page background        |
| `--bg-1`      | `#0a0e14`   | header / footer        |
| `--bg-2`      | `#111720`   | card surface           |
| `--bg-3`      | `#1a2230`   | raised / icon wells    |
| `--border`    | `#1f2a3a`   | separators             |
| `--accent`    | `#3a8dde`   | primary action         |
| `--accent-hi` | `#5aa8ff`   | hover / link           |
| `--ok`        | `#2bd48b`   | success / up           |
| `--warn`      | `#f2b84d`   | checking / pending     |
| `--err`       | `#ef5350`   | failure / down         |

All pages must set `<html lang="he" dir="rtl">` and use a Hebrew-capable font
stack (Heebo / Assistant / Segoe UI / system-ui).

---

## Conventions for new dashboards

1. Add the `.jsx` source in this folder.
2. Build it to `<name>.html` with the existing build pipeline.
3. Add a tile to `index.html` following the existing tile markup.
4. Add a row to `status.html`'s `SERVICES` array with a `/health` endpoint.
5. Update the table in this README.

Do **not** introduce external CSS files into `index.html` or `status.html` —
both are intentionally self-contained so they can be served with zero build
dependencies.
