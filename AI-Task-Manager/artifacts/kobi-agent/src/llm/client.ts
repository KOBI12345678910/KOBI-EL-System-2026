import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  source?: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string };
}

export interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string };
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export async function callLLM(params: {
  system: string;
  messages: LLMMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
}): Promise<{ content: ContentBlock[]; stopReason: string }> {
  const response = await anthropic.messages.create({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
    max_tokens: params.maxTokens || 8192,
    system: params.system,
    messages: params.messages as any,
    tools: params.tools as any,
  });

  return {
    content: response.content as ContentBlock[],
    stopReason: response.stop_reason || "end_turn",
  };
}

export async function callLLMWithVision(params: {
  system: string;
  imageBase64: string;
  mediaType: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ content: ContentBlock[]; stopReason: string }> {
  const response = await anthropic.messages.create({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
    max_tokens: params.maxTokens || 4096,
    system: params.system,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: params.mediaType, data: params.imageBase64 } },
        { type: "text", text: params.prompt },
      ],
    }] as any,
  });

  return {
    content: response.content as ContentBlock[],
    stopReason: response.stop_reason || "end_turn",
  };
}

export async function callLLMWithMultipleImages(params: {
  system: string;
  images: Array<{ base64: string; mediaType: string }>;
  prompt: string;
  maxTokens?: number;
}): Promise<{ content: ContentBlock[]; stopReason: string }> {
  const contentBlocks: any[] = params.images.map(img => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  contentBlocks.push({ type: "text", text: params.prompt });

  const response = await anthropic.messages.create({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
    max_tokens: params.maxTokens || 8192,
    system: params.system,
    messages: [{ role: "user", content: contentBlocks }] as any,
  });

  return {
    content: response.content as ContentBlock[],
    stopReason: response.stop_reason || "end_turn",
  };
}

export async function callLLMStream(params: {
  system: string;
  messages: LLMMessage[];
  tools?: ToolDef[];
  onText: (text: string) => void;
  onToolUse: (tool: { id: string; name: string; input: any }) => void;
}): Promise<{ stopReason: string }> {
  const stream = anthropic.messages.stream({
    model: process.env.MODEL || "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: params.system,
    messages: params.messages as any,
    tools: params.tools as any,
  });

  let currentToolId = "";
  let currentToolName = "";
  let toolInputJson = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      params.onText(event.delta.text);
    }
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "tool_use"
    ) {
      currentToolId = event.content_block.id;
      currentToolName = event.content_block.name;
      toolInputJson = "";
    }
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "input_json_delta"
    ) {
      toolInputJson += event.delta.partial_json;
    }
    if (event.type === "content_block_stop" && currentToolName) {
      try {
        const input = JSON.parse(toolInputJson);
        params.onToolUse({
          id: currentToolId,
          name: currentToolName,
          input,
        });
      } catch {}
      currentToolName = "";
      toolInputJson = "";
    }
  }

  const finalMessage = await stream.finalMessage();
  return { stopReason: finalMessage.stop_reason || "end_turn" };
}