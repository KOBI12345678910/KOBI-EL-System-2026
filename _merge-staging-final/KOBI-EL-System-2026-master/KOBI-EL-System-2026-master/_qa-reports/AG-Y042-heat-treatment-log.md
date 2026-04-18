# AG-Y042 — Heat Treatment Log Tracker

**Agent:** Y-042 (Manufacturing Swarm)
**Module:** `onyx-procurement/src/manufacturing/heat-treatment-log.js`
**Tests:** `onyx-procurement/test/manufacturing/heat-treatment-log.test.js`
**Date:** 2026-04-11
**Status:** PASS — 27/27 tests green (required: 18)
**Standards covered:** ISO 9001 §8.5.2, AS9100 Rev D §8.5.2, NADCAP AC7102, AMS 2750 Rev G, AMS 2759

יומן אצוות טיפול תרמי — מודול קנוני לטכנו-קול עוזי

---

## 1. Overview / סקירה

### English
The `HeatTreatmentLog` class is the canonical, append-only source of truth
for every heat-treatment lot processed at Techno-Kol Uzi Metalworks. It is
intended to satisfy traceability requirements for ISO 9001, AS9100, and
NADCAP heat-treat (AC7102) audits, and to back the AMS 2750 Rev G pyrometric
controls (TC types, calibration cadence, SAT, furnace classes) that
aerospace primes (IAI, Elbit, Rafael, IMI Systems) require.

The module is **zero external dependencies** (Node built-ins only),
**bilingual Hebrew + English**, and **append-only**: nothing is ever deleted
or overwritten — every edit pushes a history snapshot, every action is
captured in `auditLog`. This honours the immutable Kobi rule
**"לא מוחקים רק משדרגים ומגדלים"**.

### עברית
מחלקת `HeatTreatmentLog` היא מקור האמת הקנוני, רק-הוספה (append-only),
לכל אצוות טיפול תרמי במפעל "טכנו-קול עוזי". נועדה לעמוד בדרישות העקיבות
של ISO 9001, AS9100, ו-NADCAP חימום (AC7102), ולתמוך בבקרות הפירומטריות
של AMS 2750 Rev G (סוגי צמדים תרמיים, תדירויות כיול, SAT, מחלקות תנורים)
שאותן דורשים לקוחות התעופה (תעש, אלביט, רפאל, מערכות IMI).

המודול **ללא תלויות חיצוניות** (רק built-ins של Node), **דו-לשוני**,
**אך-הוספה**: שום דבר לא נמחק ולא נדרס — כל עדכון דוחף תמונת היסטוריה,
כל פעולה נשמרת ב-`auditLog`. זה תואם את הכלל הקבוע של קובי:
**"לא מוחקים רק משדרגים ומגדלים"**.

---

## 2. AMS 2750 Rev G — Furnace Classes / מחלקות תנורים

| Class | TUS Band (±°C) | SAT Cadence | Control TC Calibration | Typical Use / שימוש | Hebrew |
|-------|---------------:|------------:|-----------------------:|---------------------|--------|
| 1 | ±3 °C  | 30 days  | 30 days  | Critical aerospace fasteners, turbine disks | מחלקה 1 — חלקי מנוע קריטיים |
| 2 | ±6 °C  | 90 days  | 90 days  | Standard aerospace, IAI/Elbit primary spec   | מחלקה 2 — תעופה כללית |
| 3 | ±8 °C  | 90 days  | 90 days  | Commercial heat treat, structural steels      | מחלקה 3 — מסחרי |
| 4 | ±10 °C | 180 days | 180 days | Stress relief / non-critical                  | מחלקה 4 — לא קריטי |
| 5 | ±14 °C | 180 days | 180 days | Forging pre-heat                              | מחלקה 5 — חימום מוקדם |
| 6 | ±28 °C | 365 days | 365 days | Casting bake-out                              | מחלקה 6 — אפיית יציקות |

**Notes / הערות**

- TUS = Temperature Uniformity Survey (סקר אחידות טמפרטורה).
- SAT = System Accuracy Test (בדיקת דיוק מערכת) — compares the control
  thermocouple to a calibrated test thermocouple at one or more setpoints.
- Allowed SAT deviation per AMS 2750 §3.4.4: **±1.1 °C or ±0.4 % of reading,
  whichever is greater** (for Class 2 standard aerospace work).
