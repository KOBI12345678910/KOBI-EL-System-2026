# AGENT-280 — CONNECTIONS #5: SSE + Supabase Realtime

**Branch:** `claude/objective-merkle-40ff93`  **Date:** 2026-04-29

**Sources read:**
- `onyx-procurement/src/realtime/sse-hub.js` (zero-dep SSE hub, 423 lines)
- `onyx-procurement/src/ops/log-store.js` (LogQL streamHandler at L891)
- `api-server/src/lib/sse-manager.ts` + `api-server/src/lib/notification-dispatcher.ts` + `api-server/src/lib/live-ops-bridge.ts`
- `api-server/src/routes/{notifications,live-ops,chat,realtime-platform,graphql,super-agent/index,kobi/chat,kimi/agents,claude/chat}.ts`
- `api-server/src/lib/permission-middleware.ts` (L54)
- `api-server/src/app.ts` (L1125 LONG_TIMEOUT_PATHS)
- `techno-kol-ops/src/ws/broadcaster.ts`, `src/realtime/websocket.ts` (referenced via AUTH_AUDIT.md)
- `erp-app/src/{hooks/useRealtime,components/chat/chat-panel,pages/chat/chat-page,pages/executive/live-ops}.tsx`
- `payroll-autonomous/src/components/LiveDashboard.jsx` + `src/App.jsx`
- `_qa-reports-25/AGENT-{122,79,153}-*.md`, `onyx-procurement/QA-AGENT-{79,80}-*.md`, `_qa-reports/AG-X13-realtime-dashboard.md`, `_qa-reports/AG-Y126-internal-chat.md`

---

## 1. Inventory of SSE endpoints (server-side)

| # | Endpoint | File | Channel(s) | Auth | Scope | Heartbeat | Backpressure |
|---|----------|------|------------|------|-------|-----------|--------------|
| 1 | `GET /api/notifications/stream` | `api-server/src/routes/notifications.ts:365` | `notifications` | `getUserId(req)` cookie/JWT (401 if absent) | per-user (filtered by `client.userId !== payload.userId`) | 25s `: ping` | None — drops on `writableEnded`/throw, no queue limit |
| 2 | `GET /api/live-ops/stream` | `api-server/src/routes/live-ops.ts:16` | `live-ops` | `requireAuth` + `permission-middleware.ts:54` allows `?token=` query param | global (no user filter on broadcast) | 25s `: ping` (shared with notifications) | None |
| 3 | `GET /api/chat/stream` | `api-server/src/routes/chat.ts:73` | implicit per-user via `Map<userId, Set<Response>>` | `getUserId(req)` (also `?token=` per middleware) | per-user (`broadcastToUser`) | 30s `:\n\n` comment | None — direct `res.write` |
| 4 | `GET /api/graphql/subscribe` | `api-server/src/routes/graphql.ts:101` | `graphql-subscriptions` | `req.userId` required | per-user via `addSSEClient`, then filtered by `entities` list from query | 25s `: ping` (via sse-manager) | None |
| 5 | `GET /api/events/stream` (realtime-platform) | `api-server/src/routes/realtime-platform.ts:96` | global event bus | **no auth check inside handler** — relies on global `req.userId` middleware (not enforced here) | global; no tenant filter | 20s `: hb` + 10s snapshot push | None |
| 6 | `POST /api/super-agent/chat/stream` | `api-server/src/routes/super-agent/index.ts:230` | LLM streaming (Anthropic) | requires session via `pool.query` + `userId` in body | per-session | none documented (relies on Anthropic backpressure) | None |
| 7 | `POST /api/kobi/chat/stream` / `POST /api/kimi/chat/stream` / `POST /api/claude/chat` | `routes/kobi/chat.ts:670`, `routes/kimi/agents.ts:615/707/790`, `routes/claude/chat.ts:2064` | LLM streaming | session/user | per-session | LLM stream cadence | None |
| 8 | `GET /api/logs/stream?logql=...` | `onyx-procurement/src/ops/log-store.js:891` | LogQL | **none** at handler level — wraps must add | global | 15s `: hb` | None — silent `try/catch` per write |
| 9 | `app.get('/api/stream/events', hub.subscribe)` | `onyx-procurement/src/realtime/sse-hub.js:262` | configurable: `invoices`, `payments`, `inventory`, `alerts`, `system_health` | `X-API-Key` header, key list from env | global by default; `?channels=` selects subset | 30s `: hb` | **YES** — `MAX_CLIENT_QUEUE = 500`, drops slow client, ring buffer 1000 with `Last-Event-Id` replay |

