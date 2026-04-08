# Overview

This pnpm monorepo implements a metadata-driven ERP system with a Universal Builder Engine and an integrated AI management module. Its core purpose is to enable the generation of unlimited modules, entities, screens, forms, workflows, and automations without direct coding, supporting bilingual interfaces (Hebrew/English). The project aims for rapid development and customization of ERP functionalities, with a strong emphasis on AI integration for advanced features and system management. The business vision is to provide a flexible, scalable ERP solution that adapts to evolving business needs through its no-code/low-code platform capabilities, targeting efficient resource planning, automated processes, and intelligent insights. Key modules include Contract Lifecycle Management, HSE, CMMS, BI Reporting, Israeli Payroll, and advanced AI features like chatbots, AI search, and sentiment analysis. The system also supports PWA and mobile offline synchronization.

# User Preferences

- Hebrew language (RTL) interface
- Do not delete anything without explicit approval
- Will send code material for building - only add what's missing
- Will send updates periodically

## System Architecture

The system is a pnpm monorepo using TypeScript, targeting Node.js 24. The backend uses Express 5, PostgreSQL, and Drizzle ORM, with Zod for validation. The frontend is a React application built with Vite, TailwindCSS, and shadcn/ui. The system is metadata-driven, using platform tables to define all ERP components.

**Core Architectural Patterns and Decisions:**

-   **Metadata-Driven Architecture**: A Universal Builder Engine allows defining ERP components (modules, entities, screens, forms, workflows) without direct coding, leveraging platform tables. Includes a governance layer for roles, permissions, and publishing workflows.
-   **AI Integration**: A dedicated Claude System Layer and Kobi Autonomous AI Agent v2.5 integrate AI for metadata management, intelligent features (chatbots, search, insights, form fill, smart actions, notifications), and an AI Development IDE.
    -   **Kimi 2 Super AI Development IDE**: A full-featured development environment and AI management platform built into the ERP, offering 189 AI expert agents. It provides workspace tabs for Chat, Code Editor, Terminal, Files, Live Preview, QA Dashboard, Database management, System Monitor, Version Control, Data Flow visualization, Module Builder, Bug Scanner, API Documentation. It features a Multi-Agent Swarm system for parallel execution of up to 10 AI agents, each running up to 10 autonomous loops with 75+ action types across 9 categories.
    -   **Kobi (קובי) Autonomous AI Agent v2.5**: Full-platform autonomous AI agent powered by Claude Sonnet 4, with 111 tools across 22 modules for file, terminal, search, package, Git, DB, browser, deploy, preview, test, lint, env, scaffold, snapshot, docgen, performance, network, watcher, task queue, code review, and dependency management. Includes advanced features like rate limit management, SQL result caching, tool budget awareness, long-term memory, and phased execution strategy.
-   **Event-Driven Workflow and Automation Engine**: Supports scheduled/recurring triggers, multi-step approval flows, and conditional branching.
-   **Security Features**: Multi-user authentication, session-based tokens, PBKDF2-SHA512 hashing, account lockout, comprehensive RBAC, and Row-Level Security (RLS).
-   **Scalability & Performance**: PostgreSQL connection pooling, database indexing, structured logging, global error handling, and frontend optimization.
-   **Internationalization**: Full Hebrew (RTL) language support across UI components and data.

**Key Features and Implementations:**

