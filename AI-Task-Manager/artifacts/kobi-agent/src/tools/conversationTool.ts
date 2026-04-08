import { callLLM, type LLMMessage } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const STORAGE_DIR = path.join(WORKSPACE_DIR, ".agent", "conversations");

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  taskId?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  context: Record<string, any>;
}

const conversations = new Map<string, Conversation>();
let activeConversation: string | null = null;

function ensureDir() { if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true }); }

function saveConversation(conv: Conversation) {
  ensureDir();
  fs.writeFileSync(path.join(STORAGE_DIR, `${conv.id}.json`), JSON.stringify(conv, null, 2));
}

function loadConversations() {
  ensureDir();
  try {
    for (const file of fs.readdirSync(STORAGE_DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, file), "utf-8"));
        conversations.set(data.id, data);
      } catch {}
    }
  } catch {}
}
loadConversations();

function extractContext(conv: Conversation, text: string) {
  const fileRefs = text.match(/`([a-zA-Z0-9_/.-]+\.[a-zA-Z]+)`/g);
  if (fileRefs) {
    conv.context.mentionedFiles = [...(conv.context.mentionedFiles || []), ...fileRefs.map(f => f.replace(/`/g, ""))].slice(-20);
  }
  const techPatterns = /\b(React|Next\.js|Express|TypeScript|PostgreSQL|Redis|Docker|Prisma|Drizzle|Tailwind|Node\.js)\b/gi;
  const techs = text.match(techPatterns);
  if (techs) {
    conv.context.techStack = [...new Set([...(conv.context.techStack || []), ...techs.map(t => t.toLowerCase())])];
  }
}

export async function chatInConversation(params: { message: string; conversationId?: string; systemOverride?: string }): Promise<{ success: boolean; output: string; message?: ChatMessage; conversationId?: string }> {
  let conv: Conversation;
  const convId = params.conversationId || activeConversation;

  if (convId && conversations.has(convId)) {
    conv = conversations.get(convId)!;
  } else {
    const id = `conv_${Date.now()}`;
    conv = { id, title: params.message.slice(0, 60), messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), context: {} };
    conversations.set(id, conv);
    activeConversation = id;
  }

  const userMsg: ChatMessage = { id: `msg_${Date.now()}_u`, role: "user", content: params.message, timestamp: new Date().toISOString() };
  conv.messages.push(userMsg);

  const historyMessages: LLMMessage[] = conv.messages.slice(-20).map(m => ({ role: m.role === "system" ? ("user" as const) : (m.role as "user" | "assistant"), content: m.content }));

  const systemPrompt = params.systemOverride || `You are Kobi Agent — an expert AI coding assistant.
You have full access to the project workspace.

Previous conversation context:
${JSON.stringify(conv.context)}

Instructions:
- Help the user with coding tasks, debugging, architecture, and project management
- When the user asks to build/create/fix something, provide the specific steps or code
- Be concise and practical
- Remember the conversation context
- If you need to execute something, describe the steps clearly`;

  const response = await callLLM({ system: systemPrompt, messages: historyMessages, maxTokens: 4096 });
  const assistantText = extractTextContent(response.content);

  const assistantMsg: ChatMessage = { id: `msg_${Date.now()}_a`, role: "assistant", content: assistantText, timestamp: new Date().toISOString() };
  conv.messages.push(assistantMsg);
  conv.updatedAt = new Date().toISOString();

  extractContext(conv, assistantText);
  saveConversation(conv);

  return { success: true, output: assistantText, message: assistantMsg, conversationId: conv.id };
}

export async function createConversation(params: { title?: string }): Promise<{ success: boolean; output: string; conversationId?: string }> {
  const id = `conv_${Date.now()}`;
  const conv: Conversation = { id, title: params.title || `שיחה ${new Date().toLocaleDateString("he-IL")}`, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), context: {} };
  conversations.set(id, conv);
  activeConversation = id;
  saveConversation(conv);
  return { success: true, output: `Conversation created: ${conv.title} (${id})`, conversationId: id };
}

export async function listConversations(): Promise<{ success: boolean; output: string; conversations?: any[] }> {
  const list = Array.from(conversations.values())
    .map(c => ({ id: c.id, title: c.title, messageCount: c.messages.length, updatedAt: c.updatedAt }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { success: true, output: list.length === 0 ? "No conversations yet." : list.map(c => `${c.id}: ${c.title} (${c.messageCount} messages)`).join("\n"), conversations: list };
}

export async function getConversation(params: { conversationId: string }): Promise<{ success: boolean; output: string; conversation?: Conversation }> {
  const conv = conversations.get(params.conversationId);
  if (!conv) return { success: false, output: `Conversation ${params.conversationId} not found` };
  return { success: true, output: conv.messages.map(m => `[${m.role}] ${m.content.slice(0, 200)}`).join("\n---\n"), conversation: conv };
}

export async function deleteConversation(params: { conversationId: string }): Promise<{ success: boolean; output: string }> {
  const deleted = conversations.delete(params.conversationId);
  if (deleted) {
    try { fs.unlinkSync(path.join(STORAGE_DIR, `${params.conversationId}.json`)); } catch {}
    if (activeConversation === params.conversationId) activeConversation = null;
    return { success: true, output: `Conversation ${params.conversationId} deleted` };
  }
  return { success: false, output: `Conversation ${params.conversationId} not found` };
}

export async function searchConversations(params: { query: string }): Promise<{ success: boolean; output: string; results?: ChatMessage[] }> {
  const results: ChatMessage[] = [];
  const lowerQuery = params.query.toLowerCase();
  for (const conv of conversations.values()) {
    for (const msg of conv.messages) {
      if (msg.content.toLowerCase().includes(lowerQuery)) results.push(msg);
    }
  }
  const limited = results.slice(0, 50);
  return { success: true, output: limited.length === 0 ? "No matches found." : limited.map(m => `[${m.role}] ${m.content.slice(0, 150)}`).join("\n---\n"), results: limited };
}

export const CONVERSATION_TOOLS = [
  { name: "chat_conversation", description: "Send a message in a conversation with full context history. Creates a new conversation if none exists.", input_schema: { type: "object" as const, properties: { message: { type: "string", description: "The message to send" }, conversationId: { type: "string", description: "Optional conversation ID to continue" }, systemOverride: { type: "string", description: "Optional custom system prompt" } }, required: ["message"] as string[] } },
  { name: "create_conversation", description: "Create a new conversation with an optional title", input_schema: { type: "object" as const, properties: { title: { type: "string", description: "Conversation title" } }, required: [] as string[] } },
  { name: "list_conversations", description: "List all saved conversations sorted by most recent", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_conversation", description: "Get full conversation history by ID", input_schema: { type: "object" as const, properties: { conversationId: { type: "string" } }, required: ["conversationId"] as string[] } },
  { name: "delete_conversation", description: "Delete a conversation by ID", input_schema: { type: "object" as const, properties: { conversationId: { type: "string" } }, required: ["conversationId"] as string[] } },
  { name: "search_conversations", description: "Search across all conversations for a query string", input_schema: { type: "object" as const, properties: { query: { type: "string", description: "Search query" } }, required: ["query"] as string[] } },
];