- The default for Techno-Kol Uzi production is **Class 2** unless an
  explicit Class 1 contract clause is on file.

---

## 3. Thermocouple Types / סוגי צמדים תרמיים

Per AMS 2750 Rev G Tables 3 & 4 / IEC 60584. The maximum temperature listed
is the **expendable / instrument** rating in oxidising / inert atmospheres.

| Type | Composition / הרכב | Class | Max °C | Hebrew |
|------|--------------------|------:|-------:|--------|
| K | Chromel / Alumel (Ni-Cr / Ni-Al) | Base  | 1260 | כרומל-אלומל |
| J | Iron / Constantan (Fe / Cu-Ni)   | Base  |  760 | ברזל-קונסטנטן |
| T | Copper / Constantan (Cu / Cu-Ni) | Base  |  370 | נחושת-קונסטנטן |
| N | Nicrosil / Nisil                 | Base  | 1260 | ניקרוסיל-נסיל |
| R | Pt / Pt-13 % Rh                  | Noble | 1480 | פלטינה-13%רודיום |
| S | Pt / Pt-10 % Rh                  | Noble | 1480 | פלטינה-10%רודיום |
| B | Pt-30 % Rh / Pt-6 % Rh           | Noble | 1700 | פלטינה-30/6%רודיום |

The module enforces this envelope at `defineFurnace`: a Type J thermocouple
on a 1100 °C furnace is rejected at definition time so it can never be
silently misused.

---

## 4. Process Definitions / הגדרות תהליכים

| Process | Hebrew | Typical Range | Purpose / מטרה |
|---------|--------|---------------|----------------|
| `anneal` | חישול / רוך | 600–950 °C | Soften cold-worked steel; relieve internal stress; restore ductility. ריכוך פלדה מקוצרת קור והשבת ניתפעות. |
| `normalize` | נורמליזציה | 820–950 °C, air cool | Refine grain size after forging or casting; uniform mechanical properties. עידון גרגר אחרי חישול או יציקה. |
| `temper` | טמפור (השבחה) | 150–700 °C | Reduce brittleness after quenching; achieve target hardness/toughness. הפחתת שבריריות אחרי הרתחה. |
| `quench` | הרתחה / הקפאה | 780–900 °C, fast cool | Trap martensite for high hardness. שימור מרטנסיט לקשיחות גבוהה. |
| `stress-relief` | הרפיית מאמצים | 550–680 °C | Remove residual welding/machining stresses without altering microstructure. הסרת מאמצים שיוריים. |
| `case-harden` | עיבוי שטח (קשיחות) | 850–950 °C with C/N atmosphere | Harden surface layer (carburise, carbonitride, nitride). חיזוק רק שכבת השטח. |

Tolerance defaults per process are baked into `PROCESS_CATALOG`; recipes
can override via `toleranceC`. Time-at-temperature minima are derived from
`soakTime` unless `minTimeAtTemp` is specified.

---

## 5. Implemented API / ממשק

| Method | Returns | Description |
|--------|---------|-------------|
| `defineFurnace({id, type, temperatureRange, tcMapping, thermocoupleType, calibrationDue, class?})` | frozen furnace record | Register/upgrade a furnace; verifies TC envelope; AMS 2750 class default `'2'`. |
| `defineRecipe({id, name_he, name_en, process, targetTemp, soakTime, coolingRate, atmosphere, rampRate, toleranceC?, minTimeAtTemp?})` | frozen recipe | Register/upgrade a process recipe; validates against `PROCESS_CATALOG`. |
| `startLot({lotId, partNumber, qty, heatNo, material, recipeId, furnaceId, operatorId})` | open lot | Open a new lot; refuses to overwrite. |
| `logReading({lotId, timestamp, actualTemp:[{location,value}], setTemp})` | frozen reading | Append a time-series reading to an open lot. |
| `hardnessLog({lotId, readings})` | array of frozen readings | Append hardness readings (HRC, HRB, HB, HV). |
| `completeLot({lotId, hardnessHRC?, hardnessHB?, visualInspection?, passed, rejectReason?})` | closed lot | Close lot, store result, lock further readings. |
| `deviationCheck(lotId)` | report | Cross-check readings vs recipe (tolerance, time-at-temp). |
| `generateCertificate(lotId)` | bilingual cert object | Build certificate with He/En text block, signature placeholders, motto. |
| `traceability(serialNumber)` | genealogy | Walks raw-heat → HT lot → part → assembly → shipment. |
| `furnaceCalibrationCheck(furnaceId, asOf?)` | overdue alert | Bilingual alert if calibration is past due. |
| `recordCalibration(furnaceId, performedAt, performedBy)` | event | Push calibration event; auto-bump next due per class cadence. |
| `systemAccuracyTest(furnaceId, {controlReadingC, testReadingC, performedAt?, performedBy?})` | SAT result | Quarterly SAT for Class 2; pass/fail vs ±1.1 °C / ±0.4 %. |
| `registerPart(serialNumber, lotId, partNumber?)` | part record | Tie a part instance to its HT lot. |
| `registerAssembly(assemblyId, partSerials)` | assembly record | Group parts into an assembly. |
| `registerShipment(shipmentId, assemblyIds, date?)` | shipment record | Final genealogy node. |

