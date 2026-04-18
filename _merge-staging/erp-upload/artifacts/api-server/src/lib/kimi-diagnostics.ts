import { getPrimaryProvider } from "./ai-provider";

interface DiagResult {
  check: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export async function runDiagnostics(): Promise<DiagResult[]> {
  const results: DiagResult[] = [];

  const provider = getPrimaryProvider();
  const apiKey = provider?.apiKey || process.env.KIMI_API_KEY || "";

  if (!apiKey) {
    results.push({
      check: "KIMI_API_KEY",
      status: "fail",
      detail: "לא הוגדר. יש להגדיר ב-Secrets",
    });
    return results;
  }

  results.push({
    check: "KIMI_API_KEY",
    status: "ok",
    detail: `מוגדר (${apiKey.slice(0, 5)}...${apiKey.slice(-4)})`,
  });

  if (!apiKey.startsWith("sk-")) {
    results.push({
      check: "פורמט מפתח",
      status: "warn",
      detail: "המפתח לא מתחיל ב-sk- — ייתכן שלא תקין",
    });
  } else {
    results.push({
      check: "פורמט מפתח",
      status: "ok",
      detail: "מתחיל ב-sk-",
    });
  }

  const baseUrl = provider?.baseUrl || process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";

  if (baseUrl.includes("moonshot.cn")) {
    results.push({
      check: "URL בסיס",
      status: "fail",
      detail: `${baseUrl} — צריך להיות moonshot.ai לא moonshot.cn`,
    });
  } else {
    results.push({
      check: "URL בסיס",
      status: "ok",
      detail: baseUrl,
    });
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const models = data?.data?.map((m: any) => m.id) || [];
      results.push({
        check: "חיבור API",
        status: "ok",
        detail: `${models.length} מודלים זמינים`,
      });

      const hasK2 = models.some((m: string) => m.startsWith("kimi-k2"));
      results.push({
        check: "מודלי kimi-k2",
        status: hasK2 ? "ok" : "warn",
        detail: hasK2
          ? models.filter((m: string) => m.startsWith("kimi-k2")).join(", ")
          : "לא נמצאו מודלי kimi-k2",
      });
    } else if (res.status === 401) {
      results.push({
        check: "חיבור API",
        status: "fail",
        detail: "אימות נכשל (401) — מפתח לא תקין",
      });
    } else if (res.status === 429) {
      results.push({
        check: "חיבור API",
        status: "warn",
        detail: "חריגה ממגבלת קצב (429) — יש להמתין",
      });
    } else {
      results.push({
        check: "חיבור API",
        status: "fail",
        detail: `סטטוס ${res.status}`,
      });
    }
  } catch (e) {
    results.push({
      check: "חיבור API",
      status: "fail",
      detail: `שגיאת רשת: ${(e as Error).message}`,
    });
  }

  try {
    const chatRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "kimi-k2.5",
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 5,
        temperature: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (chatRes.ok) {
      const data = (await chatRes.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      results.push({
        check: "שיחת בדיקה (kimi-k2.5)",
        status: content ? "ok" : "warn",
        detail: content ? `תשובה: "${content.slice(0, 50)}"` : "תשובה ריקה",
      });
      if (data?.usage) {
        results.push({
          check: "טוקנים",
          status: "ok",
          detail: `קלט: ${data.usage.prompt_tokens}, פלט: ${data.usage.completion_tokens}`,
        });
      }
    } else {
      const text = await chatRes.text().catch(() => "");
      results.push({
        check: "שיחת בדיקה (kimi-k2.5)",
        status: "fail",
        detail: `סטטוס ${chatRes.status}: ${text.slice(0, 100)}`,
      });
    }
  } catch (e) {
    results.push({
      check: "שיחת בדיקה (kimi-k2.5)",
      status: "fail",
      detail: `${(e as Error).message}`,
    });
  }

  return results;
}

export function formatDiagnostics(results: DiagResult[]): string {
  const icons = { ok: "[OK]", warn: "[!!]", fail: "[XX]" };
  const lines = results.map(
    (r) => `${icons[r.status]} ${r.check}: ${r.detail}`
  );
  return `\n--- Kimi Diagnostics ---\n${lines.join("\n")}\n------------------------\n`;
}