---

## 2. SSE consumers (client-side)

| File | Connects to | Reconnect | Tenant header? |
|------|-------------|-----------|----------------|
| `erp-app/src/hooks/useRealtime.ts:269` | `${API}/events/stream` | 5s fixed retry | no |
| `erp-app/src/hooks/use-realtime-alerts.ts:39` | `/notifications/stream` (uses `fetch` not `EventSource` — bug) | manual | no |
| `erp-app/src/components/chat/chat-panel.tsx:97`, `pages/chat/chat-page.tsx:1085` | `/chat/stream?token=${token}` | none | token in query string |
| `erp-app/src/pages/executive/live-ops.tsx:123` | `/api/live-ops/stream?token=${token}` | none | token in query string (logged to access logs) |
| `payroll-autonomous/src/components/LiveDashboard.jsx:197` (used at `App.jsx:761`) | `/api/stream/events` (the onyx-procurement hub) **with `apiKey` + `channels=['payroll','procurement','alerts']`** | exponential backoff capped at `BACKOFF_MAX` with jitter | API key in querystring |
| `erp-app/src/pages/ai-engine/{kobi,kimi}-terminal.tsx`, `kobi-ide.tsx`, `components/ai/kobi-{chat-window,agent-panel}.tsx` | `${API}/{kobi,kimi}/chat/stream` (POST + ReadableStream) | none | bearer via `authFetch` |

**Note:** `payroll-autonomous` requests channels `payroll` and `procurement`, but the onyx-procurement hub default channel list is `['invoices','payments','inventory','alerts','system_health']`. Unless caller passes `channels: ['payroll',...]` to `createHub`, those subscriptions resolve to the full default set (per `parseChannelsQuery` fallback in `sse-hub.js:101`). Client-side default UI strings will never match server-side channel names.

---

## 3. Supabase Realtime usage

| Service | `@supabase/supabase-js` declared | `supabase.channel(...)` calls | `.on('postgres_changes',...)` | `.subscribe()` |
|---------|---------------------------------|-------------------------------|-------------------------------|----------------|
| `onyx-procurement` | yes (server.js, db helpers, tests) | **0** | **0** | **0** |
| `techno-kol-ops` (server) | yes via SDK | **0** (uses raw `ws` WebSocket — `src/realtime/websocket.ts`) | 0 | 0 |
| `techno-kol-ops/client` | yes (`@supabase/realtime-js@2.103.3` in client/package-lock.json) | **0** in source | 0 | 0 |
| `onyx-ai` | **not declared** in package.json (`AGENT-21-smoke.md` flags F159); reads `SUPABASE_URL/ANON_KEY` via raw `fetch` | 0 | 0 | 0 |
| `payroll-autonomous` | **no DB / no Supabase SDK** (Vite SPA) | 0 | 0 | 0 |
| `api-server` | uses Drizzle/`pool` from `@workspace/db`, no Supabase SDK | 0 | 0 | 0 |

**Verdict (matches existing `QA-AGENT-79-WEBSOCKET.md` and `QA-AGENT-80-SYNC-CONFLICT.md`):** Supabase Realtime is **dormant across the fleet**. The client library is bundled in `techno-kol-ops/client` but never instantiated. Postgres `realtime` publication is presumed default-on at the database layer but no application subscribes.

---

## 4. Per-channel summary

### `notifications` (api-server, in-memory `Set<SSEClient>`)
- **Subscribers:** any authenticated user, via `EventSource('/api/notifications/stream')`. Producer: `notifyClients(payload)` from `notification-dispatcher.ts:462`.
- **Auth:** session `userId` resolved by middleware. Stream rejected without it (401).
- **Scope:** per-user only — `payload.userId === client.userId` filter at `sse-manager.ts:57`. **No tenant_id / org check** — multi-tenant deployments would leak across tenants if a user-id collision existed.
- **Backpressure:** none. Dead-client detection only via `writableEnded` and `try/catch`. No max-queue.

