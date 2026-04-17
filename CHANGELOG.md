# Changelog — KOBI-EL-System-2026

## [1.1.0] — 2026-04-17 — Major Feature Release

### Added
- React Native mobile app (Android + iOS) with 11 screens
- WhatsApp Business API + email notifications
- Security hardening: rate limiting, helmet, CORS, input validation
- Reports dashboard: payroll, projects, suppliers, P&L
- BOM calculator with 8 product types (railings, gates, pergolas...)
- Cash flow forecasting (30/60/90 days)
- P&L statement with month picker
- Executive dashboard with health score
- Monthly targets tracker
- Weekly employee schedule (Sun-Fri, skip Shabbat)
- Field workers map
- Real-time notifications with WebSocket
- Global search (Ctrl+K)
- Keyboard shortcuts
- Multi-language: Hebrew/English/French
- Dark/light theme toggle
- Accessibility: ARIA, keyboard navigation
- Document upload + contract generator
- Admin panel: user management, roles, audit log
- PWA support (install on device)
- CSV/Excel export + print styles
- Inventory alerts with auto-reorder
- Customer portal + supplier portal enhanced
- Project timeline (Gantt-style)
- Production deployment: nginx, Docker Compose, backup scripts
- Automated tests: Vitest + Jest

### Total modules: 107 UI modules across all services (64 payroll + 32 techno-kol-ops + 11 mobile screens)

---

## [1.0.0] — 2026-04-17 — Initial Production Release

### Added
- 4 core services: techno-kol-ops, onyx-procurement, payroll-autonomous, onyx-ai
- 13-stage Master Flow pipeline
- 16 business entities with 15 state machines
- 9 × 360° detail pages
- 50+ Supabase Edge Functions
- Mobile app (React Native + Expo) for Android + iOS
- AI assistants: עוזר קובי (CEO) + עוזר עוזי (Field Ops)
- PWA support for web apps
- Israeli tax compliance (VAT/PCN836, payroll 2026 brackets)
- 4 standalone engines: Enterprise Palantir Core, Realtime Core, Paradigm Engine, Nexus Engine
- WhatsApp Business API integration
- Full CI/CD with GitHub Actions
