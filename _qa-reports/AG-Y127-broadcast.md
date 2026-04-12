# AG-Y127 — Broadcast Announcement Engine / מנוע שידורים פנימיים

**Agent:** Y-127
**Module:** `onyx-procurement/src/comms/broadcast.js`
**Tests:**  `onyx-procurement/test/comms/broadcast.test.js`
**Version:** Y127.1.0 (upgrade on top of existing Broadcast v1)
**Status:** Delivered
**Test result:** 20 / 20 pass (`node --test test/comms/broadcast.test.js`)
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים — no record, delivery
event, ack event, opt-out event or history entry is ever removed. Cancel,
opt-in and opt-out are status flips + append-only log entries. The
original Broadcast v1 surface (createAnnouncement, publishNow, recall
etc.) is preserved untouched; Y-127 adds the new high-level API alongside.

**Dependencies:** Node built-ins only (`node:crypto`, `node:test`,
`node:assert`). No npm install required.

---

## 1. Purpose (מטרה)

Techno-Kol Uzi's internal broadcast engine: a zero-dependency, bilingual
(Hebrew / English, RTL-aware) announcement and mass-communication hub
used to push notices, policy updates, shift reminders, safety alerts,
emergency messages and templated reminders to employees across five
delivery channels.

- **Internal audiences:** employees filtered by department, role, tenure
  band, physical location or free-form segment labels.
- **External audiences:** the same machinery can target contractor or
  supplier contact lists by swapping the directory — the opt-out list
  still applies.
- **Scheduled + immediate dispatch:** future-dated broadcasts flip to
  `scheduled` and are picked up by the existing scheduled-publish sweep;
  `sendNow` dispatches instantly.
- **Emergency override:** `emergencyBroadcastY127` forces every channel,
  ignores opt-out preferences, bypasses scheduling, and always sets
  `requiresAck = true`.
- **Append-only audit:** every create/schedule/send/cancel/ack/reminder
  event is permanent and reconstructible.

המערכת היא in-memory — נטענת מיידית ב-CI וב-tests ללא תלות חיצונית.

---

## 2. Public API (class `Broadcast`) — Y-127 methods

