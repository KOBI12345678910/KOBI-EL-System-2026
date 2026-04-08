import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { validateSession } from "../../lib/auth";
import { pool } from "@workspace/db";
import {
  getAgentStatus,
  runAutonomousTask,
  handleSchedulerTool,
  handleTriggerTool,
  TOOL_CATEGORIES,
  TOTAL_TOOLS,
  getToolsList,
  DEFAULT_CONFIG,
  importData,
  streamDataAcrossModules,
} from "../../lib/super-ai-agent";
import { executeTool } from "../kobi/tools";
import { getProjectMemory, getRecentMessages, saveMessage, autoExtractMemory, getSessionContext } from "../kobi/memory";
import { KOBI_SYSTEM_PROMPT, KOBI_TOOLS_SCHEMA } from "../kobi/system-prompt";

const router: IRouter = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  const result = await validateSession(token);
  if (result.error || !result.user) {
    res.status(401).json({ error: "הסשן פג תוקף" });
    return;
  }
  (req as any).user = result.user;
  req.userId = String((result.user as any).id || "");
  next();
}

router.use("/super-agent", requireAuth as any);

router.get("/super-agent/capabilities", (_req, res) => {
  const categories = Object.entries(TOOL_CATEGORIES).map(([key, cat]) => ({
    key,
    label: cat.label,
    description: cat.description,
    tools: cat.tools.map(toolName => {
      const schema = KOBI_TOOLS_SCHEMA.find((s: any) => s.name === toolName);
      return {
        name: toolName,
        description: schema?.description || "",
        parameters: schema?.input_schema?.properties
          ? Object.entries(schema.input_schema.properties).map(([pName, pDef]: [string, any]) => ({
              name: pName,
              type: pDef.type || "string",
              description: pDef.description || "",
              required: schema.input_schema.required?.includes(pName) || false,
            }))
          : [],
      };
    }),
  }));

  res.json({
    agent: "קובי-AI — מנהל מערכת ERP טכנו-כל-עוזי",
    version: "2.0",
    model: DEFAULT_CONFIG.model,
    total_tools: TOTAL_TOOLS,
    max_tool_loops: DEFAULT_CONFIG.maxToolLoops,
    max_tokens: DEFAULT_CONFIG.maxTokens,
    timeout_ms: DEFAULT_CONFIG.timeoutMs,
    categories,
    endpoints: [
      { method: "GET", path: "/api/super-agent/capabilities", description: "כל היכולות, כלים ופרמטרים" },
      { method: "GET", path: "/api/super-agent/status", description: "סטטוס הסוכן, DB, אוטומציות" },
      { method: "GET", path: "/api/super-agent/tools", description: "רשימת כלים לפי קטגוריות" },
      { method: "POST", path: "/api/super-agent/execute", description: "הרצת כלי בודד" },
      { method: "POST", path: "/api/super-agent/autonomous", description: "משימה אוטונומית מלאה" },
      { method: "POST", path: "/api/super-agent/chat/stream", description: "צ'אט SSE streaming" },
      { method: "GET", path: "/api/super-agent/sessions", description: "רשימת סשנים" },
      { method: "GET", path: "/api/super-agent/sessions/:id/messages", description: "הודעות בסשן" },
      { method: "POST", path: "/api/super-agent/sessions/:id/pin", description: "הצמדת סשן" },
      { method: "DELETE", path: "/api/super-agent/sessions/:id", description: "מחיקת סשן" },
      { method: "GET", path: "/api/super-agent/history", description: "היסטוריה מלאה" },
      { method: "POST", path: "/api/super-agent/scheduler", description: "ניהול משימות מתוזמנות" },
      { method: "POST", path: "/api/super-agent/triggers", description: "ניהול טריגרים" },
      { method: "POST", path: "/api/super-agent/import", description: "יבוא נתונים" },
      { method: "POST", path: "/api/super-agent/cross-module", description: "העברת נתונים בין מודולים" },
      { method: "GET", path: "/api/super-agent/memory", description: "זיכרון הסוכן" },
      { method: "DELETE", path: "/api/super-agent/memory/:id", description: "מחיקת זיכרון" },
    ],
  });
});