### `live-ops` (api-server, same `clients: Set<SSEClient>` as notifications)
- **Subscribers:** `addSSEClient(authUserId, res, ['live-ops'])` at `live-ops.ts:19`. Producer: `emitLiveOpsEvent` called from `live-ops-bridge.ts:71/102` and `live-ops.ts:149`.
- **Auth:** `requireAuth` + `permission-middleware.ts:54` allows token in `?token=` querystring (logged to access logs — review).
- **Scope:** **global broadcast** to every client subscribed to channel `live-ops` — no user filter, no tenant filter. Anyone with a valid session sees production/sales/inventory/finance events for the entire company.
- **History:** `liveOpsHistory` capped at 200 in-memory; replayed via `/live-ops/history` REST.

### `graphql-subscriptions`
- **Subscribers:** authenticated users via `addSSEClient(req.userId, res, ['graphql-subscriptions'])`.
- **Auth:** `req.userId` required.
- **Scope:** per-user, then filtered by `entities` query param. No tenant scoping.
- **Backpressure:** none.

### `chat` (api-server `chat.ts`, separate `Map<number, Set<Response>>`)
- **Subscribers:** authenticated user, multiple connections per user supported.
- **Auth:** `getUserId` (cookie or `?token=`).
- **Scope:** per-user `broadcastToUser`. Presence broadcast iterates **all** clients in the map. No tenant.
- **Backpressure:** none.

### `events/stream` (realtime-platform)
- **Subscribers:** anyone hitting the URL — handler does not check `req.userId`.
- **Producer:** `realtimePlatform.Bus.subscribeAll`.
- **Scope:** global. No tenant. Pushes 20-event recent + 10s snapshot.
- **Backpressure:** none. Two `setInterval` per connection (10s snapshot + 20s heartbeat) — 2× per-client load grows linearly with sockets.

### `onyx-procurement sse-hub` (`/api/stream/events`)
- **Subscribers:** `payroll-autonomous/src/App.jsx:761` `<LiveDashboard streamUrl="${API_URL}/api/stream/events" channels={['payroll','procurement','alerts']} />`. **No other consumer** in `erp-app` or `techno-kol-ops`.
- **Producer:** No source files in `onyx-procurement/src/` import `sse-hub` and call `hub.publish(...)`. Tests in `test/payroll/sse-hub.test.js` cover 100% but production wiring at `onyx-procurement/server.js` does **not** instantiate `createHub`. **Channel is built, exported, tested — and unused server-side.**
- **Auth:** `X-API-Key` header against env keylist; rejects 401/403/503 if no keys configured. Client passes key in querystring (LiveDashboard `apiKey` prop), not header — there's a wire mismatch unless an Express middleware moves `?key=` → `X-API-Key`.
- **Scope:** `?channels=` selects subset of static defaults. **No tenant.** Default channels: `invoices,payments,inventory,alerts,system_health`. The client requests `payroll,procurement,alerts` — only `alerts` matches; `payroll` and `procurement` fall back to full default set per `parseChannelsQuery` filter.
- **Backpressure:** Best in the codebase. Per-client `pendingWrites` counter, `MAX_CLIENT_QUEUE=500` triggers `dropClient(c, 'slow_client')`. Ring buffer 1000 with `Last-Event-Id` replay. `if (heartbeatTimer.unref)` lets process exit cleanly.

### `logs/stream` (`onyx-procurement/src/ops/log-store.js:891`)
- **Subscribers:** any caller of the LogQL streamHandler. `_qa-reports/AG-X54-log-store.md` shows expected client `new EventSource('/api/logs/stream?logql=...')`.
- **Producer:** `store.stream(logql, callback)`.
- **Auth:** **none** at handler — must be wrapped by parent app's middleware.
- **Scope:** LogQL query selectors. No tenant.
- **Backpressure:** none — silent `try/catch` swallows write failures. No queue cap.

---

## 5. Dead channels

