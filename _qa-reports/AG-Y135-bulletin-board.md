# AG-Y135 — Digital Bulletin Board / לוח הודעות דיגיטלי

**Status:** PASS (34/34 tests green)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/comms/bulletin-board.js`
**Tests:** `onyx-procurement/test/comms/bulletin-board.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Purpose

Digital announcement board serving two surfaces:

1. **Shop-floor TV screens** (digital signage) — Palantir dark theme, RTL, auto-rotation, emergency takeover.
2. **Mobile app** — QR code on the physical board opens the post on the employee's phone.

Single source of truth for HR announcements, safety alerts, lunch menus, marketplace, internal job postings, peer shout-outs, company events, and employee achievements.

## 2. Post Types Supported

| Type            | Hebrew                | Use case                                  |
|-----------------|-----------------------|-------------------------------------------|
| `announcement`  | הודעה כללית          | General company / HR announcements        |
| `safety-alert`  | התראת בטיחות         | Safety notices, drills, hazards           |
| `achievement`   | הישג                  | Employee-of-the-month, project milestones |
| `event`         | אירוע                | Company events, trainings, parties        |
| `job-posting`   | משרה פנימית          | Internal hiring                           |
| `marketplace`   | לוח יד שנייה         | Used items for sale between employees     |
| `shout-out`     | מילה טובה            | Peer recognition                          |
| `menu`          | תפריט מטבח           | Daily lunch / kitchen menu (Israeli shop) |

## 3. Categories (Priority Order)

| Category                | HE                  | Priority | Visibility        |
|-------------------------|---------------------|----------|-------------------|
| `safety-notices`        | בטיחות ורווחה       | 1        | Always top        |
| `hr-announcements`      | הודעות משאבי אנוש   | 3        | High              |
| `company-events`        | אירועי חברה         | 4        | Medium            |
| `employee-achievements` | הישגי עובדים        | 4        | Medium            |
| `job-postings`          | משרות פנימיות       | 4        | Medium            |
| `shout-outs`            | מילה טובה לעובד     | 5        | Normal            |
| `lunch-menus`           | תפריט מטבח          | 5        | Normal            |
| `marketplace`           | לוח יד שנייה        | 6        | Low               |

`safety-alert` posts **always** float to the top of `listCurrent()` and are **always** included in `digitalSignageFeed()`, regardless of rotation schedule. Pinned posts do the same.

## 4. API Surface

### Post lifecycle
- `createPost({ id, type, title_he, title_en, content, image, postedBy, category, pinUntil, expireAt })`
  - Validates type/title/category/dates.
  - Default state: `pending-moderation`.
  - Pre-approved authors (`preApprovedAuthors`) OR `autoModerate:false` → published immediately.
- `approvePost({ postId, moderator })` / `rejectPost({ postId, moderator, reason })`
- `pendingModeration({ submittedBy })` — optional filter by author
- `listCurrent({ category, type, locationId })` — currently visible, sorted: pinned → safety-alert → priority → recency
- `pinPost({ postId, untilDate })` / `unpinPost({ postId })`
- `archivePost({ postId, archivedBy })` — **preserved**, never deleted
- `listArchive({ category, type })` — archive is queryable
- `getPost(postId)` — retrieves post regardless of state (including archived)

### Engagement
- `reactionsEnabled({ postId, types })` — enables subset of `like` / `thanks` / `relevant`
- `react({ postId, userId, type })` — dedupes by userId (one reaction per user per type)
- `commentsEnabled({ postId, moderated })` — disabled by default (moderated by default when on)
- `addComment({ postId, userId, text })` / `approveComment({ postId, commentId })` / `listComments({ postId, state })`

### Digital signage
- `rotationSchedule({ locationId, items, duration })` — per-location rotation queue
- `digitalSignageFeed({ locationId })` — returns `{ mode, theme, accessibility, items, duration, rotateBetween }`
- `emergencyTakeover({ locationId, emergencyPost })` — overrides all screens at a location
- `clearEmergency({ locationId })` — restores normal rotation

### Mobile bridge
- `qrCodeForMobile({ postId, baseUrl })` — returns `{ url, signedUrl, token, matrix }`; matrix is a 21×21 deterministic stub rendered client-side.