router.get("/super-agent/status", async (_req, res) => {
  try {
    const status = await getAgentStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/super-agent/system-status", async (_req, res) => {
  try {
    const results: Record<string, any> = {};

    const dbCheck = await pool.query("SELECT 1 AS ok");
    results.database = { status: dbCheck.rows.length > 0 ? "connected" : "disconnected" };

    const tableCount = await pool.query(
      "SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
    );
    results.database.tables = tableCount.rows[0]?.cnt || 0;

    const dbSize = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS size");
    results.database.size = dbSize.rows[0]?.size || "unknown";

    const activeConns = await pool.query("SELECT count(*)::int AS cnt FROM pg_stat_activity WHERE state = 'active'");
    results.database.active_connections = activeConns.rows[0]?.cnt || 0;

    let modulesCount = 0;
    let entitiesCount = 0;
    let fieldsCount = 0;
    try {
      const mc = await pool.query("SELECT count(*)::int AS cnt FROM modules");
      modulesCount = mc.rows[0]?.cnt || 0;
      const ec = await pool.query("SELECT count(*)::int AS cnt FROM entities");
      entitiesCount = ec.rows[0]?.cnt || 0;
      const fc = await pool.query("SELECT count(*)::int AS cnt FROM entity_fields");
      fieldsCount = fc.rows[0]?.cnt || 0;
    } catch {}
    results.erp = { modules: modulesCount, entities: entitiesCount, fields: fieldsCount };

    let usersCount = 0;
    let activeUsers = 0;
    try {
      const uc = await pool.query("SELECT count(*)::int AS cnt FROM users");
      usersCount = uc.rows[0]?.cnt || 0;
      const ac = await pool.query("SELECT count(*)::int AS cnt FROM sessions WHERE expires_at > NOW()");
      activeUsers = ac.rows[0]?.cnt || 0;
    } catch {}
    results.users = { total: usersCount, active_sessions: activeUsers };

    let scheduledJobs = 0;
    let activeTriggers = 0;
    try {
      const sj = await pool.query("SELECT count(*)::int AS cnt FROM agent_scheduled_jobs WHERE enabled = true");
      scheduledJobs = sj.rows[0]?.cnt || 0;
    } catch {}
    try {
      const tr = await pool.query("SELECT count(*)::int AS cnt FROM agent_triggers WHERE enabled = true");
      activeTriggers = tr.rows[0]?.cnt || 0;
    } catch {}
    results.automation = { scheduled_jobs: scheduledJobs, active_triggers: activeTriggers };

    let kobiSessions = 0;
    let kobiMessages = 0;
    let kobiMemories = 0;
    try {
      const ks = await pool.query("SELECT count(*)::int AS cnt FROM kobi_sessions WHERE status != 'deleted'");
      kobiSessions = ks.rows[0]?.cnt || 0;
      const km = await pool.query("SELECT count(*)::int AS cnt FROM kobi_chat_logs");
      kobiMessages = km.rows[0]?.cnt || 0;
      const kme = await pool.query("SELECT count(*)::int AS cnt FROM kobi_memory");
      kobiMemories = kme.rows[0]?.cnt || 0;
    } catch {}
    results.agents = {
      kobi: {
        model: DEFAULT_CONFIG.model,
        total_tools: TOTAL_TOOLS,
        sessions: kobiSessions,
        messages: kobiMessages,
        memories: kobiMemories,
      },
    };

    results.server = {
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      node_version: process.version,
      timestamp: new Date().toISOString(),
    };

    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/super-agent/tools", (_req, res) => {
  const tools = getToolsList();
  const categories = Object.entries(TOOL_CATEGORIES).map(([key, cat]) => ({
    key,
    label: cat.label,
    description: cat.description,
    tools: [...cat.tools],
  }));
  res.json({ total: TOTAL_TOOLS, categories, tools });
});

router.post("/super-agent/execute", async (req, res) => {
  const { tool, params } = req.body;
  if (!tool) {
    res.status(400).json({ error: "tool נדרש" });
    return;
  }
  try {
    const result = await executeTool(tool, params || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/autonomous", async (req, res) => {
  const { prompt, config } = req.body;
  const userId = (req as any).userId || "";
  if (!prompt) {
    res.status(400).json({ error: "prompt נדרש" });
    return;
  }
  try {
    const result = await runAutonomousTask(prompt, userId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/chat/stream", async (req, res) => {
  const { messages, sessionId } = req.body;
  const userId = (req as any).userId || "";

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages נדרש" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY לא מוגדר" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendSSE = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let currentSessionId = sessionId;
  const startTime = Date.now();
  let totalToolCalls = 0;
  let fullResponse = "";

  try {
    if (!currentSessionId) {
      const userMsg = messages[messages.length - 1]?.content || "";
      const title = typeof userMsg === "string" ? userMsg.slice(0, 80) : "שיחה חדשה";
      const sRes = await pool.query(
        `INSERT INTO kobi_sessions (user_id, title, status, agent_type) VALUES ($1, $2, 'active', 'super-agent') RETURNING id`,
        [userId, title]
      );
      currentSessionId = sRes.rows[0].id;
      sendSSE("session", { sessionId: currentSessionId });
    }

    const memory = await getProjectMemory(userId);
    const sessionCtx = await getSessionContext(String(currentSessionId));
    const recentMsgs = await getRecentMessages(String(currentSessionId), 20);

    const systemPrompt = KOBI_SYSTEM_PROMPT + (memory || "") + (sessionCtx || "");

    const claudeMessages: any[] = [];

    for (const rm of recentMsgs) {
      claudeMessages.push({ role: "user", content: rm.user_message || "" });
      if (rm.assistant_response) {
        claudeMessages.push({ role: "assistant", content: rm.assistant_response });
      }
    }

    const lastUserMsg = messages[messages.length - 1];
    const userContent = buildClaudeContent(lastUserMsg);
    claudeMessages.push({ role: "user", content: userContent });

    let loops = 0;
    const maxLoops = DEFAULT_CONFIG.maxToolLoops;

    while (loops < maxLoops) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: DEFAULT_CONFIG.model,
          max_tokens: DEFAULT_CONFIG.maxTokens,
          system: systemPrompt,
          messages: claudeMessages,
          tools: KOBI_TOOLS_SCHEMA,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        sendSSE("error", { error: `Claude API: ${response.status} - ${errText.slice(0, 200)}` });
        break;
      }

      const data = (await response.json()) as any;
      const contentBlocks = data.content || [];

      claudeMessages.push({ role: "assistant", content: contentBlocks });

      const textBlocks = contentBlocks.filter((b: any) => b.type === "text");
      const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

      for (const tb of textBlocks) {
        sendSSE("text", { content: tb.text });
        fullResponse += tb.text;
      }

      if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
        break;
      }

      const toolResults: any[] = [];
      for (const toolBlock of toolUseBlocks) {
        totalToolCalls++;
        sendSSE("tool_start", {
          tool: toolBlock.name,
          input: toolBlock.input,
          toolCallId: toolBlock.id,
        });

        try {
          const toolResult = await executeTool(toolBlock.name, toolBlock.input);
          const resultText = toolResult.error || toolResult.result || "";
          sendSSE("tool_end", {
            tool: toolBlock.name,
            result: resultText.slice(0, 2000),
            toolCallId: toolBlock.id,
            success: !toolResult.error,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: resultText,
          });
        } catch (e: any) {
          sendSSE("tool_end", {
            tool: toolBlock.name,
            result: `שגיאה: ${e.message}`,
            toolCallId: toolBlock.id,
            success: false,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `שגיאה: ${e.message}`,
            is_error: true,
          });
        }
      }

      claudeMessages.push({ role: "user", content: toolResults });
      loops++;
    }

    const elapsed = Date.now() - startTime;

    try {
      const userText = typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
      await saveMessage(String(currentSessionId), userId, userText, fullResponse, totalToolCalls, elapsed);
      await autoExtractMemory(userId, userText, fullResponse);
    } catch {}

    sendSSE("done", {
      sessionId: currentSessionId,
      toolCalls: totalToolCalls,
      elapsed,
    });
  } catch (e: any) {
    sendSSE("error", { error: e.message });
  }

  res.end();
});

router.get("/super-agent/sessions", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const result = await pool.query(
      `SELECT id, title, status, agent_type, total_messages, total_tool_calls, pinned, created_at, updated_at
       FROM kobi_sessions WHERE user_id = $1 AND status != 'deleted'
       ORDER BY pinned DESC, updated_at DESC LIMIT 100`,
      [userId]
    );
    res.json({ sessions: result.rows });
  } catch {
    res.json({ sessions: [] });
  }
});

router.get("/super-agent/sessions/:sessionId/messages", async (req, res) => {
  const sessionId = String(req.params.sessionId);
  try {
    const result = await pool.query(
      `SELECT id, user_message, assistant_response, tool_loops, response_time_ms, created_at
       FROM kobi_chat_logs WHERE session_id = $1 ORDER BY created_at ASC LIMIT 200`,
      [sessionId]
    );
    res.json({ messages: result.rows });
  } catch {
    res.json({ messages: [] });
  }
});

router.get("/super-agent/history", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const sessions = await pool.query(
      `SELECT s.id, s.title, s.status, s.agent_type, s.total_messages, s.total_tool_calls, s.pinned, s.created_at, s.updated_at
       FROM kobi_sessions s WHERE s.user_id = $1 AND s.status != 'deleted'
       ORDER BY s.pinned DESC, s.updated_at DESC LIMIT 100`,
      [userId]
    );
    const logs = await pool.query(
      "SELECT id, user_message, assistant_response, tool_loops, response_time_ms, created_at FROM kobi_chat_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [userId]
    );
    res.json({ sessions: sessions.rows, history: logs.rows, total_tools: TOTAL_TOOLS });
  } catch {
    res.json({ sessions: [], history: [], total_tools: TOTAL_TOOLS });
  }
});

