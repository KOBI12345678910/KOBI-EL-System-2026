import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";

interface StreamSession {
  id: string;
  status: "active" | "paused" | "completed" | "error";
  tokensGenerated: number;
  startedAt: number;
  chunks: string[];
}

const sessions = new Map<string, StreamSession>();

export async function streamGenerate(params: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
}): Promise<{ success: boolean; output: string; sessionId: string }> {
  const sessionId = `stream_${Date.now()}`;
  const session: StreamSession = {
    id: sessionId,
    status: "active",
    tokensGenerated: 0,
    startedAt: Date.now(),
    chunks: [],
  };
  sessions.set(sessionId, session);

  try {
    const response = await callLLM({
      system: params.system || "Generate the requested content. Be thorough and detailed.",
      messages: [{ role: "user", content: params.prompt }],
      maxTokens: params.maxTokens || 4096,
    });

    const text = extractTextContent(response.content);
    const chunkSize = 100;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      session.chunks.push(chunk);
      session.tokensGenerated += Math.ceil(chunk.length / 4);
      if (params.onChunk) params.onChunk(chunk);
    }

    session.status = "completed";
    return { success: true, output: text, sessionId };
  } catch (error: any) {
    session.status = "error";
    return { success: false, output: `שגיאה: ${error.message}`, sessionId };
  }
}

export async function streamCode(params: {
  task: string;
  language: string;
  filePath?: string;
}): Promise<{ success: boolean; output: string; sessionId: string }> {
  return streamGenerate({
    prompt: `Generate ${params.language} code for: ${params.task}${params.filePath ? `\nFile: ${params.filePath}` : ""}`,
    system: `You are an expert ${params.language} developer. Generate clean, production-ready code. Include error handling, types, and documentation. Return ONLY the code.`,
    maxTokens: 8192,
  });
}

export async function streamExplain(params: {
  code: string;
  language?: string;
  depth?: string;
}): Promise<{ success: boolean; output: string; sessionId: string }> {
  return streamGenerate({
    prompt: `Explain this ${params.language || ""} code:\n\`\`\`\n${params.code.slice(0, 6000)}\n\`\`\``,
    system: `Explain code clearly in Hebrew. Depth: ${params.depth || "detailed"}. Cover: purpose, logic flow, design patterns, potential issues.`,
    maxTokens: 4096,
  });
}

export async function getStreamStatus(params: {
  sessionId: string;
}): Promise<{ success: boolean; output: string }> {
  const session = sessions.get(params.sessionId);
  if (!session) return { success: false, output: "Session not found" };

  const elapsed = Math.round((Date.now() - session.startedAt) / 1000);
  return {
    success: true,
    output: `📡 Session ${session.id}: ${session.status} | ${session.tokensGenerated} tokens | ${elapsed}s | ${session.chunks.length} chunks`,
  };
}

export const STREAMING_TOOLS = [
  {
    name: "stream_generate",
    description: "יצירת תוכן בסטרימינג — תגובה בזמן אמת טוקן אחר טוקן",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "הפרומפט" },
        system: { type: "string", description: "הנחיית מערכת" },
        maxTokens: { type: "number", description: "מקסימום טוקנים" },
      },
      required: ["prompt"] as string[],
    },
  },
  {
    name: "stream_code",
    description: "יצירת קוד בסטרימינג — שפה, משימה, קובץ",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string" }, language: { type: "string" },
        filePath: { type: "string" },
      },
      required: ["task", "language"] as string[],
    },
  },
  {
    name: "stream_explain",
    description: "הסבר קוד בסטרימינג — עברית, מעמיק",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string" }, language: { type: "string" },
        depth: { type: "string", description: "brief | detailed | deep" },
      },
      required: ["code"] as string[],
    },
  },
  {
    name: "get_stream_status",
    description: "סטטוס session סטרימינג",
    input_schema: {
      type: "object" as const,
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"] as string[],
    },
  },
];
