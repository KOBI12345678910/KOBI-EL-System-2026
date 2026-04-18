# AG-Y126 — Internal Team Chat (Slack-lite)

**Agent:** Y-126
**Module:** `onyx-procurement/src/comms/internal-chat.js`
**Tests:**  `onyx-procurement/test/comms/internal-chat.test.js`
**Version:** Y126.1.0
**Status:** Delivered
**Test result:** 36 / 36 pass (`node --test`)
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים — every message, edit,
reaction, pin, delete-attempt and file upload is kept forever. Delete is
a soft-delete (flag + audit entry), edits keep full history, and the
compliance export always includes deleted rows with their original text.

---

## 1. Purpose (מטרה)

Drop-in internal team chat for Techno-Kol Uzi, built to feel like a
lite Slack. Zero external dependencies — Node built-ins only. Hebrew-
aware tokenization, niqqud stripping, final-letter normalization, and
mention extraction for prose that mixes Hebrew with ASCII handles.

The module is in-memory so it boots in tests and CI with no
infrastructure, and exposes a realtime bridge that plugs into the X-13
SSE hub (`src/realtime/sse-hub.js`) when one is passed to the
constructor.

---

## 2. Public API (class `InternalChat`)

| Method | Purpose |
|---|---|
| `new InternalChat({sseHub?, clock?, logger?, dmSalt?})` | Construct. Optional SSE hub, deterministic clock for tests, structured logger, and DM salt. |
| `createChannel({name, description, visibility, members, owners})` | Create a public or private channel. Enforces unique public names. Auto-promotes the first member to owner if none supplied. |
| `sendMessage({channelId, userId, text, attachments, mentions, replyTo})` | Post a message. `replyTo` builds a thread; `@mentions` are auto-extracted from text and merged with the argument. |
| `editMessage({messageId, userId, newText})` | Author-only edit. Pushes the previous version onto `editHistory` and rebuilds the token index. |
| `deleteMessage({messageId, userId, reason})` | Soft delete. Sets `deleted=true`, records the reason, writes a `message.delete` audit entry (with `preservedBytes`). Text is retained. |
| `reactMessage({messageId, userId, emoji})` | Toggle an emoji reaction. Audit logs `add` / `remove`. |
| `pinMessage({messageId, userId})` | Toggle pin. Requires channel membership. Pinned set kept per channel. |
| `searchMessages({query, channelId, user, dateRange, includeDeleted, limit})` | Full-text search with Hebrew tokenization, AND-semantics across tokens, recency-boosted scoring, per-result highlight using guillemets («»). Deleted messages hidden unless `includeDeleted:true`. |
| `listChannels({userId})` | Channels visible to user: all public channels + private channels / DMs / group DMs where user is a participant. |
| `joinChannel({channelId, userId, invitedBy})` | Public: self-join. Private: requires a member inviter. |
| `leaveChannel({channelId, userId})` | Removes the user. Auto-promotes a new owner when the last owner leaves. |
| `directMessage({fromUserId, toUserId, text})` | Lazy-creates a 1:1 DM channel, persists plaintext (for search) **and** an XOR-obfuscated `cipherText` copy (stub for real crypto). |
| `groupDM({userIds, text})` | Ad-hoc group DM, 2–12 participants, channel reused for the same participant set. |
| `notificationSettings({userId, channelId, muted, keywords})` | Per-channel mute + keyword alerting. |
| `presence({userId, status})` | Read / write user presence. Valid: `active`, `away`, `dnd`, `offline`. |
| `slashCommands({command, args, context})` | Dispatch a registered slash command. Ships with `/me`, `/shrug`, `/dnd`, `/away`, `/active`, `/invite`, `/leave`, `/search`, `/pin`. Extend via `registerSlashCommand(name, fn)`. |
| `fileUpload({channelId, file, userId})` | Track file metadata (name/mime/size/url/checksum). Bytes live wherever the caller stores them — the chat owns the audit chain. |
| `export({channelId, period, format})` | Compliance-grade export — `json`, `ndjson`, or `csv`. Always includes deleted messages with original text, edit history, delete reason, timestamps, and mentions. |
| `realtimeUpdates()` | Returns a bridge `{ subscribe(fn) }` for in-process listeners. Also relays chat events to the X-13 SSE hub (`alerts` channel) when wired. |
| `decryptDM(messageId)` | Helper: returns the plaintext body of a DM message (no-op for channel rows). |
| `registerSlashCommand(name, handler)` | Plug a new slash command. |

