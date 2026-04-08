import { Router, type IRouter } from "express";
import { ERP_SYSTEM_KNOWLEDGE } from "../../lib/kimi-system-knowledge";
import { writeAuditLog } from "../../lib/ai-audit";

const router: IRouter = Router();

const SYSTEM_ENHANCEMENT = `אתה Kimi 2, עוזר AI מתקדם של מערכת ERP "טכנו-כל עוזי" — מפעל לייצור מסגרות מתכת, ברזל, אלומיניום, נירוסטה וזכוכית.
אתה מדבר עברית שוטפת ומקצועית. אתה מכיר את כל תחומי ה-ERP: מכירות, כספים, רכש, מלאי, ייצור, משאבי אנוש, CRM, לוגיסטיקה, שיווק, ניהול פרויקטים.
ענה בצורה ברורה, מפורטת ומקצועית. תן דוגמאות קונקרטיות כשרלוונטי. אל תחמיץ פרטים חשובים.
כשמבקשים ממך לבצע חישוב — בצע אותו במדויק. מע"מ בישראל הוא 17%.
כשמדובר בנתונים — תן מבנה ברור עם טבלאות או רשימות.`;

function getApiKey(): string {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
}
function getBaseUrl(): string {
  return process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
}

router.post("/kimi/chat", async (req, res) => {
  const { messages, model = "kimi-k2.5" } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages is required and must be a non-empty array" });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "מפתח KIMI_API_KEY לא הוגדר" });
    return;
  }

  const enhancedMessages = [
    { role: "system", content: ERP_SYSTEM_KNOWLEDGE },
    { role: "system", content: SYSTEM_ENHANCEMENT },
    ...messages,
  ];

  const isK2Model = model.startsWith("kimi-k2");
  const startTime = Date.now();

  try {
    const response = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: enhancedMessages,
        temperature: isK2Model ? 1 : 0.4,
        max_tokens: 16384,
        stream: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const text = await response.text();
      const status = response.status;
      console.error(`[Kimi/chat] API error ${status}: ${text.slice(0, 300)}`);
      const isTimeout = status === 408 || status === 504;
      if (isTimeout) {
        res.status(504).json({ error: "קימי לא הגיב בזמן — נסה שוב מאוחר יותר", timeout: true });
      } else {
        res.status(502).json({ error: `שגיאת AI (${status})` });
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: "No response body" });
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let finishReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) fullContent += delta;
          if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
        } catch {}
      }
    }

    const responseTimeMs = Date.now() - startTime;
    console.log(`[Kimi/chat] Completed in ${responseTimeMs}ms, ${fullContent.length} chars`);

    const lastUserMsg = messages.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";
    writeAuditLog({
      provider: "kimi",
      model,
      taskType: "hebrew",
      inputSummary: lastUserMsg,
      outputSummary: fullContent,
      latencyMs: responseTimeMs,
      statusCode: 200,
      userId: (req as any).user?.id?.toString(),
    }).catch(() => {});

    res.json({
      content: fullContent,
      model,
      finishReason: finishReason || "stop",
      usage: { responseTimeMs },
    });
    return;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const lastUserMsg = messages?.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";
    writeAuditLog({
      provider: "kimi",
      model,
      taskType: "hebrew",
      inputSummary: lastUserMsg,
      latencyMs,
      statusCode: 502,
      errorMessage: error?.message || "Unknown error",
    }).catch(() => {});

    if (!res.headersSent) {
      const isTimeout =
        error?.name === "TimeoutError" ||
        error?.code === "UND_ERR_CONNECT_TIMEOUT" ||
        /timeout|abort/i.test(error?.message || "");
      if (isTimeout) {
        res.status(504).json({ error: "קימי לא הגיב בזמן — נסה שוב מאוחר יותר", timeout: true });
      } else {
        res.status(502).json({ error: error?.message || "שגיאה בתקשורת עם AI" });
      }
    }
  }
});

export default router;
