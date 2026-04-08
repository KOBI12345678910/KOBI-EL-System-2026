import { pool } from "@workspace/db";

export async function getProjectMemory(userId: string): Promise<string> {
  try {
    const memories = await pool.query(
      `SELECT category, key, value FROM kobi_memory 
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY importance DESC, updated_at DESC LIMIT 100`,
      [userId]
    );
    if (memories.rows.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const m of memories.rows) {
      const cat = m.category as string;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`- ${m.key}: ${m.value}`);
    }

    let result = "\n\n[זיכרון פרויקט — רענון אוטומטי]";
    for (const [cat, items] of Object.entries(grouped)) {
      result += `\n**${cat}**:\n${items.join("\n")}`;
    }

    const recentSummaries = await getRecentSessionSummaries(userId, 10);
    if (recentSummaries) {
      result += recentSummaries;
    }

    return result;
  } catch {
    return "";
  }
}

async function getRecentSessionSummaries(userId: string, limit: number = 10): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT title, context_summary, updated_at 
       FROM kobi_sessions 
       WHERE user_id = $1 AND status != 'deleted' AND context_summary IS NOT NULL AND context_summary != ''
       ORDER BY updated_at DESC LIMIT $2`,
      [userId, limit]
    );
    if (result.rows.length === 0) return "";

    let out = "\n\n[שיחות אחרונות]";
    for (const row of result.rows) {
      const date = new Date(row.updated_at).toLocaleDateString("he-IL");
      const summary = (row.context_summary as string).slice(0, 1500);
      out += `\n- ${date} — ${row.title}: ${summary}`;
    }
    return out;
  } catch {
    return "";
  }
}

export async function saveMemory(
  userId: string,
  category: string,
  key: string,
  value: string,
  importance: number = 5,
  sessionId?: number
): Promise<void> {
  try {
    const existing = await pool.query(
      "SELECT id FROM kobi_memory WHERE user_id = $1 AND category = $2 AND key = $3",
      [userId, category, key]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE kobi_memory SET value = $1, importance = $2, updated_at = NOW() WHERE id = $3",
        [value, importance, existing.rows[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO kobi_memory (user_id, category, key, value, importance, source_session_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, category, key, value, importance, sessionId || null]
      );
    }
  } catch {}
}

export async function getSessionContext(sessionId: number): Promise<string> {
  try {
    const session = await pool.query("SELECT context_summary FROM kobi_sessions WHERE id = $1", [sessionId]);
    if (session.rows.length === 0 || !session.rows[0].context_summary) return "";
    return `\n[הקשר שיחה: ${session.rows[0].context_summary}]`;
  } catch {
    return "";
  }
}

export async function updateSessionContext(sessionId: number, summary: string): Promise<void> {
  try {
    await pool.query("UPDATE kobi_sessions SET context_summary = $1, updated_at = NOW() WHERE id = $2", [summary, sessionId]);
  } catch {}
}

export async function getRecentMessages(sessionId: number, limit: number = 20): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT role, content FROM kobi_messages 
       WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows.reverse();
  } catch {
    return [];
  }
}

export async function saveMessage(
  sessionId: number,
  role: string,
  content: string,
  toolCalls: any[] = [],
  toolResults: any[] = [],
  responseTimeMs: number = 0,
  toolLoops: number = 0
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO kobi_messages (session_id, role, content, tool_calls, tool_results, response_time_ms, tool_loops)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, role, content, JSON.stringify(toolCalls), JSON.stringify(toolResults), responseTimeMs, toolLoops]
    );
    await pool.query(
      "UPDATE kobi_sessions SET total_messages = total_messages + 1, updated_at = NOW() WHERE id = $1",
      [sessionId]
    );
  } catch {}
}

async function extractAndSaveAllInstructions(userId: string, userMessage: string, sessionId: number): Promise<void> {
  const msg = userMessage.trim();
  if (!msg || msg.length < 5) return;

  const imperativePatterns: Array<{ pattern: RegExp; category: string; importance: number }> = [
    { pattern: /מעכשיו תמיד (.{5,120})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /מעכשיו (.{5,120})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /כלל חשוב[:\s]+(.{5,120})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /זכור ש(.{5,120})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /חשוב[:\s]+(.{5,120})/i, category: "הוראות קבועות", importance: 8 },
    { pattern: /לעולם אל (.{5,100})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /תמיד (.{5,100})/i, category: "העדפות משתמש", importance: 8 },
    { pattern: /אל פעם (.{5,100})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /אסור ל(.{5,100})/i, category: "הוראות קבועות", importance: 9 },
    { pattern: /אני מעדיף (.{5,100})/i, category: "העדפות משתמש", importance: 8 },
    { pattern: /אני רוצה תמיד (.{5,100})/i, category: "העדפות משתמש", importance: 8 },
    { pattern: /הפרויקט שלי (.{5,100})/i, category: "הקשר פרויקט", importance: 8 },
    { pattern: /אנחנו עובדים על (.{5,100})/i, category: "הקשר פרויקט", importance: 7 },
    { pattern: /הסגנון שלנו (.{5,100})/i, category: "העדפות משתמש", importance: 7 },
    { pattern: /השפה שלנו (.{5,100})/i, category: "העדפות משתמש", importance: 8 },
  ];

  for (const { pattern, category, importance } of imperativePatterns) {
    const match = msg.match(pattern);
    if (match) {
      const instruction = match[1].replace(/\n/g, " ").slice(0, 120);
      const key = instruction.slice(0, 60);
      await saveMemory(userId, category, key, `${instruction} (שיחה #${sessionId})`, importance, sessionId);
    }
  }

  if (msg.length > 20 && msg.length < 250) {
    const imperativeStarters = [
      "תמיד", "אל", "אסור", "חובה", "חשוב", "בבקשה", "רק", "לעולם", "מעכשיו",
      "זכור", "שמור", "ודא", "השתמש", "הקפד", "עשה", "אל תעשה", "הימנע", "השתדל",
      "give", "always", "never", "make sure", "remember", "use", "avoid", "prefer",
    ];
    const words = msg.split(/\s+/);
    const firstWord = (words[0] || "").replace(/[^\u05D0-\u05EAa-zA-Z]/g, "");
    const matched = imperativeStarters.some(s => firstWord === s || msg.startsWith(s));

    const isSingleSentence = !/[.!?]/.test(msg.slice(0, msg.length - 1));
    const hasDirectiveWords = /\b(תמיד|לעולם|מעכשיו|אסור|חשוב|חובה|always|never|must|should)\b/i.test(msg);

    if (matched || (isSingleSentence && hasDirectiveWords)) {
      const userPref = msg.slice(0, 120);
      await saveMemory(userId, "העדפות משתמש", userPref.slice(0, 60), `"${userPref}" — שיחה #${sessionId}`, 7, sessionId);
    }
  }
}