---

## 3. Data Model (מודל נתונים)

### 3.1 Channel record
```
{
  id:           'ch_<base36time>_<seq>_<rand>',
  kind:         'channel' | 'dm' | 'group_dm',
  name:         string,
  normName:     string (lowercased, used for uniqueness checks),
  description:  string,
  visibility:   'public' | 'private',
  members:      string[],
  owners:       string[],
  createdAt:    number (ms),
  updatedAt:    number (ms),
  archived:     boolean,
  messageCount: number,
  // DM-only:
  dmKey:        string (participant ids joined & sorted, stable identity),
}
```

### 3.2 Message record
```
{
  id:               'msg_<base36time>_<seq>_<rand>',
  channelId:        string,
  userId:           string,
  text:             string (plaintext, preserved even after delete),
  attachments:      any[],
  mentions:         string[] (auto-extracted + caller-supplied),
  replyTo:          messageId | null,
  threadRootId:     messageId | null (propagated down the thread),
  threadReplyCount: number (maintained on the root),
  reactions:        { [emoji]: Set<userId> },
  pinned:           boolean,
  deleted:          boolean,
  deleteReason:     string | null,
  deletedAt:        number | null,
  deletedBy:        userId | null,
  editHistory:      { ts, by, prevText }[],  // frozen entries
  createdAt:        number,
  updatedAt:        number,
  tokens:           string[],                // search index key
  cipherText?:      string (base64, DM only),
  encrypted?:       boolean,
}
```

### 3.3 Derived indices
- `channelByName` — lowercased name → `channelId` for public uniqueness.
- `userChannels`  — `userId → Set<channelId>` for fast membership listing.
- `tokenIndex`    — `token → Set<messageId>` inverted index (Hebrew / ASCII).
- `channelMessages` — `channelId → messageId[]` ordered by send time.
- `threadMap`     — `rootMessageId → messageId[]` ordered by send time.
- `pinnedByChannel` — `channelId → Set<messageId>`.

### 3.4 Audit log
`chat.auditLog` is an append-only `Array` of frozen records. Every
mutation emits one entry — **never purged**. Entry shape:
```
{ type, at, /* action-specific fields */ }
```
Types emitted:
`channel.create` `channel.join` `channel.leave`
`dm.create`
`message.send` `message.edit`
`message.delete` `message.delete.redundant`
`message.react` `message.pin` `message.unpin`
`notif.update` `presence.update`
`slash.invoke` `file.upload` `export`

---

## 4. Slash Commands (פקודות לוכסן)

Default registry (extensible via `registerSlashCommand`):

| Command | Purpose |
|---|---|
| `/me <text>` | Post an italic-action style message (`*text*`). |
| `/shrug [text]` | Append a Unicode shrug figure. |
| `/active` | Set presence to `active`. |
| `/away` | Set presence to `away`. |
| `/dnd` | Set presence to `dnd` (do not disturb). |
| `/invite @user` | Add a user to the current channel. |
| `/leave` | Leave the current channel. |
| `/search <query>` | Run a channel-scoped search. |
| `/pin <messageId>` | Pin a message. |

All slash invocations are audit-logged (`slash.invoke`) with the
invoking `userId` and the command name.

---

## 5. Search (חיפוש)

The tokenizer is inlined in the module (no dependency on the shared
`src/search/search-engine.js`). Pipeline:

1. **Strip niqqud** — Unicode ranges `U+0591..U+05BD`, `U+05BF`,
   `U+05C1..U+05C2`, `U+05C4..U+05C5`, `U+05C7`.
2. **Normalize final letters** — `ם→מ`, `ן→נ`, `ץ→צ`, `ף→פ`, `ך→כ`.
3. **Split** on anything that isn't a Hebrew letter (`U+05D0..U+05EA`)
   or ASCII alnum.
4. **Lowercase** (ASCII only; Hebrew has no case).
5. **Drop stopwords** — `HEB_STOPWORDS` + `EN_STOPWORDS` (see module
   constants).

### 5.1 Query semantics
- `query` is tokenized with the same pipeline.
- Candidate messages are the **intersection** of posting lists per
  token (AND-query). Empty intersection → zero results.