| Channel | Status | Evidence |
|--------|--------|----------|
| `onyx-procurement` Supabase Realtime | **DEAD** — client loaded, never subscribed | `QA-AGENT-79-WEBSOCKET.md:33,74,83,101`, `QA-AGENT-80-SYNC-CONFLICT.md:391` |
| `techno-kol-ops` Supabase Realtime (`@supabase/realtime-js` in client bundle) | **DEAD** — bundled, no `.channel(` call | `client/package-lock.json:2980,3029`; zero source matches in `techno-kol-ops/client/src` |
| `onyx-procurement sse-hub` (`/api/stream/events`) — server side publish | **DEAD-WRITE** — hub built and exported but `server.js` never calls `createHub`; no `hub.publish(...)` callers in `onyx-procurement/src/**` | `_qa-reports-25/AGENT-122-dashboards.md:50,57,93,102,111` recommends wiring; current state is unwired. |
| `payroll-autonomous` LiveDashboard subscribing to `payroll` + `procurement` channels | **DEAD-READ** — channel names not in default `DEFAULT_CHANNELS`; `parseChannelsQuery` returns full default list when no requested channel matches (line 102: `return ok.length ? ok : allowed.slice()`) | `sse-hub.js:99-103`; `payroll-autonomous/src/App.jsx:761` |
| `notifications` cross-tenant filter | **MISSING** — no tenant_id check, only userId equality | `sse-manager.ts:11-69` |
| `live-ops` per-user/tenant filter | **MISSING** — broadcasts to every authenticated subscriber regardless of role/tenant | `sse-manager.ts:90-116` |
| `realtime-platform /events/stream` auth gate | **MISSING in handler** — relies on global middleware that may not be applied to this route group | `realtime-platform.ts:96-139` |

---

## 6. Backpressure summary

| Hub | Slow-client policy | Max queue | Heartbeat |
|-----|--------------------|----------|-----------|
| onyx-procurement `sse-hub` | drop after 500 pending writes | 500 | 30s |
| api-server `sse-manager` | none — relies on TCP buffer + `writableEnded` | none | 25s |
| api-server `chat.ts` | none | none | 30s |
| api-server `realtime-platform` | none | none | 20s |
| api-server `graphql.ts` | none | none | 25s |
| onyx-procurement `log-store streamHandler` | none — silent `try/catch` per write | none | 15s |
| techno-kol-ops `ws/broadcaster.ts` | uses `ws` library — n/a here | n/a | n/a |

---

## 7. Top fixes (ordered)

1. **Wire onyx-procurement `sse-hub` into `server.js`** and replace 30s React polling on dashboards with `sse-hub` push. Keep poll only as fallback. (`AGENT-122` already prescribes this.)
2. **Activate Supabase Realtime** in `onyx-procurement` for tables that drive 360 pages (`suppliers`, `purchase_orders`, `invoices`) — currently the entire feature is paid for by Supabase but unused.
3. **Add tenant_id scoping** to every server-side SSE filter (`sse-manager.ts`, `chat.ts`, `realtime-platform.ts`). Today multi-tenant deployment leaks live-ops events.
4. **Apply auth in `realtime-platform.ts:96`** explicitly — do not rely on whether the parent app mounted middleware on this router.
5. **Fix channel name mismatch** — either add `payroll` and `procurement` to `DEFAULT_CHANNELS` in `sse-hub.js` or rewrite the client default list. The current fallback silently subscribes to all default channels.
6. **Move `?token=` out of querystring** for `live-ops/stream` and `chat/stream` (logged to access logs). Use `Authorization` header; for native EventSource, fetch a short-lived signed cookie first.
7. **Move client API key out of querystring** for the onyx-procurement hub — `payroll-autonomous` passes `apiKey=...` in the URL (server expects `X-API-Key` header). Currently this fails auth unless an Express middleware translates it.
8. **Add backpressure** to `sse-manager.ts`, `chat.ts`, `realtime-platform.ts`. Either wrap with the proven `sse-hub.js` (preferred — single hub) or copy its `MAX_CLIENT_QUEUE=500 → dropClient` policy. A single slow client today blocks the Node event loop for that handler chain.
9. **Replace `fetch('/notifications/stream')`** at `erp-app/src/hooks/use-realtime-alerts.ts:39` with `EventSource` — a `fetch` against an SSE endpoint reads the body once and the stream never reaches the consumer.
10. **Decide one truth source.** Today there are five SSE implementations (`sse-hub.js`, `sse-manager.ts`, `chat.ts` Map, `realtime-platform.ts` ad-hoc, `log-store.js` ad-hoc) plus a `ws` broadcaster in `techno-kol-ops`. Per `CLAUDE.md` "fully connected operating system" — converge on `sse-hub.js` (only one with backpressure + ring + tests) or migrate everything to Supabase Realtime.

---

## 8. Counts

- SSE server endpoints distinct routes: **9** (1 per row in §1)
- SSE client EventSource consumers: **6 hooks/pages** (excluding LLM POST streams)
- Supabase Realtime channels live: **0**
- Dead channels (built, never used): **4** (Supabase Realtime ×2 services + onyx-procurement hub server side + LiveDashboard channel mismatch)
- Hubs with backpressure: **1 of 6**
- Hubs with tenant scoping: **0 of 6**