### Accessibility
- `accessibilityMode({ 'high-contrast', 'large-font', 'screen-reader-friendly' })` — also accepts camelCase.
- Profile attached to every signage feed; default `screen-reader-friendly: true` (Israeli A11y Law 5568).

### Analytics
- `recordImpression({ postId })` / `recordView({ postId })`
- `retentionAnalytics({ postId })` — returns `{ impressions, views, reactions, totalReactions, comments, engagementRate, clickThroughRate, ageHours, ... }`

### Housekeeping
- `stats()` — counts of total / published / archived / pending / rejected / locations / emergencies / audit entries.
- `auditLog[]` — append-only, logs every mutation (createPost, approvePost, rejectPost, pinPost, unpinPost, archivePost, react, addComment, rotationSchedule, emergencyTakeover, accessibilityMode, etc.).

## 5. Digital Signage Specification

### Theme tokens — `palantir-dark` (normal)
```
name:      palantir-dark
bg:        #0b0e14
fg:        #e6edf3
accent:    #3fb950
border:    #21262d
font:      system-ui, Arial, sans-serif
direction: rtl
```

### Theme tokens — `palantir-emergency`
```
name:      palantir-emergency
bg:        #1a0000
fg:        #ffffff
accent:    #ff2a2a
border:    #ff6b6b
font:      system-ui, Arial, sans-serif
direction: rtl
```

### Feed-selection order
1. Emergency takeover active for the location → show emergency post only.
2. Rotation schedule exists → show scheduled items.
3. Always-append: any `safety-alert` or pinned post, even if not in schedule.
4. Fallback when no schedule and no always-show posts → top 10 currently visible posts.

### Rotation tuning
- Default interval: **8000 ms** per slide (8 s).
- Emergency: **15000 ms** (longer dwell for critical info).
- Clients receive `rotateBetween: false` during emergencies to stop rotation.

## 6. Accessibility (Israeli Law 5568, WCAG 2.1 AA)

| Feature                       | Default | Honored in feed |
|-------------------------------|---------|-----------------|
| `high-contrast`               | off     | Yes             |
| `large-font`                  | off     | Yes             |
| `screen-reader-friendly`      | **on**  | Yes             |

Clients (TV / mobile) consume `feed.accessibility` and switch CSS tokens accordingly. All posts are bilingual (HE/EN), so screen readers and RTL rendering work regardless of operator language.

## 7. Never-Delete Invariant

Enforced in four places:

1. **`archivePost`** marks `state = 'archived'`, never removes from the Map.
2. **`rejectPost`** marks `state = 'rejected'`, never removes.
3. **`listArchive`** provides queryable access to archived posts.
4. **`auditLog`** is append-only and holds every state transition.

Test `audit log: appends and never clears (לא מוחקים)` verifies the invariant by creating, approving, pinning, archiving, then re-reading the post — it is still accessible via `getPost(postId)`.

## 8. Moderation Flow

```
createPost()
   │
   ▼
 pending-moderation ───(pre-approved author OR autoModerate:false)──► published
   │
   ├── approvePost() ──► published
   └── rejectPost()  ──► rejected (kept in archive/audit)

 published
   │
   ├── pinPost() / unpinPost()
   ├── react() / addComment() / approveComment()
   └── archivePost() ──► archived (kept, queryable)
```

## 9. Test Coverage

34 tests across lifecycle, pinning, moderation queue, digital signage rotation, emergency takeover, reactions, comments, QR, accessibility, analytics, bilingual integrity, and never-delete invariant.

```
✔ constants export correctly
✔ createPost: rejects invalid type
✔ createPost: rejects missing titles
✔ createPost: queues for moderation by default
✔ createPost: pre-approved authors bypass moderation
✔ createPost: autoModerate=false publishes immediately
✔ approvePost moves from queue to published
✔ rejectPost marks state rejected and drops from queue
✔ listCurrent shows only published, non-expired posts
✔ listCurrent: safety-alerts float to the top
✔ listCurrent: filters by category and type
✔ pinPost sticks post to top, unpinPost reverses it
✔ pinPost rejects invalid date
✔ pinPost: auto-unpins when pinUntil expires (via listCurrent)
✔ archivePost preserves post but removes from current (never delete)
✔ pendingModeration: filters by submittedBy
✔ reactionsEnabled + react: increments counts
✔ commentsEnabled + addComment: moderated by default
✔ comments disabled by default — addComment throws
✔ rotationSchedule persists items and duration
✔ digitalSignageFeed: returns rotation items + Palantir dark theme
✔ digitalSignageFeed: fallback shows recent posts when no schedule
✔ digitalSignageFeed: safety-alerts always included
✔ emergencyTakeover: overrides feed with emergency theme
✔ clearEmergency: restores normal feed
✔ emergencyTakeover: rejects missing title
✔ qrCodeForMobile: returns signed URL and matrix
✔ accessibilityMode: sets high-contrast + large-font
✔ accessibilityMode: accepts camelCase aliases
✔ retentionAnalytics: computes engagement correctly
✔ audit log: appends and never clears (לא מוחקים)
✔ stats: summarizes board state
✔ all post types can be created
✔ bilingual fields preserved through create → list → archive

tests 34  pass 34  fail 0
```