All public methods write to `auditLog`.

---

## 6. Storage Model / מודל אחסון

In-memory `Map`-based store, append-only. Top-level Maps:

- `furnaces`     — `Map<furnaceId, frozen furnace record>`
- `recipes`      — `Map<recipeId, frozen recipe record>`
- `lots`         — `Map<lotId, mutable lot record (transitions: in-progress → completed | rejected)>`
- `parts`        — `Map<serialNumber, frozen part record>`
- `assemblies`   — `Map<assemblyId, frozen assembly record>`
- `shipments`    — `Map<shipmentId, frozen shipment record>`
- `hardness`     — `Map<lotId, hardness reading[]>`
- `calibrations` — `Map<furnaceId, calibration event[]>`
- `satHistory`   — `Map<furnaceId, SAT event[]>`

Plus the global `auditLog` array. Persistence is the caller's job — the
module is intentionally storage-agnostic.

---

## 7. Test Coverage / כיסוי בדיקות

Run with:

```
node --test test/manufacturing/heat-treatment-log.test.js
```

| # | Test | Validates |
|--:|------|-----------|
| 1 | catalogs are frozen and complete | TC types, processes, classes, hardness scales all present and frozen |
| 2 | defineFurnace stores furnace with bilingual labels | Basic registration with He/En labels |
| 3 | defineFurnace rejects TC type that cannot reach max temp | Type J cannot run a 1100 °C furnace |
| 4 | defineFurnace rejects unknown thermocouple type | Type 'Z' is rejected |
| 5 | defineFurnace upgrade preserves history (לא מוחקים) | Append-only upgrade with history snapshot |
| 6 | defineRecipe stores bilingual recipe with process metadata | Recipe with He/En + process catalog binding |
| 7 | defineRecipe rejects unknown process | 'foo' rejected |
| 8 | startLot creates an in-progress lot | Lot lifecycle state |
| 9 | startLot refuses to overwrite an existing lot | Append-only enforcement |
| 10 | logReading appends time-series readings in order | Sequence numbering |
| 11 | completeLot transitions to completed and locks further readings | State machine and read-only lock |
| 12 | completeLot reject path requires rejectReason | Mandatory reject documentation |
| 13 | deviationCheck flags over-temperature within the soak window | Tolerance band detection |
| 14 | deviationCheck flags time-at-temperature short of minimum | Soak time floor |
| 15 | deviationCheck happy path returns within=true | Clean run |
| 16 | furnaceCalibrationCheck flags overdue calibration | AMS 2750 calibration alert |
| 17 | recordCalibration bumps calibrationDue per class cadence | Class-dependent cadence |
| 18 | systemAccuracyTest passes when within tolerance | SAT pass case |
| 19 | systemAccuracyTest fails when deviation exceeds tolerance | SAT fail case |
| 20 | traceability walks raw heat → lot → part → assembly → ship | Full genealogy chain |
| 21 | traceability returns not-found for unknown serial | Defensive lookup |
| 22 | generateCertificate produces bilingual cert with all readings | He+En, motto, signatures, readings |
| 23 | generateCertificate refuses to certify still-running lot | Closure precondition |
| 24 | hardnessLog accepts HRC, HRB, HB, HV in a single batch | Multi-scale support |
| 25 | hardnessLog rejects unknown hardness scale | Defensive scale check |
| 26 | hardnessLog appends — does not overwrite | Append-only |
| 27 | auditLog captures every mutating action | Audit completeness |

