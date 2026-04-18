export function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {}
  }

  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }

  return null;
}

export function extractCodeBlocks(
  text: string
): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w*)\s*\n([\s\S]*?)\n\s*```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || "text",
      code: match[2],
    });
  }
  return blocks;
}

export function extractTextContent(
  content: Array<{ type: string; text?: string }>
): string {
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n");
}

export function extractToolCalls(
  content: Array<{ type: string; id?: string; name?: string; input?: any }>
): Array<{ id: string; name: string; input: any }> {
  return content
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id!,
      name: block.name!,
      input: block.input,
    }));
}