## 10. Hebrew Glossary

| English                     | עברית                    |
|-----------------------------|--------------------------|
| Bulletin board              | לוח הודעות              |
| Post                        | הודעה / פוסט            |
| Pin                         | נעיצה / קיבוע            |
| Archive                     | ארכיון                   |
| Moderation                  | סינון / אישור            |
| Moderator                   | מנהל תוכן                |
| Pending approval            | ממתין לאישור             |
| Published                   | פורסם                    |
| Rejected                    | נדחה                     |
| Reaction                    | תגובה רגשית              |
| Like                        | לייק / אהבתי             |
| Thanks                      | תודה                     |
| Relevant                    | רלוונטי                  |
| Comment                     | הערה / תגובה             |
| Safety alert                | התראת בטיחות             |
| Emergency                   | חירום                    |
| Evacuation                  | פינוי                    |
| Announcement                | הודעה                    |
| HR                          | משאבי אנוש               |
| Lunch menu                  | תפריט מטבח / תפריט צהריים|
| Job posting (internal)      | משרה פנימית              |
| Marketplace                 | לוח יד שנייה             |
| Shout-out                   | מילה טובה                |
| Digital signage             | שילוט דיגיטלי            |
| Shop floor                  | רצפת ייצור               |
| Screen / TV                 | מסך / טלוויזיה           |
| Rotation schedule           | לוח סבב / רוטציה         |
| Takeover                    | השתלטות (חירום)          |
| QR code                     | קוד QR                   |
| Accessibility               | נגישות                   |
| High contrast               | ניגודיות גבוהה           |
| Large font                  | גופן מוגדל               |
| Screen reader friendly      | תואם קורא מסך            |
| Right-to-left               | מימין לשמאל              |
| Engagement                  | מעורבות                  |
| Impression                  | חשיפה                    |
| View                        | צפייה                    |
| Retention analytics         | ניתוח מעורבות            |
| Audit log                   | יומן ביקורת              |
| Never delete                | לא מוחקים                |
| Upgrade and grow            | משדרגים ומגדלים          |

## 11. Known Gaps / Next-Wave Upgrades (Never Delete, Only Grow)

- **Real QR rendering**: `qrMatrix` is a deterministic stub. When the rendering layer lands, swap the stub for a real QR generator without breaking the API (the `matrix` key stays).
- **Push notifications**: when a `safety-alert` is created or emergency is triggered, push notify all mobile app devices. Hook into the existing notifications bridge when available.
- **Scheduled publish**: `publishAt` field for scheduled posts. Add alongside `expireAt` — no breaking change.
- **Role-based targeting**: `targetRoles: ['foreman', 'electrician']` — filter `listCurrent` by viewer role.
- **Localization expansion**: add `title_ar` / `content.ar` when Arabic support is needed (the data model already uses bilingual objects, so this is additive).
- **Rich analytics dashboard**: hook `retentionAnalytics` into the BI dashboard widget.
- **i18n integration**: tie category names to the existing `onyx-procurement` i18n system rather than hardcoding.

All future expansions preserve the existing API surface. **No field is ever removed; new fields are added.**

## 12. Files Shipped

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\comms\bulletin-board.js` — module (zero deps, `CommonJS`, Node ≥14).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\comms\bulletin-board.test.js` — `node:test` suite (34 tests).
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y135-bulletin-board.md` — this report.

## 13. How to run

```
cd onyx-procurement
node --test test/comms/bulletin-board.test.js
```

Expected: `tests 34  pass 34  fail 0`.