router.post("/super-agent/scheduler", async (req, res) => {
  try {
    const result = await handleSchedulerTool(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/triggers", async (req, res) => {
  try {
    const result = await handleTriggerTool(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/import", async (req, res) => {
  try {
    const result = await importData(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/cross-module", async (req, res) => {
  try {
    const result = await streamDataAcrossModules(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/super-agent/transactions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const flow = req.query.flow ? String(req.query.flow) : null;
    const status = req.query.status ? String(req.query.status) : null;

    let q = "SELECT * FROM cross_module_transactions WHERE 1=1";
    const vals: any[] = [];
    let idx = 1;
    if (flow) { q += ` AND flow_name = $${idx++}`; vals.push(flow); }
    if (status) { q += ` AND status = $${idx++}`; vals.push(status); }
    q += ` ORDER BY created_at DESC LIMIT $${idx}`;
    vals.push(limit);

    const result = await pool.query(q, vals);

    const stats = await pool.query(
      `SELECT flow_name, status, count(*)::int AS cnt, avg(duration_ms)::int AS avg_ms
       FROM cross_module_transactions GROUP BY flow_name, status ORDER BY flow_name`
    );

    res.json({
      transactions: result.rows,
      stats: stats.rows,
      total: result.rows.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/super-agent/memory", async (req, res) => {
  const userId = (req as any).userId || "";
  try {
    const memory = await getProjectMemory(userId);
    const result = await pool.query(
      "SELECT id, category, key, value, importance, created_at, updated_at FROM kobi_memory WHERE user_id = $1 ORDER BY category, importance DESC",
      [userId]
    );
    res.json({ memory: result.rows, summary: memory });
  } catch {
    res.json({ memory: [], summary: "" });
  }
});

router.delete("/super-agent/memory/:memoryId", async (req, res) => {
  const memoryId = String(req.params.memoryId);
  try {
    await pool.query("DELETE FROM kobi_memory WHERE id = $1", [memoryId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/super-agent/sessions/:sessionId/pin", async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const { pinned } = req.body;
  try {
    await pool.query("UPDATE kobi_sessions SET pinned = $1, updated_at = NOW() WHERE id = $2", [pinned ?? true, sessionId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/super-agent/sessions/:sessionId", async (req, res) => {
  const sessionId = String(req.params.sessionId);
  try {
    await pool.query("UPDATE kobi_sessions SET status = 'deleted', updated_at = NOW() WHERE id = $1", [sessionId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function buildClaudeContent(msg: any): any {
  if (typeof msg.content === "string" && !msg.images?.length) {
    return msg.content;
  }
  const blocks: any[] = [];
  if (msg.images && Array.isArray(msg.images)) {
    for (const img of msg.images) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type || "image/jpeg",
          data: img.base64,
        },
      });
    }
  }
  if (msg.content) {
    blocks.push({ type: "text", text: msg.content });
  }
  return blocks.length > 0 ? blocks : msg.content || "";
}

export default router;
