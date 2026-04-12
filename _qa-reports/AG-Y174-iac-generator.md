# AG-Y174 — Infrastructure-as-Code Generator / מחולל תשתית כקוד

**Status:** PASS (34/34 tests green)
**Date:** 2026-04-11
**Agent:** Y-174
**Module:** `onyx-procurement/src/devops/iac-generator.js`
**Tests:** `onyx-procurement/test/devops/iac-generator.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)

---

## 1. Purpose / מטרה

### English
Pure-JavaScript, zero-dependency generator that emits two forms of
Infrastructure-as-Code for Israeli-hosted cloud workloads:

1. **Terraform HCL** — `terraform {}` block, pinned provider versions,
   remote state backend per cloud, one `module` block per resource.
2. **Pulumi TypeScript** — `@pulumi/pulumi` `ComponentResource`, Israeli
   region constants, per-resource tag maps.

Every generator method returns a **string** — nothing is written to
disk. The caller decides where to persist the output (typically to
`main.tf`, `backend.tf`, or `index.ts`).

### עברית
מחולל JavaScript טהור, ללא תלויות חיצוניות, שמפיק שתי צורות של תשתית
כקוד עבור עומסי עבודה ענן המתארחים בישראל:

1. **Terraform HCL** — בלוק `terraform {}`, גרסאות ספקים מוקפאות, גיבוי
   state מרוחק לפי ענן, בלוק `module` אחד לכל משאב.
2. **Pulumi TypeScript** — `ComponentResource` מסוג `@pulumi/pulumi`,
   קבועי אזור ישראליים, מפות תגיות לכל משאב.

כל פונקציית מחולל מחזירה **מחרוזת** — דבר לא נכתב לדיסק. המפעיל
מחליט היכן לשמור את הפלט (בדרך כלל ל-`main.tf`, `backend.tf` או
`index.ts`).

## 2. Israeli Regions / אזורים בישראל

| Cloud  | Region Slug      | City      | Notes                         |
|--------|------------------|-----------|-------------------------------|
| AWS    | `il-central-1`   | Tel Aviv  | GA since 2023                 |
| Azure  | `israelcentral`  | Israel Central | GA since 2023            |
| GCP    | `me-west1`       | Tel Aviv  | GA since 2022                 |

Every resource is pinned to its cloud's Israeli region automatically.
The generator refuses to emit anything outside the three Israeli
regions — `data-residency: israel` is enforced at the tag level too.

כל משאב מוצמד אוטומטית לאזור הישראלי של הענן שלו. המחולל מסרב להפיק
דבר מחוץ לשלושת האזורים הישראליים — `data-residency: israel` נאכף גם
ברמת התגית.

## 3. Compliance Tags / תגי ציות

Every resource receives the following compliance tag by default:

```
"compliance" = "ISO-27001,ISR-SOC2,PCI-DSS"
```

| Framework   | Hebrew                        | Scope                     |
|-------------|-------------------------------|---------------------------|
| PCI-DSS     | תקן אבטחת נתונים לכרטיסי אשראי | Payment card data          |
| ISR-SOC2    | SOC2 התאמה ישראלית            | Service-org controls       |
| ISO-27001   | תקן אבטחת מידע בינלאומי       | ISMS                       |

Callers may *add* frameworks (e.g. `HIPAA`) — they cannot remove the
defaults. This is the "never delete" principle applied to compliance
metadata.

המפעילים רשאים **להוסיף** תקני ציות (לדוגמה `HIPAA`) — הם אינם יכולים
להסיר את ברירות המחדל. זהו עיקרון "לא מוחקים" שמיושם גם על מטא-דאטה
של ציות.

## 4. Tag Schema / סכמת תגיות

| Key                | Value example                  | עברית                       |
|--------------------|--------------------------------|------------------------------|
| `business-name-he` | `טכנו-קול עוזי בע"מ`           | שם העסק בעברית (UTF-8)     |
| `business-name-en` | `Techno-Kol Uzi Ltd`           | שם העסק באנגלית              |
| `compliance`       | `ISO-27001,ISR-SOC2,PCI-DSS`  | רשימת תקני ציות              |
| `managed-by`       | `iac-generator-agent-y174`    | מקור המחולל                  |
| `environment`      | `prod` / `staging` / `dev`    | סביבה                        |
| `data-residency`   | `israel`                       | מיקום הנתונים                |
| `cost-center`      | `CC-ERP-001`                  | מרכז עלות                    |
| `region-display`   | `AWS Israel (Tel Aviv) — il-central-1` | תצוגת אזור         |

