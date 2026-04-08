# Security Hardening — Smoke Test Checklist
## Task #161: Rate Limits & Input Sanitization

---

## 1. AI Route Rate Limiting (20 req/min per IP in production)

**Expected behavior:** Return HTTP 429 after exceeding 20 requests per minute per IP.

**Test:**
```bash
TOKEN="<bearer-token>"
HOST="https://<host>"
for i in $(seq 1 21); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -X POST "$HOST/api/claude/chat" \
    -d '{"message":"ping"}')
  echo "Request $i: $STATUS"
done
# Expected: requests 1-20 return 200/400, request 21 returns 429
```

**Covered endpoints:**
- `/api/claude/*`
- `/api/kimi/*`
- `/api/ai-providers`, `/api/ai-models`, `/api/ai-api-keys`
- `/api/ai-usage-logs`, `/api/ai-queries`, `/api/ai-responses`
- `/api/ai-recommendations`, `/api/ai-permissions`, `/api/ai-prompt-templates`
- `/api/ai-documents`

---

## 2. File Upload Rate Limiting (10 req/min per IP in production)

**Expected behavior:** Return HTTP 429 after exceeding 10 requests per minute per IP.

**Test:**
```bash
TOKEN="<bearer-token>"
HOST="https://<host>"
for i in $(seq 1 11); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@/tmp/test.pdf" \
    "$HOST/api/document-files/upload")
  echo "Upload $i: $STATUS"
done
# Expected: uploads 1-10 return 200/400, upload 11 returns 429
```

**Covered endpoints (exact path regex match):**
- `/api/document-files/upload`
- `/api/platform/entities/:entityId/records/import`
- `/api/platform/entities/:entityId/records/import/preview`
- `/api/products/:id/image`
- `/api/chat/upload`

---

## 3. Input Sanitization — Null Bytes Removed

**Test:**
```bash
curl -s -X POST "$HOST/api/suppliers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"evil\u0000name"}'
# Verify in server logs: req.body.name = "evilname" (null byte stripped, string trimmed)
```

---

## 4. Input Sanitization — Script Tags Stripped from Plain Text Fields

**Test:**
```bash
curl -s -X POST "$HOST/api/suppliers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"<script>alert(1)</script>legit"}'
# Verify: req.body.name = "legit"
```

---

## 5. Input Sanitization — javascript: URIs Neutralized

**Test:**
```bash
curl -s -X POST "$HOST/api/some-endpoint" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"javascript:alert(1)"}'
# Verify: req.body.url = "javascript_:alert(1)"
```

---

## 6. Input Sanitization — SQL Injection Patterns Blocked

**Test (SQL comment injection):**
```bash
curl -s -X POST "$HOST/api/suppliers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"legit -- DROP TABLE users"}'
# Verify: req.body.name = "legit " (SQL comment stripped)
```

**Test (SQL keyword injection):**
```bash
curl -s -X POST "$HOST/api/some-endpoint" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"1 UNION SELECT * FROM users"}'
# Verify: req.body.query = "1 [blocked] * FROM users"
```

---

## 7. Input Sanitization — HTML Fields Use sanitize-html Allowlist

**Test:**
```bash
curl -s -X POST "$HOST/api/some-endpoint" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"<b>Hello</b><script>evil()</script>"}'
# Verify: req.body.content = "<b>Hello</b>" (script stripped, bold tag preserved)
```

---

## 8. Input Sanitization — JSON Data Fields Only Null-Byte Cleaned (including descendants)

**Test:**
```bash
curl -s -X POST "$HOST/api/some-endpoint" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"data":{"nested":{"key":"value with <angle> brackets -- and SQL"}}}'
# Verify: req.body.data.nested.key = "value with <angle> brackets -- and SQL"
# (Not stripped — all descendants of JSON data fields are null-byte-cleaned only)
```

---

## 9. Input Sanitization — Strings Trimmed

**Test:**
```bash
curl -s -X POST "$HOST/api/suppliers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"  hello world  "}'
# Verify: req.body.name = "hello world" (whitespace trimmed)
```

---

## 10. Route Param Sanitization (via defineProperty interceptor)

Route params are sanitized via an `Object.defineProperty` setter trap on `req.params`, set up in `sanitizeMiddleware`. When Express assigns `req.params` after route matching, the setter is invoked and all param values are sanitized (null bytes, script tags, javascript: URIs, SQL patterns).

**Test:**
```bash
curl -s -X GET "$HOST/api/suppliers/1%00evil" \
  -H "Authorization: Bearer $TOKEN"
# Verify: req.params.id = "1evil" (null byte stripped), or 404/400 response
```

---

## 11. Lazy Loading — LoginPage

**Test:**
1. Open the ERP app in a browser (unauthenticated)
2. Open DevTools > Network > Filter by "login"
3. Verify the login page chunk is loaded on-demand, NOT bundled in the main chunk
4. The `LoginPage` component is wrapped in `<Suspense fallback={<PageLoader />}>`
