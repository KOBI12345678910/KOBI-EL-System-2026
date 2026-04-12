# AG-Y171 — Service Mesh Configuration Generator

**Stack:** Mega-ERP Techno-Kol Uzi
**Rule:** לא מוחקים רק משדרגים ומגדלים *(we only upgrade and grow, never delete)*
**Date:** 2026-04-11
**Status:** PASS — 22/22 tests green
**Owner:** Platform / DevOps
**Module:** `onyx-procurement/src/devops/service-mesh.js`
**Tests:** `onyx-procurement/test/devops/service-mesh.test.js`

---

## 1. Scope / היקף

Zero-dependency (node built-ins only) JavaScript module that emits service-
mesh configuration manifests for Istio + Envoy as YAML **strings**. The
generator is pure — it never touches the filesystem, never mutates its
input, and is safe to run at test-time. Callers decide what to do with the
emitted strings.

מודול ללא תלויות (רק מודולים מובנים של node) שמפיק קבצי תצורה עבור
Istio + Envoy כמחרוזות YAML. המחולל טהור — אין גישה למערכת קבצים, אין
שינוי קלט, בטוח להרצה בבדיקות. הקורא מחליט מה לעשות עם הפלט.

### 1.1 Covered capabilities / יכולות מכוסות

| # | Capability                    | EN                                | HE                             |
|---|-------------------------------|-----------------------------------|--------------------------------|
| 1 | VirtualService                | HTTP routing                      | ניתוב HTTP                    |
| 2 | DestinationRule               | Subsets + traffic policy          | תתי־קבוצות + מדיניות תעבורה   |
| 3 | Retry policy                  | attempts / perTryTimeout / retryOn| ניסיון חוזר                   |
| 4 | Circuit breaker               | Outlier detection + conn limits   | מפסק זרם                      |
| 5 | Per-route timeout             | `timeoutMs` → Istio duration      | זמן קצוב לכל מסלול            |
| 6 | mTLS                          | STRICT / PERMISSIVE / DISABLE     | אימות הדדי                    |
| 7 | Traffic splitting (canary %)  | Weighted subsets, must sum to 100 | פיצול תעבורה — קנרית          |
| 8 | Header-based routing          | Match on HTTP headers             | ניתוב לפי כותרות              |
| 9 | Fault injection (chaos)       | `fault.delay` + `fault.abort`     | הזרקת תקלות לבדיקות כאוס     |
| 10| EnvoyFilter                   | workloadSelector + configPatches  | טלאי Envoy                    |

## 2. Public API / ממשק ציבורי

```js
const { ServiceMesh, getDefaultConfig, yamlEmit } = require(
  './src/devops/service-mesh'
);

const mesh = new ServiceMesh({ service: 'onyx-procurement' });

// Individual manifests
const vsYaml  = mesh.generateVirtualService(routes);
const drYaml  = mesh.generateDestinationRule(subsets);
const paYaml  = mesh.generatePeerAuthentication({ mode: 'STRICT' });
const efYaml  = mesh.generateEnvoyFilter(filters);

// Bundle
const bundle = mesh.generateAll(); // { "<svc>-virtualservice.yaml": "...", ... }
```

## 3. Test Matrix / מטריצת בדיקות

Run: `node --test onyx-procurement/test/devops/service-mesh.test.js`

| #  | Suite                | Name                                                       | Status |
|----|----------------------|------------------------------------------------------------|--------|
| 01 | primitives           | `yamlEmit`: scalar map                                     | PASS   |
| 02 | primitives           | `yamlEmit`: nested list of maps                            | PASS   |
| 03 | primitives           | `msToDuration`: common values                              | PASS   |
| 04 | primitives           | `mergeDefaults`: deep merge preserves existing keys        | PASS   |
| 05 | primitives           | `assertWeightsSumTo100`: passes for 90/10                  | PASS   |
| 06 | primitives           | `assertWeightsSumTo100`: throws for 95/10                  | PASS   |
| 07 | VirtualService       | default VS contains host and kind                          | PASS   |
| 08 | VirtualService       | traffic splitting 80/20 canary renders both weights        | PASS   |
| 09 | VirtualService       | header-based routing: `x-release` header match             | PASS   |
| 10 | VirtualService       | retry policy renders attempts + perTryTimeout + retryOn    | PASS   |
| 11 | VirtualService       | per-route timeout renders as seconds                       | PASS   |
| 12 | VirtualService       | fault injection: delay + abort for chaos testing           | PASS   |
| 13 | VirtualService       | invalid weight total throws                                | PASS   |
| 14 | VirtualService       | invalid fault abort status throws                          | PASS   |
| 15 | DestinationRule      | default DR contains circuit breaker fields                 | PASS   |
| 16 | DestinationRule      | connection pool limits are present                         | PASS   |
| 17 | DestinationRule      | custom subsets override defaults without deleting them     | PASS   |
| 18 | mTLS + EF + bundle   | PeerAuthentication STRICT is emitted                       | PASS   |
| 19 | mTLS + EF + bundle   | PeerAuthentication invalid mode throws                     | PASS   |
| 20 | mTLS + EF + bundle   | EnvoyFilter renders workloadSelector and configPatches     | PASS   |
| 21 | mTLS + EF + bundle   | `generateAll` returns a bundle keyed by filename           | PASS   |
| 22 | mTLS + EF + bundle   | `getDefaultConfig` is a fresh object each call             | PASS   |