-   **UI/UX**: Dynamic Form Renderer (30+ field types, conditional visibility, AI Smart Form Fill), Dynamic Detail Pages (metadata-driven with AI Record Summary), Module Runtime Views (full entity pages with AI Smart Actions). Global UX upgrades include a Command Palette (Ctrl+K), collapsible sidebar, enhanced breadcrumbs, smooth page transitions, ThemeToggle, and skeleton loaders.
-   **Backend**:
    -   **Generic CRUD Engine**: Standardized REST API for all DB tables (pagination, search, filter, sort, create, update, soft delete via `deleted_at`, restore, permanent delete [SUPER_ADMIN only], export, import, statistics). All tables with `deleted_at` column automatically filter deleted records; pass `?include_deleted=true` to bypass.
    -   **Soft Delete Infrastructure**: `deleted_at TIMESTAMPTZ` column added to employees, customers, work_orders, production_work_orders, raw_materials, price_quotes, customer_invoices, supplier_invoices, suppliers, purchase_orders, sales_orders, quotes, projects, inventory_transactions. Indexes on `deleted_at IS NULL` for performance.
    -   **Recycle Bin (סל מיחזור)**: Admin page at `/platform/recycle-bin` showing all soft-deleted records across all entity tables. Restore action available to all users; permanent delete restricted to SUPER_ADMIN role. API at `/api/recycle-bin`.
    -   **Automated Backup Scheduling**: Daily backup at 02:00 AM Asia/Jerusalem timezone using `Intl.DateTimeFormat` for timezone-correct scheduling. Backup history tracked in `system_backups` table. Manual backup trigger at `POST /api/settings/backups/trigger` runs `backup-db.sh` script and records result.
    -   **Dedicated Entity Routes**: Domain-specific CRUD for core entities with pagination, filters, auto-numbering, stats, and audit log integration.
    -   **API Gateway**: OpenAPI 3.0.3 Swagger UI, GraphQL endpoint with GraphiQL playground, API key management, per-user rate limiting, response caching, and API key authentication.
    -   **Audit Log System**: Tracks all INSERT/UPDATE/DELETE operations with a full Hebrew UI.
    -   **Data Flow Automation**: Automatic cascading triggers and data propagation across 27 entity types with 84 cross-module relations.
-   **Mobile & Offline**:
    -   **ERP Mobile App (Expo/React Native)**: Token-based authentication, global RTL enforcement, and offline capabilities.
    -   **Offline Sync**: Mobile offline sync using Expo-SQLite (native) and IndexedDB (PWA) with DataSyncManager for periodic data synchronization, conflict resolution (last-write-wins), and a sync status UI. Supports Hebrew voice commands for various ERP functions.
    -   **PWA**: Vite-plugin-pwa with Workbox, caching strategies (cache-first for static, network-first for APIs), and PWA install prompts.
-   **AI Modules**:
    -   **AI Engine**: Employee Chatbot (Hebrew, Claude AI, queries ERP data), AI-Enhanced Search (cross-module, Claude AI re-ranking), Sentiment Analysis Dashboard (Claude AI classification of text from CRM/employee/supplier notes).
-   **Industry-Specific Modules**:
    -   **Contract Lifecycle Management (CLM)**: Full contract lifecycle management (pipeline, list, obligations, renewals), detail dialog (overview, parties, obligations, redlines, timeline), contract templates, e-signature workflows, and AI analytics/risk scoring.
    -   **HSE Module**: Environmental Compliance (Waste Management, Environmental Permits, Emissions Monitoring), KPI Dashboard (LTIR, TRIR, incident rates), Israeli Regulatory Compliance (Safety Committee, Safety Officer, Checklist), Chemical Safety (MSDS), Work Permits (multi-level approval), Emergency Preparedness.
    -   **CMMS Support**: Spare Parts Inventory (low-stock alerts, purchase requests), Contractors & Vendors (SLA compliance), Maintenance Budget (allocation, actuals, alerts).
    -   **Israeli Payroll Engine**: Full payroll run workflow (tax brackets, credit points, Bituach Leumi, pension, Keren Hishtalmut, severance, convalescence pay), Labor Cost Allocation, Employer Cost Report.
    -   **BI Domain-Specific Reports**: Financial Statements (P&L, Balance Sheet, Cash Flow, Trial Balance), Sales Analytics, Production Analytics, Inventory Analytics, HR Analytics.
    -   **Procurement Workflow**: RFQ management (auto-scoring, comparison), PO Multi-Level Approval (amount-based thresholds, audit trail), Three-Way Matching (PO/GRN/Invoice reconciliation), Landed Cost Distribution.
    -   **Supplier Intelligence & Portal**: Vendor self-service portal, performance scoring, contract management, risk monitoring.
    -   **PM Module**: WBS, Gantt Chart, scheduling engine with critical path calculation and task dependencies.
    -   **QMS (ISO Compliance Layer)**: ISO certifications, quality policies, quality objectives, document control (versioning, approvals, distribution).
    -   **Enterprise DMS**: Full-text search, OCR, approval workflows, version control, secure sharing, legal hold.
    -   **Fabrication Domain**: Full manufacturing module for metal/aluminum/glass.