- Filters: `channelId`, `user`, `dateRange:{from,to}`, `includeDeleted`,
  `limit`.
- Score: `overlap * 0.7 + recency * 0.3`
  - `overlap = qTokens.length / msg.tokens.length`
  - `recency = 1 / (1 + ageDays/30)`
- Results sorted by score desc, then `createdAt` desc.
- Each hit includes `highlight` — the original text with matched runs
  wrapped in `«…»` (Hebrew-safe).

### 5.2 Supported queries
| Query | Matches because… |
|---|---|
| `שלום` | niqqud stripped from `שָׁלוֹם` |
| `שלום` | final-letter normalized `שלום → שלומ` |
| `דחופ` | `דחוף` normalized via pe-sofit → `דחופ` |
| `VAT` | lowercased `vat` token matches both `VAT` and `vat` |
| `סוד` + `includeDeleted:true` | deleted messages only hidden by default |

---

## 6. Hebrew Glossary (מילון עברי-אנגלי)

| עברית | English | Used in |
|---|---|---|
| ערוץ | Channel | `createChannel`, `listChannels` |
| ערוץ ציבורי | Public channel | `visibility: 'public'` |
| ערוץ פרטי | Private channel | `visibility: 'private'` |
| הודעה | Message | `sendMessage` |
| פתיל | Thread | `replyTo`, `threadRootId` |
| אזכור | Mention | `@user` handle, `extractMentions` |
| תגובה | Reaction | `reactMessage` |
| נעיצה | Pin | `pinMessage` |
| הודעה ישירה | Direct message | `directMessage` |
| קבוצת צ'אט | Group DM | `groupDM` |
| התראה | Notification | `notificationSettings` |
| השתקה | Mute | `muted: true` |
| מילות מפתח | Keywords (for alerts) | `notificationSettings.keywords` |
| נוכחות | Presence | `presence` |
| פעיל | Active | `status: 'active'` |
| לא להפריע | Do not disturb | `status: 'dnd'` |
| מחוץ למשרד | Away | `status: 'away'` |
| לא מחובר | Offline | `status: 'offline'` |
| פקודת לוכסן | Slash command | `slashCommands` |
| העלאת קובץ | File upload | `fileUpload` |
| ייצוא | Export | `export` |
| מחיקה רכה | Soft delete | `deleteMessage` (never purge) |
| יומן ביקורת | Audit log | `chat.auditLog` |
| ניקוד | Niqqud (vowel marks) | `_stripNiqqud` |
| אותיות סופיות | Final letters | `_normalizeFinalLetters` |
| מילות עצירה | Stopwords | `HEB_STOPWORDS` |
| היסטוריית עריכה | Edit history | `editHistory` |
| פתיחת צ'אט ישיר | Open a DM | `directMessage` |
| ציר זמן אמת | Realtime stream | `realtimeUpdates`, SSE hub |

---

## 7. Test Coverage (כיסוי בדיקות)

`node --test onyx-procurement/test/comms/internal-chat.test.js`
→ **36 / 36 pass** (~140 ms total).

Suites:
1. **tokenizer** — niqqud stripping, final-letter normalization,
   stopword removal, mixed Hebrew/English.
2. **extractMentions** — ASCII handles from Hebrew prose, dedupe,
   dot/dash/underscore handles.
3. **channel lifecycle** — public vs private visibility; `joinChannel`
   enforces inviter rules; `leaveChannel` promotes a new owner when the
   last one leaves.
4. **message flow** — send with mentions / attachments; threading via
   `replyTo` (threadRootId + reply count propagation); author-only edit
   with history; soft-delete preserving text + audit entry; idempotent
   delete; owner moderation delete.
5. **reactions + pins** — toggle on/off.
6. **search** — niqqud + final-letter matches, deleted excluded by
   default, `includeDeleted:true` surfacing, highlight guillemets.
7. **DMs** — 1:1 encryption round-trip, self-DM refusal, group DM
   reuse + 2–12 member guard, XOR cipher independent round-trip.
8. **notifications / presence** — muted + keyword storage, status
   updates with invalid-status guard.
9. **slash commands** — built-in dispatch, custom registration,
   unknown command rejection.
