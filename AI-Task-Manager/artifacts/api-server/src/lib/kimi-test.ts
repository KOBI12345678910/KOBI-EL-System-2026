/**
 * Kimi Client Test Suite
 *
 * ai-provider isolation strategy:
 *   - `resolveModel` is a deterministic pure function (passthrough for valid models)
 *     that requires no mocking — tests use "kimi-k2.5" which is always valid.
 *   - `getPrimaryProvider` reads KIMI_API_KEY from env; we unset it before all
 *     tests so `getPrimaryProvider()` returns null, ensuring `getKimiClient()`
 *     falls back only to the explicit config values we pass in (or the singleton
 *     test sets KIMI_API_KEY briefly and resets it).
 *   - native `fetch` is mocked via `globalThis.fetch` (no node-fetch).
 */

import { strict as assert } from "node:assert";
import { KimiClient, resetKimiClient, getKimiClient } from "./kimi-client.js";

// Ensure ai-provider returns null so tests are hermetic (no accidental env leak)
delete process.env.KIMI_API_KEY;
delete process.env.MOONSHOT_API_KEY;

// ── Minimal test runner ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${name}`);
    console.error(`      ${msg}`);
    failed++;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type FetchFn = typeof globalThis.fetch;

function buildOkResponse(content: string): Response {
  const body = JSON.stringify({
    id: "test-id",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

function buildErrorResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

function mockFetch(fn: FetchFn) {
  globalThis.fetch = fn;
}

function restoreFetch(original: FetchFn) {
  globalThis.fetch = original;
}

const TEST_API_KEY = "test-api-key-12345";

function makeClient(overrides: Record<string, unknown> = {}): KimiClient {
  return new KimiClient({
    apiKey: TEST_API_KEY,
    model: "kimi-k2.5",
    timeoutMs: 5_000,
    maxRetries: 3,
    retryDelayMs: 1,
    ...overrides,
  });
}

const originalFetch = globalThis.fetch;

// ── Unit Tests ─────────────────────────────────────────────────────────────────

console.log("\nKimi Client — Unit Tests\n");

// 1. No API key
await test("no API key throws during construction", async () => {
  assert.throws(
    () => new KimiClient({ apiKey: "" }),
    /apiKey/
  );
});

// 2. Success 200
await test("success 200 returns trimmed content", async () => {
  mockFetch(async () => buildOkResponse("  Hello world  "));
  const client = makeClient();
  const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result, "Hello world");
  restoreFetch(originalFetch);
});

// 3. Auth error (no retry)
await test("auth error (401) throws immediately without retry", async () => {
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    return buildErrorResponse(401, "Unauthorized");
  });
  const client = makeClient();
  try {
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    assert.fail("Expected throw");
  } catch (e: unknown) {
    const err = e as { type: string };
    assert.equal(err.type, "auth");
    assert.equal(callCount, 1, "Should not retry auth errors");
  }
  restoreFetch(originalFetch);
});

// 4. Quota error (no retry)
await test("quota error (402) throws immediately without retry", async () => {
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    return buildErrorResponse(402, "quota exceeded");
  });
  const client = makeClient();
  try {
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    assert.fail("Expected throw");
  } catch (e: unknown) {
    const err = e as { type: string };
    assert.equal(err.type, "quota");
    assert.equal(callCount, 1, "Should not retry quota errors");
  }
  restoreFetch(originalFetch);
});

// 5. Rate limit (retry + succeed)
await test("rate limit (429) retries and eventually succeeds", async () => {
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    if (callCount < 3) return buildErrorResponse(429, "rate limited");
    return buildOkResponse("finally succeeded");
  });
  const client = makeClient({ retryDelayMs: 1 });
  const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result, "finally succeeded");
  assert.ok(callCount >= 3, `Expected at least 3 calls, got ${callCount}`);
  restoreFetch(originalFetch);
});

// 6. Server 500 (retry + recover)
await test("server 500 retries and recovers", async () => {
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    if (callCount < 2) return buildErrorResponse(500, "Internal Server Error");
    return buildOkResponse("recovered");
  });
  const client = makeClient({ retryDelayMs: 1 });
  const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result, "recovered");
  assert.ok(callCount >= 2);
  restoreFetch(originalFetch);
});

// 7. Timeout (retry + throw)
await test("timeout retries exhausted and throws timeout error", async () => {
  mockFetch(async () => {
    await new Promise((r) => setTimeout(r, 10_000));
    return buildOkResponse("never");
  });
  const client = makeClient({ timeoutMs: 10, maxRetries: 2, retryDelayMs: 1 });
  try {
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    assert.fail("Expected throw");
  } catch (e: unknown) {
    const err = e as { type: string };
    assert.equal(err.type, "timeout");
  }
  restoreFetch(originalFetch);
});

