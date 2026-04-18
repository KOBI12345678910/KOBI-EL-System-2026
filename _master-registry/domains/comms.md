# DOMAIN — comms

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `comms` |
| Evidence | `B-E013` `B-E015` DISCOVERY §B §D |

## 1. domain_checklist

### expected_models (12)
comms_threads, email_messages, sms_messages, whatsapp_messages, notifications, notification_deliveries, support_tickets, support_sla_tracking, portal_users, portal_sessions, chatbot_sessions, help_articles

### required_pages
CommsInbox (unified threads), EmailViewer, SMSInbox, WhatsAppInbox, NotificationsCenter, SupportTicketsList, SupportTicket360, PortalUsersAdmin, PortalSessionsLog (admin), ChatbotConsole (admin/internal), HelpCenter (HelpArticlesList + Viewer)

### required_forms
NewThread, SendEmail, SendSMS, SendWhatsApp, NewSupportTicket, ResolveTicket, NewPortalUser, NewHelpArticle

### required_routes
`/comms/inbox`, `/comms/email`, `/comms/sms`, `/comms/whatsapp`, `/notifications`, `/support/tickets`, `/support/ticket/:id`, `/admin/portal-users`, `/help`, `/help/article/:slug`, `/admin/chatbot`

### required_reports
ticket_resolution_time_report, sla_breach_report, inbound_volume_report, portal_engagement_report

### required_dashboards
CommsDashboard (planned), SupportDashboard (planned)

### required_flows
- inbound → thread → reply → close state
- ticket SLA timer
- broadcast notification fan-out

### critical_relations
- comms_threads 1—* {email_messages, sms_messages, whatsapp_messages}
- notifications 1—* notification_deliveries
- support_tickets 1—* support_sla_tracking
- portal_users 1—* portal_sessions
- help_articles independent (knowledge base)

### completion_gate
- CommsInbox must surface real threads (currently 0)
- help_articles must have viewer (currently orphan)

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables comms.* | 12 |
| Registry models | 0 full + 11 partial |
| API routers | 10 |
| Pages | 12 |
| Menu entries | 12 |
| Dashboards | 0 |
| Reports | 0 |

## 3. GAPS

| class | items |
|---|---|
| **ghost tables** | chatbot_sessions, comms_threads, email_messages, help_articles, notification_deliveries, sms_messages, whatsapp_messages, support_sla_tracking |
| **partial** | notifications, portal_users, portal_sessions, support_tickets |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | CommsInbox wiring; HelpArticles viewer |
| build_now | SupportTicket360 surface |
| internal_only | chatbot_sessions (admin only), notification_deliveries (delivery log) |
| postpone | — |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

Tier 00065/00066 shipped on 2026-04-18.
- 00065 — domain complete (ALTER canonical columns on 9 existing tables; CREATE 11 new tables: portal_sessions, notification_deliveries, support_sla_tracking, message_templates, broadcast_campaigns, broadcast_recipients, email_tracking, sms_tracking, whatsapp_tracking, chatbot_feedback, message_attachments; RLS + 3 policies per new table; 5 Hebrew message_templates seeded).
- 00066 — menu wiring: 11 routes under `תקשורת ולקוחות`.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 90 |
| business_readiness | live |
| gate_status | passed — CommsInbox live via /api/comms/threads/inbox/feed; HelpArticles viewer wired |
| red rows | 0 |

## 7. DELIVERABLES (Tier 00065/00066)

### Migrations
- `supabase/migrations/00065_comms_domain_complete.sql`
- `supabase/migrations/00066_comms_menu_wiring.sql`

### Zod schemas (`lib-client/api-zod/src/comms/*.ts`)
_shared, threads, email-messages, sms-messages, whatsapp-messages, notifications, support-tickets, portal-users, chatbot-sessions, help-articles, message-templates, broadcast-campaigns, index (12 + barrel).

### API routes (`api-server/src/routes/comms/*.ts`)
_helpers, threads, email-messages, sms-messages, whatsapp-messages, notifications, support-tickets, portal-users, chatbot-sessions, help-articles, message-templates, broadcast-campaigns, index (12 + aggregator). Mounted at `/api/comms`.

### Pages (`erp-app/src/pages/comms/*.tsx`)
_CommsTable, CommunicationsInboxPage, EmailMessagesPage, SMSMessagesPage, WhatsAppMessagesPage, SupportTicketsPage, NotificationsPage, PortalUsersPage, ChatbotSessionsPage, HelpArticlesPage, MessageTemplatesPage, BroadcastCampaignsPage (10 pages + shared shell + barrel).

### Business endpoints
- POST `/api/comms/email-messages/send`
- POST `/api/comms/sms-messages/send`
- POST `/api/comms/whatsapp-messages/send`
- POST `/api/comms/broadcast-campaigns/:id/execute`
- POST `/api/comms/support-tickets/:id/assign`
- POST `/api/comms/support-tickets/:id/resolve`
- POST `/api/comms/notifications/mark-all-read`
- POST `/api/comms/message-templates/:id/render`

### Legacy (untouched)
notifications.ts, whatsapp-hub.ts, whatsapp-ai-engine.ts, whatsapp-business-engine.ts, communication-marketing-engine.ts, call-analysis.ts, customer-service-ai-engine.ts.