10. **file upload** — metadata + audit entry.
11. **export** — `json` includes deleted rows with original text and
    edit history; `csv` + `ndjson` formats.
12. **realtime bridge** — in-process subscribe, relay to fake SSE hub
    publishing under `alerts` channel as `chat.<event>`.
13. **ChatError** — carries `code` metadata.

---

## 8. Wiring Notes

### 8.1 Mounting under Express
```js
const { InternalChat } = require('./comms/internal-chat');
const { createHub }    = require('./realtime/sse-hub');
const hub  = createHub({ apiKeys: [process.env.SSE_API_KEY] });
const chat = new InternalChat({ sseHub: hub });

app.get('/api/stream/events', (req, res) => hub.subscribe(req, res));

app.post('/api/chat/messages', (req, res) => {
  try { res.json(chat.sendMessage(req.body)); }
  catch (e) { res.status(400).json({ error: e.code || 'error', message: e.message }); }
});
```

### 8.2 Realtime events (via SSE hub)
Every chat mutation is published to the hub's `alerts` channel with a
type of `chat.<event>` — e.g. `chat.message.send`, `chat.channel.join`,
`chat.message.delete`. Clients subscribe with `?channels=alerts` and
filter by the event-name prefix `chat.*`.

### 8.3 In-process subscribe (no SSE)
```js
const rt = chat.realtimeUpdates();
const unsub = rt.subscribe(({ type, payload }) => log(type, payload));
// ... later ...
unsub();
```

### 8.4 DM "encryption" caveat
`_xorCipher` is **obfuscation, not cryptography**. The plaintext is
still stored alongside for search, and the XOR key is derived from a
deterministic FNV-1a digest of `dmSalt + channelId`. Before going to
production, swap `_xorCipher` / `_xorDecipher` for a real AEAD
(libsodium / Node `crypto.subtle`) and remove `msg.text` persistence
for DMs if end-to-end is the goal.

---

## 9. Non-Deletion Guarantee (אי־מחיקה)

Audit trail of guarantees that enforce **לא מוחקים רק משדרגים ומגדלים**:

1. `deleteMessage` never removes the record. It flips `deleted` and
   writes `message.delete` with `preservedBytes` (the retained text
   size). The original text stays in `msg.text`.
2. `editMessage` never overwrites without history — every prior version
   is appended to `editHistory` as a frozen snapshot with the editor
   and timestamp.
3. `chat.auditLog` is `push`-only in source; there is no public `pop`
   or `splice` API. Every entry is `Object.freeze`d at insert time.
4. `export()` includes deleted and edited rows in every format, with
   the `deleted` flag, `deleteReason`, `deletedAt`, `deletedBy`, and
   `editCount` columns present.
5. The token index for deleted messages is left in place, so they can
   still be searched via `includeDeleted:true` for compliance queries.

Consequence: every review, re-export, or audit request can reconstruct
the full conversation exactly as it was at any point in time.

---

## 10. Limitations (מגבלות)

- **Memory store** — all state lives in the process. Persistence is
  caller-owned; expose `chat.channels / messages / auditLog` to dump
  snapshots. Replacing storage is a surgical swap (Maps → DB adapters).
- **Moderation scope** — delete permissions are limited to author and
  channel owner. Global admins are a caller concern.
- **DM crypto** — see §8.4, the shipped cipher is a placeholder.
- **Scale** — the inverted index is a single Map; for > ~100k messages
  per process, shard or swap to the existing `src/search/search-engine.js`
  which uses a TF-IDF inverted index with the same tokenizer rules.

---

## 11. Follow-ups (תוכנית שדרוג — לגדל, לא למחוק)

1. Replace `_xorCipher` with a real AEAD when the DM UX ships.
2. Back `channels` / `messages` with a durable adapter (SQLite / Postgres)
   while keeping the same class surface.
3. Add full-index rebuild + save/load checkpoints for crash recovery.
4. Wire the X-13 SSE hub channels list to include a dedicated `chat`
   channel instead of piggy-backing on `alerts`.
5. Expose read APIs for thread walking (`listThread(rootId)`) and pin
   listing (`listPins(channelId)`) — data is already indexed; only the
   public methods need adding. Non-destructive addition only.

---

**Never delete this report.** Future iterations must amend in place and
supersede via a new version header (Y126.2.0, Y126.3.0, ...).