**Result: 27/27 PASS** (118 ms, Node v24.14.1).

---

## 8. Hebrew Glossary / מילון עברי

| Hebrew | Transliteration | English |
|--------|-----------------|---------|
| חישול | chishul | annealing |
| נורמליזציה | normalizatzia | normalizing |
| טמפור / השבחה | tempur / hashbacha | tempering |
| הרתחה / הקפאה | hartacha / hak'pa'a | quenching |
| הרפיית מאמצים | harpa'at ma'amatzim | stress relief |
| עיבוי שטח | ibui shetach | case hardening |
| קרבוריזציה | karborizatzia | carburising |
| קרבונטרידציה | karbonitridtzia | carbonitriding |
| חנקה / נטרוד | chnaka / nitrud | nitriding |
| צמד תרמי | tzemed termi | thermocouple |
| טמפרטורת יעד | temperatura ya'ad | target temperature |
| חלון סבילות | chalon savilut | tolerance window |
| זמן השהייה | zman hash'haya | soak time |
| זמן בטמפרטורה | zman b'temperatura | time-at-temperature |
| קצב חימום | ketzev chimum | ramp rate |
| קצב קירור | ketzev kirur | cooling rate |
| מספר יציקה | mispar yetzika | heat number (raw material) |
| מספר אצווה | mispar atzva | lot number |
| מספר סידורי | mispar siduri | serial number |
| תעודת טיפול תרמי | te'udat tipul termi | heat treatment certificate |
| מתכון / מפרט תהליך | matkon / mifrat tahalich | recipe / process spec |
| תנור ואקום | tanur vacuum | vacuum furnace |
| כיול | kiyul | calibration |
| חריגה | chariga | deviation |
| עקיבות | akivut | traceability |
| קשיחות | kashichut | hardness |
| רוקוול | rockwell | Rockwell |
| ברינל | brinell | Brinell |
| ויקרס | vickers | Vickers |
| מפעיל | mafil | operator |
| אבטחת איכות | avtachat eichut | quality assurance |
| לא מוחקים רק משדרגים ומגדלים | lo mochakim rak meshadragim u'magdilim | append-only, never delete |

---

## 9. Compliance Cross-Reference / הצלבות תקנים

| Requirement | Standard ref. | How the module satisfies it |
|-------------|---------------|------------------------------|
| Lot-to-raw-heat traceability | ISO 9001 §8.5.2; AS9100 Rev D §8.5.2 | `startLot.heatNo` + `traceability(serialNumber)` |
| Furnace classification & TUS | AMS 2750 Rev G §3.3 / Table 6 | `FURNACE_CLASSES`, `defineFurnace.class` |
| Thermocouple type/temp limits | AMS 2750 Rev G §3.2 / Table 3 | `THERMOCOUPLE_TYPES` enforced at `defineFurnace` |
| Control TC calibration cadence | AMS 2750 Rev G §3.2.5 | `furnaceCalibrationCheck` + `recordCalibration` (class-driven cadence) |
| System Accuracy Test (SAT) | AMS 2750 Rev G §3.4 | `systemAccuracyTest` (quarterly default for class 2; ±1.1 °C / ±0.4 %) |
| Time-at-temperature soak | AMS 2759/* | `deviationCheck.timeAtTempOk` |
| Temperature deviation in band | AMS 2750 Rev G §3.5 | `deviationCheck` over-/under-temperature kinds |
| Process certificate signed by operator + QA | NADCAP AC7102 | `generateCertificate.signaturePlaceholders` |
| Append-only audit trail | ISO 9001 §7.5.3 | Frozen `auditLog` entries |

---

## 10. Open Items / פתוחים

- Persistence layer (SQLite, Postgres) — out of scope, caller wires it.
- TUS (Temperature Uniformity Survey) recording is not yet a first-class
  method; can be added as `recordTUS(furnaceId, surveyData)` next iteration.
- Hardness conversion tables (ASTM E140) intentionally **not** included —
  conversions are alloy-specific and lossy. The log keeps each scale as
  reported.

---

**Verdict / מסקנה:** READY FOR PRODUCTION USE — 27 tests green, zero
external dependencies, append-only, bilingual, AMS 2750 class-aware.

לא מוחקים רק משדרגים ומגדלים.