// 8. Empty response (retry + throw)
await test("empty response retries and throws empty error", async () => {
  const body = JSON.stringify({
    id: "test",
    choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
  });
  mockFetch(async () => new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
  const client = makeClient({ retryDelayMs: 1 });
  try {
    await client.chat({ messages: [{ role: "user", content: "hi" }] });
    assert.fail("Expected throw");
  } catch (e: unknown) {
    const err = e as { type: string };
    assert.equal(err.type, "empty");
  }
  restoreFetch(originalFetch);
});

// 9. Network error (retry + recover)
await test("network error retries and recovers on second attempt", async () => {
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    if (callCount < 2) throw new Error("Network failure");
    return buildOkResponse("network recovered");
  });
  const client = makeClient({ retryDelayMs: 1 });
  const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(result, "network recovered");
  assert.ok(callCount >= 2);
  restoreFetch(originalFetch);
});

// 10. runTask onError
await test("runTask calls onError and returns null on failure", async () => {
  mockFetch(async () => buildErrorResponse(401, "Unauthorized"));
  const client = makeClient();
  let errorCalled = false;
  const result = await client.runTask({
    systemPrompt: "You are helpful.",
    userMessage: "hello",
    onError: (err) => {
      errorCalled = true;
      assert.equal(err.type, "auth");
    },
  });
  assert.equal(result, null);
  assert.ok(errorCalled, "onError should have been called");
  restoreFetch(originalFetch);
});

// 11. runTask onSuccess
await test("runTask calls onSuccess and returns result", async () => {
  mockFetch(async () => buildOkResponse("task done"));
  const client = makeClient();
  let successResult = "";
  const result = await client.runTask({
    systemPrompt: "You are helpful.",
    userMessage: "hello",
    onSuccess: async (r) => {
      successResult = r;
    },
  });
  assert.equal(result, "task done");
  assert.equal(successResult, "task done");
  restoreFetch(originalFetch);
});

// 12. Singleton behavior
await test("getKimiClient returns same instance on repeated calls", async () => {
  resetKimiClient();
  // Temporarily set env so getKimiClient can construct without throwing
  process.env.KIMI_API_KEY = TEST_API_KEY;
  const a = getKimiClient();
  const b = getKimiClient();
  assert.strictEqual(a, b, "Should return the same instance");
  // Clean up: remove env and reset singleton for subsequent tests
  delete process.env.KIMI_API_KEY;
  resetKimiClient();
});

// 13. Correct auth header
await test("sends correct Authorization header with Bearer token", async () => {
  let capturedHeaders: Record<string, string> = {};
  mockFetch(async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    capturedHeaders = headers ?? {};
    return buildOkResponse("ok");
  });
  const client = makeClient({ apiKey: "my-secret-key" });
  await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(capturedHeaders["Authorization"], "Bearer my-secret-key");
  restoreFetch(originalFetch);
});

// 14. healthCheck success
await test("healthCheck returns ok=true on successful response", async () => {
  mockFetch(async () => buildOkResponse("OK"));
  const client = makeClient();
  const result = await client.healthCheck();
  assert.equal(result.ok, true);
  assert.ok(typeof result.latencyMs === "number");
  restoreFetch(originalFetch);
});

// 15. healthCheck failure
await test("healthCheck returns ok=false on API error", async () => {
  mockFetch(async () => buildErrorResponse(401, "Unauthorized"));
  const client = makeClient();
  const result = await client.healthCheck();
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === "string");
  restoreFetch(originalFetch);
});

// ── Integration Tests ─────────────────────────────────────────────────────────

const KIMI_API_KEY = process.env.KIMI_API_KEY;
if (KIMI_API_KEY) {
  console.log("\nKimi Client — Integration Tests (KIMI_API_KEY detected)\n");
  resetKimiClient();

  await test("integration: healthCheck against live API", async () => {
    const client = new KimiClient({ apiKey: KIMI_API_KEY, model: "kimi-k2.5", timeoutMs: 30_000 });
    const result = await client.healthCheck();
    console.log(`      latency: ${result.latencyMs}ms`);
    assert.equal(result.ok, true, `healthCheck failed: ${result.error}`);
  });

  await test("integration: ask simple question", async () => {
    const client = new KimiClient({ apiKey: KIMI_API_KEY, model: "kimi-k2.5", timeoutMs: 30_000 });
    const result = await client.ask("Reply with exactly: integration-test-ok");
    assert.ok(result.length > 0, "Should have non-empty response");
  });
} else {
  console.log("\n  (Skipping integration tests — KIMI_API_KEY not set)\n");
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