| Method | Purpose (EN) | מטרה (HE) |
|---|---|---|
| `new Broadcast({now, directory, gateways})` | Construct with injectable clock, employee directory and per-channel gateways. | יצירת מופע עם שעון, ספריית עובדים וגיישווי ערוצים. |
| `createBroadcast({id, title_he, title_en, body_he, body_en, channels, audience, priority, scheduledFor, requiresAck})` | Create an append-only broadcast record. Validates channels (email/sms/in-app/push/whatsapp) and priority (info/normal/urgent/emergency). Returns a Y-127 view of the record. | יצירת רשומת שידור חדשה (ללא משלוח). תיקוף ערוצים ודחיפויות. החזרת תצוגת Y-127 של הרשומה. |
| `scheduleBroadcast(broadcastId, datetime)` | Set future publishAt and flip status to `scheduled`. Rejects if already sent or cancelled. | תזמון שידור לעתיד. דוחה שידור שכבר נשלח או בוטל. |
| `sendNow(broadcastId)` | Immediately dispatch across all configured channels to the resolved audience (respecting opt-out list for non-essential types). | שליחה מיידית לכל הערוצים לפי קהל היעד (תוך כיבוד רשימת ביטול ההרשמה). |
| `cancelBroadcast(broadcastId, reason)` | Non-destructive: flips status to `cancelled`, records the reason, keeps the original record and all delivery/ack/history logs intact forever. | ביטול לא-הרסני: שינוי סטטוס, תיעוד הסיבה, שמירת הרשומה המקורית לצמיתות. |
| `audienceSelector({criteria})` | Resolve a flat list of directory users matching any combination of `departments`, `roles`, `tenures`, `locations`, `segments`, `custom`, `all`. All filters AND-combine. | ליקוט קהל יעד לפי שילוב של מחלקות/תפקידים/ותק/מיקום/פלחים/רשימה מותאמת/כל החברה. |
| `ackTracking(broadcastId)` | Returns `{total, acknowledged, pending, acknowledgedUserIds, pendingUserIds}`. Idempotent: latest ack event per user wins. | מעקב אישורי קריאה — הערך המאוחר ביותר לכל משתמש קובע. |
| `ackReminder(broadcastId)` | Re-dispatch the broadcast only to non-acknowledgers. Adds `kind:'ack-reminder'` delivery events to the log. | תזכורת לאישור קריאה — נשלחת רק למי שטרם אישר. |
| `deliveryReport(broadcastId)` | `{sent, delivered, failed, opened, clicked, acknowledged, channels, status}`. `opened == clicked` in the stub (UI click tracking = read event). | דוח משלוח: נשלח/סופק/נכשל/נפתח/נלחץ/אושר, כולל רשימת ערוצים וסטטוס. |
| `emergencyBroadcastY127({message_he, message_en, channels, allEmployees})` | Emergency path. Bypasses scheduling AND opt-out. Forces all five channels by default. Always requires acknowledgment. Logged with `category:'emergency'` and `bypassedOptOut:true`. | מסלול חירום. עוקף תזמון ורשימת ביטול הרשמה. ברירת מחדל: כל חמשת הערוצים. תמיד דורש אישור קריאה. |
| `broadcastHistory(filters)` | Filtered view over the append-only history array. Filters: `{action, status, priority, since, until}`. | תצוגה מסוננת של היסטוריית השידורים (append-only). |
| `registerTemplate({id, title_he, title_en, body_he, body_en, channels, priority, requiresAck})` | Register a bilingual template with `{{placeholder}}` slots. Append-only: cannot redefine an existing id. | רישום תבנית דו-לשונית עם שדות מילוי `{{placeholder}}`. |
| `templateBroadcast(templateId, vars)` | Instantiate a broadcast from a template, substituting vars in both Hebrew and English strings. | יצירת שידור מתוך תבנית, עם החלפת שדות. |
| `optOutList(arg)` | Query form: `optOutList('marketing')` → user ids. Mutation form: `optOutList({userId, broadcastType, optOut})` → adds/removes an opt-out. Essential broadcast types (emergency/safety/policy/…) **cannot** be opted out — attempts are rejected and logged. | ניהול רשימת ביטול הרשמה. צורת שאילתא וצורת עדכון. סוגים חיוניים (חירום/בטיחות/נהלים/…) לא ניתנים לביטול הרשמה. |

### Preserved v1 surface (kept, not replaced)

`createAnnouncement`, `publishNow`, `scheduledPublish`, `trackDelivery`,
`trackReadReceipts`, `acknowledgmentRequired`, `acknowledge`,
`pendingAcks`, `recallAnnouncement`, `emergencyBroadcast` (v1),
`pollEmbed`, `votePoll`, `complianceLog`, `digestMode`, `translateAuto`,
`analytics`. All still green — new methods sit alongside.

---

## 3. Channels (ערוצים)

Y-127 supports **five** channels. Internally they map to the existing
`ALL_CHANNELS` set, with `push` added as the OS/mobile push alias of
`notification-center`.

| Channel (EN) | Channel (HE) | ID | Use case |
|---|---|---|---|
| Email | דוא"ל | `email` | Long-form policy/HR updates, compliance records, audit trail. |
| SMS | מסרון SMS | `sms` | Shift reminders, urgent short messages, 2FA-style alerts. |
| In-app notification | התראה באפליקציה | `in-app` | Bell-icon feed inside the ERP web/desktop client. |
| Push notification | התראת דחיפה | `push` | OS/mobile push for the field-worker app. |
| WhatsApp Business | וואטסאפ | `whatsapp` | Reaches external contractors and shop-floor workers who prefer WhatsApp. |

Selection is made per broadcast via the `channels` array. Invalid channels
are rejected at `createBroadcast`. Emergency broadcasts **default to all
five** unless the caller explicitly narrows them.

---

## 4. Priorities (דחיפויות)