## 5. Module Versioning / גרסאות מודולים

Every Terraform `module` block is rendered twice:

```hcl
source  = "git::https://github.com/techno-kol-uzi/iac-modules.git//aws-s3-bucket?ref=v4.1.2"
version = "4.1.2"
```

- `?ref=v<X.Y.Z>` pins the git source to an immutable tag
- `version = "<X.Y.Z>"` sets the registry-compatible version constraint

Pulumi outputs carry the same version under `moduleVersion: 'X.Y.Z'`
inside the `ComponentResource` args. Version numbers are stored in
the frozen `MODULE_VERSIONS` map — they may only be increased (never
decreased) per the "upgrade and grow" rule.

כל בלוק `module` ב-Terraform מופק פעמיים: מקור git עם תג בלתי משתנה
ומפרט `version` תואם מרשם. פלטי Pulumi נושאים את אותה הגרסה בשדה
`moduleVersion`. מספרי גרסאות נשמרים במפה קפואה `MODULE_VERSIONS`
וניתן להעלות אותם בלבד — לעולם לא להוריד — על-פי כלל "שדרוג וגידול".

## 6. Remote State Backend / גיבוי State מרוחק

| Cloud  | Backend block       | Israeli storage                              |
|--------|---------------------|----------------------------------------------|
| AWS    | `backend "s3"`      | `tku-tfstate-aws-il-central-1` + DynamoDB lock |
| Azure  | `backend "azurerm"` | `tku-tfstate-rg` / `tku-tfstatesa` / `tfstate` |
| GCP    | `backend "gcs"`     | `tku-tfstate-gcp-me-west1`                    |

All state buckets live in the Israeli region of the corresponding
cloud, so no Terraform state ever leaves Israeli borders. The AWS
backend also declares a DynamoDB lock table (`tku-tfstate-lock`) to
serialise concurrent `terraform apply` runs.

Pulumi uses self-managed backend hints (`pulumi login s3://…?region=il-central-1`)
in the header comments so operators configure identical storage.

כל דליי ה-state נמצאים באזור הישראלי של הענן התואם, כך ששום מצב
Terraform אינו יוצא מגבולות ישראל. הגיבוי של AWS מצהיר גם על טבלת
נעילה DynamoDB כדי לסריאליזציה של ריצות `terraform apply` מקבילות.

## 7. "Never Delete" Enforcement / אכיפת "לא מוחקים"

| Tool      | Mechanism                                                         |
|-----------|-------------------------------------------------------------------|
| Terraform | `lifecycle { prevent_destroy = true }` on every `module` block    |
| Pulumi    | `{ protect: true }` as the options argument of `ComponentResource`|

Any accidental `terraform destroy` or `pulumi destroy` is refused by
the respective tool. To retire a resource the operator must first
flip the protection flag in a separate commit — a deliberate act, not
a one-keystroke mistake.

כל `terraform destroy` או `pulumi destroy` שנעשו בטעות נדחים על-ידי
הכלי. כדי לשחרר משאב, המפעיל חייב לבטל קודם את דגל ההגנה ב-commit
נפרד — פעולה מכוונת, לא טעות של הקשה אחת.

## 8. Public API / ממשק ציבורי

