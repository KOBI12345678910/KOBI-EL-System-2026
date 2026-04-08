import { getKimiClient, KimiError } from "./kimi-client";
import { SYSTEM_PROMPTS, buildPrompt, extractJSON } from "./kimi-prompt-engine";
import { globalMonitor } from "./kimi-monitor";

const kimi = getKimiClient();

globalMonitor.onAlert((alert) => {
  console.warn(`[התראת Kimi] ${alert.type}: ${alert.message}`);
});

async function simpleAsk() {
  const answer = await kimi.ask(
    "מה הצעד הבא לטפל בהזמנת לקוח שלא שולמה?",
    SYSTEM_PROMPTS.general
  );
  console.log(answer);
}

async function erpTask() {
  const prompt = buildPrompt({
    task: "נתח את ההזמנות הבאות והחזר JSON",
    context: {
      orders: [
        { id: 1042, customer: "מכון רוז'נסקי", amount_agorot: 1450000, days_open: 30 },
        { id: 1043, customer: "בניה דרומי", amount_agorot: 620000, days_open: 5 },
      ],
    },
    format: '{ "orders": [{ "id", "customer", "amount_agorot", "risk_level", "action" }] }',
  });

  const result = await kimi.runTask({
    systemPrompt: SYSTEM_PROMPTS.json_analyst,
    userMessage: prompt,
    onSuccess: async (json) => {
      const data = extractJSON(json);
      if (data) {
        console.log("ניתוח הזמנות:", data);
      } else {
        console.log("תגובה:", json);
      }
    },
    onError: (err: KimiError) => {
      console.error(`שגיאה: [${err.type}] ${err.message}`);
    },
  });
  return result;
}

async function multiTurnChat() {
  const history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPTS.general },
  ];

  async function turn(userMessage: string): Promise<string> {
    history.push({ role: "user", content: userMessage });
    const response = await kimi.chat({ messages: history });
    history.push({ role: "assistant", content: response });
    return response;
  }

  console.log(await turn("מה המצב הכספי הכללי של החברה?"));
  console.log(await turn("אילו לקוחות הם הסיכון הגבוה ביותר?"));
  console.log(await turn("מה הצעד הבא שאני צריך לעשות?"));
}

async function startup() {
  console.log("בודק חיבור ל-Kimi...");
  const health = await kimi.healthCheck();

  if (!health.ok) {
    console.error(`Kimi לא זמין: ${health.error}`);
    console.error("בדוק KIMI_API_KEY ב-Secrets");
    process.exit(1);
  }

  console.log(`Kimi פעיל — השהיה: ${health.latencyMs}ms`);
}

async function automationEngine() {
  const tasks = [
    {
      name: "daily-report",
      systemPrompt: SYSTEM_PROMPTS.json_analyst,
      userMessage: buildPrompt({
        task: "צור דוח יומי תמציתי על פעילות המערכת",
        format: "JSON עם שדות: summary, alerts, next_actions",
      }),
    },
    {
      name: "inventory-check",
      systemPrompt: SYSTEM_PROMPTS.json_analyst,
      userMessage: buildPrompt({
        task: "בדוק אם יש פריטים קריטיים שצריך להזמין",
        format: "JSON עם שדות: items_to_order, urgency",
      }),
    },
  ];

  for (const task of tasks) {
    console.log(`מריץ: ${task.name}`);
    const start = Date.now();
    const result = await kimi.runTask({
      ...task,
      onSuccess: async (r) => {
        globalMonitor.record({
          id: task.name,
          ts: Date.now(),
          durationMs: Date.now() - start,
          ok: true,
          tokens: undefined,
          model: "kimi-k2.5",
        });
        console.log(`${task.name}:`, r.substring(0, 200));
      },
      onError: (e) => {
        globalMonitor.record({
          id: task.name,
          ts: Date.now(),
          durationMs: Date.now() - start,
          ok: false,
          errorType: e.type,
          model: "kimi-k2.5",
        });
        console.error(`${task.name}: [${e.type}] ${e.message}`);
      },
    });
    if (!result) console.warn(`${task.name} לא הצליח`);
  }
}

export { simpleAsk, erpTask, multiTurnChat, startup, automationEngine };