export async function saveProjectStateSnapshot(userId: string, sessionId: number): Promise<void> {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
        (SELECT count(*) FROM users WHERE is_active = true) as active_users,
        (SELECT count(*) FROM platform_modules WHERE is_active = true) as active_modules,
        (SELECT count(*) FROM kobi_sessions WHERE user_id = $1 AND status != 'deleted') as total_sessions
    `, [userId]);
    const s = stats.rows[0];
    const snapshot = `${s.table_count} טבלאות, ${s.active_users} משתמשים, ${s.active_modules} מודולים (${new Date().toLocaleDateString("he-IL")})`;
    await saveMemory(userId, "מצב מערכת", "snapshot", snapshot, 6, sessionId);

    const recentTables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name DESC LIMIT 10
    `);
    if (recentTables.rows.length > 0) {
      const tableList = recentTables.rows.map((r: any) => r.table_name).join(", ");
      await saveMemory(userId, "מצב מערכת", "טבלאות אחרונות", tableList, 4, sessionId);
    }
  } catch {}
}

export async function autoExtractMemory(userId: string, userMessage: string, assistantResponse: string, sessionId: number): Promise<void> {
  try {
    if (assistantResponse.includes("✅ טבלה") && assistantResponse.includes("נוצרה")) {
      const match = assistantResponse.match(/טבלה\s+(\S+)\s+נוצרה/);
      if (match) await saveMemory(userId, "טבלאות שנוצרו", match[1], `נוצרה בשיחה #${sessionId}`, 7, sessionId);
    }
    if (assistantResponse.includes("✅ דף נוצר")) {
      const match = assistantResponse.match(/דף נוצר:\s*(\S+)/);
      if (match) await saveMemory(userId, "דפים שנוצרו", match[1], `נוצר בשיחה #${sessionId}`, 7, sessionId);
    }
    if (assistantResponse.includes("✅ Route נוצר")) {
      const match = assistantResponse.match(/Route נוצר:\s*(\S+)/);
      if (match) await saveMemory(userId, "routes שנוצרו", match[1], `נוצר בשיחה #${sessionId}`, 7, sessionId);
    }
    if (assistantResponse.includes("✅ קובץ עודכן") || assistantResponse.includes("✅ קובץ נכתב")) {
      const match = assistantResponse.match(/קובץ (?:עודכן|נכתב):\s*(\S+)/);
      if (match) await saveMemory(userId, "קבצים שנערכו", match[1], new Date().toISOString().slice(0, 10), 3, sessionId);
    }
    if (userMessage.includes("תקן") || userMessage.includes("באג") || userMessage.includes("שגיאה")) {
      if (assistantResponse.includes("✅")) {
        await saveMemory(userId, "באגים שתוקנו", userMessage.slice(0, 80), `תוקן בשיחה #${sessionId}`, 6, sessionId);
      }
    }

    const dataPatterns: Array<{ pattern: RegExp; category: string; importance: number }> = [
      { pattern: /(\d+)\s+לקוחות/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+ספקים/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+הוראות עבודה/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+עובדים/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+מוצרים/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+חשבוניות/i, category: "נתוני מערכת", importance: 5 },
      { pattern: /(\d+)\s+טבלאות/i, category: "נתוני מערכת", importance: 4 },
      { pattern: /(\d+)\s+רשומות/i, category: "נתוני מערכת", importance: 4 },
      { pattern: /(\d+)\s+הזמנות/i, category: "נתוני מערכת", importance: 4 },
      { pattern: /(\d+)\s+מודולים/i, category: "נתוני מערכת", importance: 4 },
      { pattern: /(\d+)\s+ישויות/i, category: "נתוני מערכת", importance: 3 },
    ];
    for (const { pattern, category, importance } of dataPatterns) {
      const match = assistantResponse.match(pattern);
      if (match) {
        const fullMatch = assistantResponse.substring(
          Math.max(0, assistantResponse.indexOf(match[0]) - 20),
          assistantResponse.indexOf(match[0]) + match[0].length + 20
        ).replace(/\n/g, " ").trim();
        await saveMemory(userId, category, match[0].trim(), `${fullMatch} (שיחה #${sessionId}, ${new Date().toLocaleDateString("he-IL")})`, importance, sessionId);
      }
    }

    if (assistantResponse.includes("⚠️") || assistantResponse.includes("❌")) {
      const issuePatterns = [
        /⚠️\s*(.{10,100})/,
        /❌\s*(.{10,100})/,
        /בעיה[:\s]+(.{10,100})/,
        /שגיאה[:\s]+(.{10,100})/,
      ];
      for (const p of issuePatterns) {
        const match = assistantResponse.match(p);
        if (match) {
          const issue = match[1].replace(/\n/g, " ").slice(0, 80);
          await saveMemory(userId, "בעיות שזוהו", issue, `שיחה #${sessionId}, ${new Date().toLocaleDateString("he-IL")}`, 6, sessionId);
          break;
        }
      }
    }

    if (userMessage.includes("דשבורד") || userMessage.includes("דוח") || userMessage.includes("KPI") || userMessage.includes("ניתוח")) {
      const taskSummary = userMessage.slice(0, 60).replace(/\n/g, " ");
      const resultSummary = assistantResponse.includes("✅") ? "הושלם" : assistantResponse.includes("❌") ? "נכשל" : "בוצע";
      await saveMemory(userId, "משימות שבוצעו", taskSummary, `${resultSummary} — שיחה #${sessionId}, ${new Date().toLocaleDateString("he-IL")}`, 5, sessionId);
    }

    if (userMessage.includes("בנה") || userMessage.includes("צור") || userMessage.includes("הוסף") || userMessage.includes("עדכן")) {
      const taskSummary = userMessage.slice(0, 60).replace(/\n/g, " ");
      const resultSummary = assistantResponse.includes("✅") ? "הושלם" : "בוצע";
      await saveMemory(userId, "משימות פיתוח", taskSummary, `${resultSummary} — שיחה #${sessionId}`, 6, sessionId);
    }

    const prefPatterns: Array<{ pattern: RegExp; key: string; importance: number }> = [
      { pattern: /תמיד תראה לי (SQL|sql)/i, key: "הצג SQL", importance: 8 },
      { pattern: /אני אוהב טבלאות/i, key: "מעדיף טבלאות", importance: 8 },
      { pattern: /תמיד בעברית/i, key: "שפה: עברית", importance: 9 },
      { pattern: /תמיד ב-?english/i, key: "שפה: אנגלית", importance: 9 },
      { pattern: /תמיד תוסיף הסברים/i, key: "הסברים מלאים", importance: 8 },
      { pattern: /תשובות קצרות/i, key: "תשובות קצרות", importance: 8 },
      { pattern: /אל תשאל\b/i, key: "אל תשאל, פעל", importance: 9 },
      { pattern: /תסביר מה אתה עושה/i, key: "הסבר פעולות", importance: 8 },
      { pattern: /אני מעדיף (גרפים|תרשימים)/i, key: "מעדיף גרפים", importance: 7 },
      { pattern: /בלי (אימוג'י|emoji)/i, key: "ללא אימוג'י", importance: 7 },
      { pattern: /תמיד תשמור/i, key: "שמור תמיד", importance: 8 },
      { pattern: /אני עובד על/i, key: `פרויקט: ${userMessage.slice(0, 50).replace(/\n/g, " ")}`, importance: 7 },
      { pattern: /הפרויקט נקרא/i, key: `שם פרויקט: ${userMessage.slice(0, 50).replace(/\n/g, " ")}`, importance: 8 },
      { pattern: /תמיד תוסיף (בדיקות|tests)/i, key: "הוסף בדיקות", importance: 7 },
      { pattern: /אסור למחוק/i, key: "אל תמחק ללא אישור", importance: 9 },
      { pattern: /השתמש ב-?RTL/i, key: "RTL חובה", importance: 8 },
      { pattern: /סגנון dark/i, key: "dark theme", importance: 7 },
      { pattern: /תמיד תאשר/i, key: "בקש אישור לפני פעולות", importance: 9 },
    ];
    for (const { pattern, key, importance } of prefPatterns) {
      if (pattern.test(userMessage)) {
        await saveMemory(userId, "העדפות משתמש", key, `זוהה בשיחה #${sessionId}`, importance, sessionId);
      }
    }

    await extractAndSaveAllInstructions(userId, userMessage, sessionId);

    try {
      const msgCount = await pool.query("SELECT total_messages FROM kobi_sessions WHERE id = $1", [sessionId]);
      const total = msgCount.rows[0]?.total_messages || 0;
      if (total % 5 === 0 && total > 0) {
        await saveProjectStateSnapshot(userId, sessionId);
      }
    } catch {}

    await generateSessionSummary(userId, sessionId, userMessage, assistantResponse);
  } catch {}
}

async function generateSessionSummary(userId: string, sessionId: number, userMessage: string, assistantResponse: string): Promise<void> {
  try {
    const session = await pool.query("SELECT title, total_messages, context_summary FROM kobi_sessions WHERE id = $1", [sessionId]);
    if (session.rows.length === 0) return;
    const totalMsgs = session.rows[0].total_messages || 0;
    if (totalMsgs < 2) return;

    const actions: string[] = [];
    if (assistantResponse.includes("✅ טבלה") || assistantResponse.includes("טבלה נוצרה")) actions.push("יצירת טבלה");
    if (assistantResponse.includes("✅ דף נוצר")) actions.push("יצירת דף");
    if (assistantResponse.includes("✅ Route נוצר")) actions.push("יצירת route");
    if (assistantResponse.includes("✅ קובץ")) actions.push("עריכת קבצים");
    if (assistantResponse.includes("✅") && assistantResponse.toLowerCase().includes("sql")) actions.push("שאילתות SQL");
    if (assistantResponse.includes("תוקן") || userMessage.includes("תקן")) actions.push("תיקון בעיות");
    if (userMessage.includes("דשבורד") || userMessage.includes("KPI")) actions.push("דשבורד/KPI");
    if (userMessage.includes("דוח") || userMessage.includes("סיכום")) actions.push("דוחות");
    if (userMessage.includes("בדיקה") || userMessage.includes("בדוק")) actions.push("בדיקת מערכת");
    if (assistantResponse.includes("show_map") || assistantResponse.includes("מפה")) actions.push("מפות");

    const topics: string[] = [];
    const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
      { pattern: /לקוחות|customers/i, topic: "לקוחות" },
      { pattern: /ספקים|suppliers/i, topic: "ספקים" },
      { pattern: /עובדים|employees/i, topic: "עובדים" },
      { pattern: /הוראות עבודה|production/i, topic: "ייצור" },
      { pattern: /חשבוניות|invoices/i, topic: "חשבוניות" },
      { pattern: /מלאי|inventory|מוצרים/i, topic: "מלאי" },
      { pattern: /כספים|finance/i, topic: "כספים" },
      { pattern: /משאבי אנוש|HR/i, topic: "משאבי אנוש" },
    ];
    for (const { pattern, topic } of topicPatterns) {
      if (pattern.test(userMessage) || pattern.test(assistantResponse.slice(0, 500))) {
        topics.push(topic);
      }
    }

    const shortUser = userMessage.slice(0, 80).replace(/\n/g, " ");
    const shortResp = assistantResponse.slice(0, 150).replace(/\n/g, " ");
    const actionsStr = actions.length > 0 ? ` | פעולות: ${actions.join(", ")}` : "";
    const topicsStr = topics.length > 0 ? ` | נושאים: ${topics.join(", ")}` : "";

    const prevSummary = session.rows[0].context_summary || "";
    const newEntry = `${shortUser}${actionsStr}${topicsStr} → ${shortResp}`;

    let summary: string;
    if (prevSummary && totalMsgs > 4) {
      const prevLines = prevSummary.split("\n").filter((l: string) => l.trim());
      const lastLines = prevLines.slice(-4);
      summary = [...lastLines, newEntry].join("\n").slice(0, 1500);
    } else {
      summary = newEntry.slice(0, 1000);
    }

    await updateSessionContext(sessionId, summary);
  } catch {}
}