**Totals:** 22 tests, 4 suites, 0 failures, 0 skipped. Duration ≈ 150 ms.

## 4. Sample Output / דוגמאות פלט

### 4.1 VirtualService — canary 80/20 + header route + retry + timeout + fault

```yaml
# ═══════════════════════════════════════════════════════════════════
# VirtualService — HTTP routing / ניתוב HTTP
# service: onyx-procurement  ·  namespace: technokol
# Techno-Kol Uzi · לא מוחקים רק משדרגים ומגדלים
# ═══════════════════════════════════════════════════════════════════
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: onyx-procurement-vs
  namespace: technokol
  labels:
    app: onyx-procurement
    managed-by: technokol-mesh-generator
spec:
  hosts:
    - onyx-procurement.technokol.svc.cluster.local
  http:
    - name: canary-80-20
      match:
        - uri:
            prefix: /api
        - headers:
            x-release:
              exact: canary
      route:
        - destination:
            host: onyx-procurement.technokol.svc.cluster.local
            subset: stable
          weight: 80
        - destination:
            host: onyx-procurement.technokol.svc.cluster.local
            subset: canary
          weight: 20
      fault:
        delay:
          percentage:
            value: 10
          fixedDelay: 1.500s
        abort:
          percentage:
            value: 5
          httpStatus: 503
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: gateway-error,connect-failure,refused-stream
      timeout: 5s
```

### 4.2 DestinationRule — circuit breaker + mTLS + subsets

```yaml
# ═══════════════════════════════════════════════════════════════════
# DestinationRule — Circuit breaker + subsets / מאגר חיבורים ותתי־קבוצות
# service: onyx-procurement  ·  namespace: technokol
# Techno-Kol Uzi · לא מוחקים רק משדרגים ומגדלים
# ═══════════════════════════════════════════════════════════════════
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: onyx-procurement-dr
  namespace: technokol
  labels:
    app: onyx-procurement
    managed-by: technokol-mesh-generator
spec:
  host: onyx-procurement.technokol.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 1024
      http:
        http1MaxPendingRequests: 1024
        http2MaxRequests: 1024
        maxRequestsPerConnection: 0
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    tls:
      mode: ISTIO_MUTUAL
  subsets:
    - name: stable
      labels:
        version: stable
    - name: canary
      labels:
        version: canary
```

### 4.3 PeerAuthentication — mTLS STRICT

```yaml
# ═══════════════════════════════════════════════════════════════════
# PeerAuthentication — Mutual TLS / אימות הדדי
# service: onyx-procurement  ·  namespace: technokol
# Techno-Kol Uzi · לא מוחקים רק משדרגים ומגדלים
# ═══════════════════════════════════════════════════════════════════
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: onyx-procurement-mtls
  namespace: technokol
  labels:
    app: onyx-procurement
    managed-by: technokol-mesh-generator
spec:
  selector:
    matchLabels:
      app: onyx-procurement
  mtls:
    mode: STRICT
```

## 5. Invariants / עקרונות

1. **Zero external deps / ללא תלויות חיצוניות** — only `node:test` and
   `node:assert/strict` from built-ins are imported; runtime module uses
   no `require()` calls at all.
2. **Pure / טהור** — no `fs`, no `process.env`, no `Date.now()`. Output is
   deterministic given the same input.
3. **Never delete / לא מוחקים** — `mergeDefaults` augments but never drops
   user keys; subset and route arrays are additive by default.
4. **Explicit failures / כשלים מפורשים** — bad canary weights, invalid HTTP
   status codes, and unknown mTLS modes throw at the boundary, not later.
5. **Bilingual / דו־לשוני** — every emitted manifest begins with a Hebrew +
   English banner. Source comments are bilingual where the semantics differ.
6. **Strings only / מחרוזות בלבד** — generator returns strings; the caller
   owns disk I/O. Tests compare strings.

## 6. Known Gaps / פערים ידועים

- `generateEnvoyFilter` accepts arbitrary `patch.value` objects without
  schema validation. Callers must supply valid Envoy filter configurations.
  This is intentional — the generator is a YAML shaper, not an Envoy
  type-checker. Future upgrade (never delete!) can add schema validation
  behind a flag.
- `yamlEmit` supports the subset used by Istio/K8s manifests. It is not a
  full YAML 1.2 implementation — but this is the same subset used by the
  existing `onyx-procurement/src/deploy/manifest-generator.js` and has been
  validated against Kubernetes and Istio for months.

## 7. Sign-off / אישור

- Code:    `onyx-procurement/src/devops/service-mesh.js` (≈ 510 lines)
- Tests:   `onyx-procurement/test/devops/service-mesh.test.js` (22 tests)
- Report:  `_qa-reports/AG-Y171-service-mesh.md`
- Status:  **PASS** — green on `node --test`.