| Priority (EN) | Priority (HE) | ID | Behavior |
|---|---|---|---|
| Info | מידע כללי | `info` | Below normal. Eligible for digest bundling; low-urgency shout-outs, lunch-menu updates. |
| Normal | רגיל | `normal` | Default. Sent via configured channels only. |
| Urgent | דחוף | `urgent` | Forces at least in-app + email + SMS regardless of the caller's channel list. |
| Emergency | חירום מיידי | `emergency` | Forces **every** channel, always `requiresAck=true`, bypasses digest, bypasses opt-out, bypasses approval, logged to the compliance log. |

Priority `important` from v1 is still accepted for backward compatibility
but new Y-127 callers should prefer the four above.

---

## 5. Audience Rules (כללי קהל יעד)

The Y-127 audience model supports free mixing of six criteria keys:

| Key | Type | Match against | Example |
|---|---|---|---|
| `all` | boolean | every user in directory | `{all:true}` → all 8 users |
| `departments` | string[] | `user.department` | `{departments:['eng','hr']}` |
| `roles` | string[] | `user.role` | `{roles:['manager']}` |
| `tenures` | string[] | `user.hireDate` bucketed into `new` (<1y), `mid` (1–3y), `senior` (3–7y), `veteran` (≥7y) | `{tenures:['veteran']}` |
| `locations` | string[] | `user.location` | `{locations:['tel-aviv','haifa']}` |
| `segments` | string[] | any element of `user.segments[]` | `{segments:['core','floor']}` |
| `custom` | string[] | explicit user id list | `{custom:['u3','u7']}` |

Semantics:
- All supplied arrays **AND-combine**. Empty arrays are ignored.
- `custom` short-circuits all other filters.
- `all:true` returns the entire directory.

### Opt-out interaction

When `sendNow` publishes a broadcast:

1. Resolve recipients via `audienceSelector` equivalent.
2. If the broadcast's `category` is in `ESSENTIAL_BROADCAST_TYPES`
   (emergency, safety, policy, compliance, security, fire, lockdown,
   evacuation, hazmat, medical) **or** priority is `emergency`, opt-out is
   ignored.
3. Otherwise, any user whose opt-out set contains the broadcast's type
   **or** the sentinel `'all-non-essential'` is removed from the recipient
   list for this send.
4. Opt-outs never remove the user from the directory — they only filter
   that single dispatch.

---

## 6. Emergency Bypass

`emergencyBroadcastY127` is the red-button path:

- `bypassedScheduling: true` — ignores any `scheduledFor` field; dispatches immediately.
- `bypassedOptOut: true` — every user in the directory receives it, regardless of opt-out settings.
- Default channel set is **all five** (`email`, `sms`, `in-app`, `push`, `whatsapp`) unless the caller restricts.
- `priority = 'emergency'`, `requiresAck = true`, `category = 'emergency'`.
- Written to the compliance log with `action='emergency-broadcast-y127'`,
  `bypassedOptOut=true`, `bypassedSchedule=true`, plus the channel list
  used — so regulators can verify the broadcast happened even if the
  frontend was unavailable.

---

## 7. Hebrew Glossary (מילון עברית)

Single source of truth (`HEBREW_GLOSSARY` export), used by all
Hebrew-facing UI:

| Key | Hebrew | English |
|---|---|---|
| `announcement` | הודעה | Announcement |
| `broadcast` | שידור פנימי | Broadcast |
| `publish` | פרסום | Publish |
| `schedule` | תזמון | Schedule |
| `recall` | משיכה | Recall |
| `retraction` | הודעת ביטול | Retraction notice |
| `cancelled` | בוטל | Cancelled |
| `cancelReason` | סיבת ביטול | Cancel reason |
| `acknowledge` | אישור קריאה | Acknowledge |
| `pendingAck` | ממתין לאישור | Pending ack |
| `acknowledged` | אושר | Acknowledged |
| `requiresAck` | נדרש אישור קריאה | Requires ack |
| `ackReminder` | תזכורת לאישור קריאה | Ack reminder |
| `priorityInfo` | מידע כללי | Info |
| `priorityNormal` | רגיל | Normal |
| `priorityImportant` | חשוב | Important |
| `priorityUrgent` | דחוף | Urgent |
| `priorityEmergency` | חירום מיידי | Emergency (immediate) |
| `emergency` | חירום | Emergency |
| `evacuation` | פינוי | Evacuation |
| `fire` | שריפה | Fire |
| `lockdown` | סגר חירום | Lockdown |
| `severeWeather` | מזג אוויר קיצוני | Severe weather |
| `gasLeak` | דליפת גז | Gas leak |
| `hazmat` | חומרים מסוכנים | Hazardous materials |
| `channelEmail` | דוא"ל | Email |
| `channelInApp` | התראה באפליקציה | In-app notification |
| `channelSms` | מסרון SMS | SMS |
| `channelWhatsapp` | וואטסאפ | WhatsApp |
| `channelPush` | התראת דחיפה | Push notification |
| `audienceAll` | כל העובדים | All employees |
| `audienceDepartment` | מחלקה | Department |
| `audienceRole` | תפקיד | Role |
| `audienceCustom` | רשימה מותאמת | Custom list |
| `audienceSelection` | בחירת קהל יעד | Audience selection |
| `tenure` | ותק | Tenure |
| `location` | מיקום | Location |
| `segments` | פלחים | Segments |
| `readReceipt` | אישור קריאה | Read receipt |
| `deliveryReport` | דוח משלוח | Delivery report |
| `history` | היסטוריה | History |
| `template` | תבנית | Template |
| `digestDaily` | תקציר יומי | Daily digest |
| `poll` | סקר | Poll |
| `policyUpdate` | עדכון נוהל | Policy update |
| `iReadAndUnderstood` | קראתי והבנתי | I read and understood |
| `optOut` | ביטול הרשמה | Opt out |
| `optIn` | הרשמה | Opt in |
| `essentialOnly` | חובה — לא ניתן לבטל הרשמה | Essential — cannot opt out |
| `broadcastCreated` | שידור נוצר | Broadcast created |
| `broadcastScheduled` | שידור תוזמן | Broadcast scheduled |
| `broadcastSent` | שידור נשלח | Broadcast sent |
| `broadcastCancelled` | שידור בוטל | Broadcast cancelled |

---

## 8. Test Coverage (ראיות בדיקה)

`node --test test/comms/broadcast.test.js` → **20 / 20 pass**.

| # | Test | What it proves |
|---|---|---|
| 01 | createBroadcast — bilingual record | Y-127 channels + priorities validated, HE/EN fields preserved, `status:'draft'`. |
| 02 | scheduleBroadcast — future publishAt | Status flips to `scheduled`, `scheduledFor` stored. |
| 03 | sendNow — dispatch | 8 users × 2 channels = 16 events; status flips to `sent`. |
| 04 | cancelBroadcast — preservation | Status `cancelled`, reason captured, `_announcements` record still present. |
| 05 | audienceSelector — filters | Departments, roles, locations match the expected subsets. |
| 06 | audienceSelector — tenure/segments/custom/all | Tenure banding (`new`/`mid`/`senior`/`veteran`) works against hireDate; segments & custom lists correct. |
| 07 | ackTracking | 2 ack'd + 6 pending out of 8; id lists match. |
| 08 | ackReminder | Reminders go only to the 6 non-ackers × 2 channels = 12 reminder events. |
| 09 | deliveryReport | sent/delivered/opened/clicked/acknowledged counts line up with appended events. |
| 10 | emergencyBroadcastY127 | Reaches all 8 users even though one user opted out of everything non-essential; all 5 channels used. |
| 11 | opt-out enforcement (non-essential) | Marketing broadcast skips opted-out users. |
| 12 | opt-out enforcement (essential) | Attempt to opt out of `safety` is rejected; safety broadcast still reaches the user. |
| 13 | templateBroadcast | `{{shift}}`, `{{name}}`, `{{time}}` substituted into both HE and EN strings. |
| 14 | broadcastHistory — action filter | `createBroadcast` returns 2, `cancelBroadcast` returns 1 with reason. |
| 15 | createBroadcast — invalid channels | `['fax','carrier-pigeon']` rejected. |
| 16 | sendNow — cancelled rejection | Cancelled broadcast cannot be resent. |
| 17 | cancelBroadcast — history append | Second cancel call still appends (idempotent but append-only). |
| 18 | Hebrew RTL | Unicode hebrew titles/bodies preserved; glossary exposes HE labels. |
| 19 | No deletes — invariants | delivery log, ack log, history all grow or stay — never shrink — after cancel. |
| 20 | optOutList — query form | Query form returns correct ids; opt-in appends rather than rewrites. |

