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

0/12 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 25 |
| business_readiness | blocked |
| gate_status | blocked — CommsInbox not live; help_articles orphan |
| red rows | 6 |