```js
const { IaCGenerator } = require('./src/devops/iac-generator');

const gen = new IaCGenerator({
  businessNameHe: 'טכנו-קול עוזי בע"מ',
  businessNameEn: 'Techno-Kol Uzi Ltd',
  costCenter: 'CC-ERP-001',
});

const resources = [
  { type: 'vpc',    name: 'erp-net',   cloud: 'aws',   environment: 'prod' },
  { type: 'bucket', name: 'erp-docs',  cloud: 'gcp',   environment: 'prod' },
  { type: 'database', name: 'erp-db', cloud: 'azure', environment: 'prod', size: 'GP_S_Gen5_2' },
];

const hcl = gen.generateTerraform(resources);   // returns HCL string
const ts  = gen.generatePulumiTS(resources);    // returns TS string
const all = gen.generateAll(resources);         // { 'main.tf':..., 'index.ts':... }
```

No method writes to disk; every method returns strings only.

## 9. Test Coverage / כיסוי בדיקות

**34 tests, all passing.** Run with:

```
node --test test/devops/iac-generator.test.js
```

### Test groups

| # | Group                               | Tests |
|---|-------------------------------------|-------|
| 1 | Constants (regions, compliance, types) | 3  |
| 2 | Helpers (sanitize, quote, tags, merge) | 8  |
| 3 | Resource validation                    | 2  |
| 4 | Terraform rendering (9 scenarios)      | 9  |
| 5 | Pulumi TS rendering (8 scenarios)      | 8  |
| 6 | Cross-tool comparisons + defaults      | 4  |

### Key assertions

- `il-central-1`, `israelcentral`, `me-west1` literals appear in both outputs
- Hebrew business name (`טכנו-קול עוזי בע"מ`) preserved as UTF-8 in HCL and TS
- Compliance tag always contains `PCI-DSS`, `ISR-SOC2`, `ISO-27001`
- Module version pinned via `?ref=vX.Y.Z` **and** `version = "X.Y.Z"`
- `prevent_destroy = true` in every HCL module block
- `protect: true` in every Pulumi `ComponentResource`
- Source file does not import `fs.writeFileSync` / `fs.writeFile` / `fs.appendFile`
- Outputs are deterministic (identical inputs produce identical strings)
- Tag keys are consistent between Terraform and Pulumi outputs

## 10. Built-ins Only / מובנים בלבד

The entire module uses only Node.js built-ins:

- `node:assert/strict` + `node:test` — test runner
- `node:fs` + `node:path` — **only inside the "no disk writes" guard test**,
  never by the generator itself

No npm dependencies added. No transitive packages. The generator can
be copied to any Node 18+ environment and run immediately.

המודל כולו משתמש רק במובנים של Node.js. אין תלויות npm. אין חבילות
מועברות. ניתן להעתיק את המחולל לכל סביבת Node 18+ ולהריץ באופן מיידי.

## 11. Rule Compliance / עמידה בכללים

| Rule                          | Status | Evidence                                   |
|-------------------------------|--------|--------------------------------------------|
| Never delete                  | PASS   | `prevent_destroy=true` + `protect:true`    |
| Built-ins only                | PASS   | `package.json` unchanged                   |
| Bilingual (HE + EN)           | PASS   | HCL/TS headers + this report               |
| Output strings only           | PASS   | No disk writes anywhere in source          |
| Compare strings in tests      | PASS   | 34 `assert.equal`/`assert.ok` on strings   |
| 15+ tests                     | PASS   | 34 tests green                             |
| Israeli region support        | PASS   | AWS/Azure/GCP all emit IL slugs            |
| Hebrew UTF-8 business tag     | PASS   | `business-name-he` preserves Hebrew bytes  |
| Compliance tags PCI/SOC2/ISO  | PASS   | All three appear in default compliance CSV |
| Module versioning             | PASS   | Pinned via `?ref=v` + `version =`          |
| Remote state backend          | PASS   | S3 / AzureRM / GCS per cloud               |

---

**Signed-off-by:** Agent Y-174 — Techno-Kol Uzi mega-ERP QA
**Hebrew motto:** לא מוחקים רק משדרגים ומגדלים