-   **GPS Connect Dashboard**: Full GPS tracking and location management at `/installations/gps-map`. Features: live team map with dark tiles (CARTO), dashboard stats (distance/saved locations/shares/pings), saved locations with categories (home/work/food/nature), location sharing with unique 8-char codes (crypto-secure), tracking history timeline. API: `/api/field-ops/gps/saved-locations` (CRUD), `/api/field-ops/gps/share-location`, `/api/field-ops/gps/share/:code`, `/api/field-ops/gps/my-shares`, `/api/field-ops/gps/tracking-stats`. DB tables: `gps_saved_locations`, `gps_location_shares`, `user_gps_status`. The `user_gps_status` table centralizes each user's last known GPS data (lat/lng/accuracy/speed/battery/heading/altitude/address, ping count, moving status) — both `/field-ops/location-ping` and `/field-ops/gps/update-location` endpoints upsert into it. Team map query uses simple JOIN on `user_gps_status` instead of LATERAL subqueries. Users table has `gps_enabled` (default true) and `gps_device_id` columns. GPS profile section at `/settings?tab=profile` (third tab). Mobile web version at `erp-mobile/app/field-ops/gps-tracking.web.tsx` shows stats overview and tracking history.
-   **Integration Runtime**: Manages external API connections, authentication, field mapping, SSRF protection, inbound webhooks, and CSV/JSON export/import. Includes EDI Integration Module for automated document exchange.
    -   **Smart API Connection Hub**: Central management for external API connections at `/settings/api-connection-hub`. Full CRUD, health-check testing, connection logs, stats dashboard, SSRF protection, and secret redaction. Backend: `api-connection-hub.ts`, DB tables: `api_connections`, `api_connection_logs`.
-   **Chat & Communication**: Organization Chat System (internal messaging, group channels, direct messages, support tickets), External Messaging Integrations (WhatsApp, Gmail, SMS, Telegram Bot).
-   **Data Seeding**: Seed infrastructure exists but is NOT auto-called at startup. System runs clean for real production data entry.
-   **System Data Reset**: `POST /api/system/clear-all-data` and `GET /api/system/data-summary` endpoints (super-admin auth required) for clearing all business data while preserving system configuration (modules, channels, folders, AI agents, unit conversions). Uses transactional cleanup with rollback on failure.
-   **Executive War Room & Intelligence Layer**: CEO command center with cross-module intelligence, company health score, financial heatmap, production status, sales pulse, live alerts, KPI grid, and end-to-end order pipeline visualization.

## External Dependencies

-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: Database interaction layer.
-   **Orval**: API client and schema generation tool.
-   **Kimi AI (Moonshot)**: kimi-k2.5 via `api.moonshot.ai/v1` for general AI functionalities.
-   **Anthropic Claude**: `claude-sonnet-4-20250514` for Kobi autonomous AI agent, OCR, and other AI integrations (model fallback to `claude-3-5-haiku-20241022`).
-   **Google OAuth**: Optional login via Google Identity Services.
-   **Recharts**: Frontend data visualization library.
-   **Nodemailer**: For sending emails via Gmail SMTP.
-   **WhatsApp Business API (Meta Graph API)**: For sending WhatsApp messages.
-   **Twilio/Nexmo/019SMS**: SMS gateway providers.
-   **Telegram Bot API**: For Telegram messaging.
-   **idb**: JavaScript library for IndexedDB (PWA offline data).
-   **expo-sqlite**: For SQLite database on mobile.
-   **vite-plugin-pwa**: For Progressive Web App capabilities.

## Audit Fixes (Task #303)

-   **Israeli Validation Utilities** (`src/utils/`): `israeliId.ts` (9-digit Luhn checksum validator), `israeliPhone.ts` (mobile/landline regex), `money.ts` (agorot/shekels, 18% VAT), `dateFormat.ts` (Hebrew date formatting), `index.ts` (barrel export).
-   **Auth Flow Completion**: `/403` forbidden page (`src/pages/forbidden.tsx`), standalone `/forgot-password` page, token-based `/reset-password` page; backend `POST /api/auth/reset-password/:token` endpoint; App.tsx updated with lazy imports and pre-auth routing.
-   **Business Lifecycle Wiring** (`sales-orders.tsx`): "צור הזמנת עבודה" and "צור חשבונית" action buttons on confirmed/shipped/delivered orders; calls `POST /api/work-orders` and `POST /api/finance/invoices`.
-   **HR Employees Validation** (`employees-list.tsx`): Israeli ID checksum via `validateIsraeliId` + phone format via `validateIsraeliPhone` wired into `useFormValidation` schema; `save()` now calls `validate()` before submitting.