---

## 9. Data Model (מודל נתונים)

### Broadcast record (Y-127 view)

```js
{
  id: 'ann-<hex>',
  title_he: string,
  title_en: string,
  body_he: string,
  body_en: string,
  channels: string[],
  audience: object,          // {all:true} | {departments:[...], ...} | {custom:[...]}
  priority: 'info'|'normal'|'urgent'|'emergency',
  scheduledFor: number|null, // ms epoch
  requiresAck: boolean,
  status: 'draft'|'scheduled'|'sent'|'cancelled'|'published'|'expired',
  createdAt: number,
  publishedAt: number|null,
  category: string,          // 'broadcast' | 'emergency' | 'safety' | ...
  retracted: boolean,
  cancelled: boolean,
  cancellationReason: string|null,
}
```

### Append-only stores

| Store | Key | Shape | Growth |
|---|---|---|---|
| `_announcements` | broadcast id | full record | create-only |
| `_createOrder` | n/a | id[] | create-only |
| `_deliveries` | broadcast id | event[] | send-only |
| `_acks` | broadcast id | ack event[] | ack-only |
| `_reads` | broadcast id | read event[] | read-only |
| `_cancellations` | broadcast id | `{reason, at, previousStatus}` | cancel-only |
| `_ackReminders` | broadcast id | reminder event[] | reminder-only |
| `_history` | seq | history event[] | all-lifecycle |
| `_templates` | template id | template | register-only |
| `_optOuts` | userId | Set<broadcastType> | grows; opt-in removes from Set but logs to `_optOutLog` |
| `_optOutLog` | seq | event[] | append-only |
| `_complianceLog` | seq | event[] | append-only |
| `_auditTrail` | seq | event[] | append-only |

No method deletes from any of these stores. The only shrinkage in the
system is the in-memory `_optOuts` Set on opt-in (to restore
deliverability) — but the event is permanently logged in `_optOutLog`
and `_auditTrail`, so the decision is reconstructible.

---

## 10. Compliance & Israeli A11y 5568

- All UI-facing strings round-trip through the Hebrew glossary (single
  source of truth, no hard-coded English in the HE path).
- Bilingual `title_he`/`body_he` paired with `title_en`/`body_en` is the
  norm — the module enforces at least one non-empty side and fills the
  other with a `(ללא תוכן)` / `(no content)` placeholder.
- `direction: 'rtl'` is the caller's responsibility in the render layer;
  the data model never truncates Hebrew characters or combining marks.
- Emergency broadcasts are logged to the compliance log with enough
  context (category, channels, bypass flags, recipient count) that an
  external audit can reconstruct the event without reading code.

---

## 11. Governing Rule (רק מוסיפים, אף פעם לא מוחקים)

| Attempted deletion | What actually happens |
|---|---|
| Cancel a broadcast | Status flips to `cancelled`; record + logs preserved. |
| Opt out of a broadcast type | User added to `_optOuts` set; original `_optOutLog` entry kept; essential types refuse the opt-out and log the refusal. |
| Recall a broadcast (v1 path) | Retraction notice created as a **new** announcement; original stays with `retracted:true`. |
| Send reminder | Extra `delivery` events appended with `kind:'ack-reminder'`. |
| Schedule after cancel | Throws. |
| Send after cancel | Throws. |
| Template id reuse | Throws. |

---

## 12. Run

```bash
cd onyx-procurement
node --test test/comms/broadcast.test.js
```

Expected tail:
```
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

---

**Agent Y-127 sign-off** — מנוע שידורים פנימיים מוכן לייצור.
Zero external deps. Bilingual. Append-only. Emergency bypass hardened.
No existing Broadcast v1 behavior removed.
