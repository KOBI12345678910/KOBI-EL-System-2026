# DOMAIN — comms — Permission Matrix

**Generated:** 2026-04-18
**Scope:** All `/api/comms/*` endpoints and `erp-app/src/pages/comms/*` surfaces.
**Rule:** Comms is a customer-facing domain. All routes require `authMiddleware`. Admin-only surfaces (portal users, templates, campaigns, chatbot, help articles authoring) require superadmin. End-user surfaces (own notifications, own tickets) require authenticated session.

## Legend

| symbol | meaning |
|---|---|
| SA | superadmin |
| A  | admin (support / comms manager) |
| S  | support agent |
| U  | authenticated user (internal) |
| P  | portal user (customer / supplier) |
| —  | not allowed |

## Matrix — API endpoints

| Endpoint | Method | SA | A | S | U | P | Notes |
|---|---|---|---|---|---|---|---|
| `/api/comms/threads` | GET | ✅ | ✅ | ✅ | ✅ | scoped | scope-by-linked-entity for P |
| `/api/comms/threads` | POST | ✅ | ✅ | ✅ | ✅ | — | |
| `/api/comms/threads/:id` | PATCH | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/threads/:id` | DELETE | ✅ | ✅ | — | — | — | soft delete |
| `/api/comms/threads/inbox/feed` | GET | ✅ | ✅ | ✅ | ✅ | — | unified inbox |
| `/api/comms/email-messages` | GET | ✅ | ✅ | ✅ | scoped | — | |
| `/api/comms/email-messages/send` | POST | ✅ | ✅ | ✅ | ✅ | — | enqueue |
| `/api/comms/email-messages/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/email-messages/:id` | DELETE | ✅ | ✅ | — | — | — | |
| `/api/comms/sms-messages` | GET | ✅ | ✅ | ✅ | scoped | — | |
| `/api/comms/sms-messages/send` | POST | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/sms-messages/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/whatsapp-messages` | GET | ✅ | ✅ | ✅ | scoped | — | |
| `/api/comms/whatsapp-messages/send` | POST | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/notifications` | GET | ✅ | ✅ | ✅ | own | own | filter by user_id |
| `/api/comms/notifications` | POST | ✅ | ✅ | ✅ | — | — | server-side producer |
| `/api/comms/notifications/:id` | PATCH | ✅ | ✅ | ✅ | own | own | mark read/archive |
| `/api/comms/notifications/mark-all-read` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `/api/comms/support-tickets` | GET | ✅ | ✅ | ✅ | own | own | |
| `/api/comms/support-tickets` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `/api/comms/support-tickets/:id` | PATCH | ✅ | ✅ | ✅ | own | own (limited) | |
| `/api/comms/support-tickets/:id/assign` | POST | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/support-tickets/:id/resolve` | POST | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/support-tickets/:id` | DELETE | ✅ | ✅ | — | — | — | soft delete |
| `/api/comms/portal-users` | GET | ✅ | ✅ | — | — | — | admin only |
| `/api/comms/portal-users` | POST | ✅ | ✅ | — | — | — | |
| `/api/comms/portal-users/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/portal-users/:id` | DELETE | ✅ | — | — | — | — | SA only — destructive |
| `/api/comms/chatbot-sessions` | GET | ✅ | ✅ | ✅ | — | — | internal/admin |
| `/api/comms/chatbot-sessions` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | session create |
| `/api/comms/chatbot-sessions/:id` | PATCH | ✅ | ✅ | ✅ | own | own | |
| `/api/comms/chatbot-sessions/:id/feedback` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `/api/comms/help-articles` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | published only for P |
| `/api/comms/help-articles` | POST | ✅ | ✅ | — | — | — | |
| `/api/comms/help-articles/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/help-articles/:id` | DELETE | ✅ | — | — | — | — | SA only |
| `/api/comms/message-templates` | GET | ✅ | ✅ | ✅ | — | — | |
| `/api/comms/message-templates` | POST | ✅ | ✅ | — | — | — | |
| `/api/comms/message-templates/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/message-templates/:id/render` | POST | ✅ | ✅ | ✅ | — | — | preview |
| `/api/comms/message-templates/:id` | DELETE | ✅ | — | — | — | — | SA only |
| `/api/comms/broadcast-campaigns` | GET | ✅ | ✅ | — | — | — | |
| `/api/comms/broadcast-campaigns` | POST | ✅ | ✅ | — | — | — | |
| `/api/comms/broadcast-campaigns/:id` | PATCH | ✅ | ✅ | — | — | — | |
| `/api/comms/broadcast-campaigns/:id/execute` | POST | ✅ | ✅ | — | — | — | mass-send |
| `/api/comms/broadcast-campaigns/:id` | DELETE | ✅ | — | — | — | — | SA only |

## Matrix — Pages (erp-app)

| Route | Page | SA | A | S | U |
|---|---|---|---|---|---|
| `/communications` | CommunicationsInboxPage | ✅ | ✅ | ✅ | ✅ |
| `/email-messages` | EmailMessagesPage | ✅ | ✅ | ✅ | scoped |
| `/sms-messages` | SMSMessagesPage | ✅ | ✅ | ✅ | scoped |
| `/whatsapp-messages` | WhatsAppMessagesPage | ✅ | ✅ | ✅ | scoped |
| `/notifications` | NotificationsPage | ✅ | ✅ | ✅ | own |
| `/support-tickets` | SupportTicketsPage | ✅ | ✅ | ✅ | own |
| `/portal-users` | PortalUsersPage | ✅ | ✅ | — | — |
| `/chatbot-sessions` | ChatbotSessionsPage | ✅ | ✅ | ✅ | — |
| `/help-articles` | HelpArticlesPage | ✅ | ✅ | — | — |
| `/message-templates` | MessageTemplatesPage | ✅ | ✅ | — | — |
| `/broadcast-campaigns` | BroadcastCampaignsPage | ✅ | ✅ | — | — |

## Invariants

1. **Every comms router** includes `router.use(authMiddleware)` at the top — no endpoint is reachable without a valid session.
2. **Legacy routers untouched** — `notifications.ts`, `whatsapp-hub.ts`, `whatsapp-ai-engine.ts`, `whatsapp-business-engine.ts`, `communication-marketing-engine.ts`, `call-analysis.ts`, `customer-service-ai-engine.ts` continue to serve their existing clients. The new `/api/comms/*` tree is additive.
3. **No `sql.raw()` with user-derived input** — all filter/sort parameters flow through `_safe-list-helpers.ts`. ORDER BY columns are whitelisted per router.
4. **Status lifecycles are CHECK-constrained at DB level** — client code cannot bypass via direct writes.
5. **Soft deletes** — all write-heavy tables use `is_deleted` flags; DELETE endpoints flip the flag rather than `DROP`.
6. **Template rendering is safe** — `renderTemplate()` only substitutes `{{var}}` placeholders. No eval, no nested evaluation, no HTML sanitization shortcuts.
7. **Broadcast execute is idempotent-guarded** — `/execute` rejects campaigns already in `sending` or `completed` state.
8. **Mark-all-read is user-scoped** — the endpoint resolves `user_id` to the authenticated user when the body omits it.
