import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export interface FigmaComponent {
  name: string;
  type: "frame" | "component" | "text" | "rectangle" | "group" | "vector" | "instance";
  width: number;
  height: number;
  x: number;
  y: number;
  styles: Record<string, any>;
  children?: FigmaComponent[];
  text?: string;
  fills?: any[];
  strokes?: any[];
  effects?: any[];
}

function rgbaToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]/, "_$&") || "Component";
}

function extractSingleComponent(node: any): FigmaComponent | null {
  if (!node) return null;
  return {
    name: node.name || "element",
    type: (node.type || "rectangle").toLowerCase() as any,
    width: node.absoluteBoundingBox?.width || node.size?.x || 0,
    height: node.absoluteBoundingBox?.height || node.size?.y || 0,
    x: node.absoluteBoundingBox?.x || 0,
    y: node.absoluteBoundingBox?.y || 0,
    styles: {
      backgroundColor: node.fills?.[0]?.color ? rgbaToHex(node.fills[0].color) : undefined,
      borderRadius: node.cornerRadius,
      fontSize: node.style?.fontSize,
      fontWeight: node.style?.fontWeight,
      fontFamily: node.style?.fontFamily,
      color: node.fills?.[0]?.type === "SOLID" && node.type === "TEXT" ? rgbaToHex(node.fills[0].color) : undefined,
      textAlign: node.style?.textAlignHorizontal?.toLowerCase(),
      lineHeight: node.style?.lineHeightPx,
      opacity: node.opacity,
    },
    text: node.characters,
    fills: node.fills,
    children: node.children?.map((c: any) => extractSingleComponent(c)).filter(Boolean),
  };
}

function extractComponents(node: any, depth = 0): FigmaComponent[] {
  const components: FigmaComponent[] = [];
  if (depth > 10) return components;

  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    const comp: FigmaComponent = {
      name: node.name || "Unnamed",
      type: node.type.toLowerCase() as any,
      width: node.absoluteBoundingBox?.width || 0,
      height: node.absoluteBoundingBox?.height || 0,
      x: node.absoluteBoundingBox?.x || 0,
      y: node.absoluteBoundingBox?.y || 0,
      styles: {
        backgroundColor: node.fills?.[0]?.color ? rgbaToHex(node.fills[0].color) : undefined,
        borderRadius: node.cornerRadius,
        padding: node.paddingLeft ? `${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px` : undefined,
        gap: node.itemSpacing,
        layoutMode: node.layoutMode,
      },
      fills: node.fills,
      strokes: node.strokes,
      effects: node.effects,
      children: node.children?.map((child: any) => extractSingleComponent(child)).filter(Boolean),
    };
    components.push(comp);
  }

  if (node.children && (node.type === "DOCUMENT" || node.type === "CANVAS")) {
    for (const child of node.children) {
      components.push(...extractComponents(child, depth + 1));
    }
  }

  return components;
}

async function convertToReact(component: FigmaComponent): Promise<string> {
  const response = await callLLM({
    system: `You are an expert at converting Figma designs to React + Tailwind CSS code.
Rules:
- Use semantic HTML elements
- Use Tailwind CSS classes (no custom CSS)
- Make it responsive
- Include hover states where appropriate
- Add proper TypeScript types
- Make interactive elements functional (buttons, links, inputs)
- Pixel-perfect conversion of dimensions, spacing, colors, typography
- Use flexbox/grid for layouts

Respond with ONLY the complete React TSX component code.`,
    messages: [{
      role: "user",
      content: `Convert this Figma component to React + Tailwind:\n\n${JSON.stringify(component, null, 2)}`,
    }],
    maxTokens: 8192,
  });

  let code = extractTextContent(response.content);
  return code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

export async function importFromFigma(params: {
  figmaUrl: string;
  token: string;
}): Promise<{ success: boolean; output: string; components?: FigmaComponent[]; generatedFiles?: string[] }> {
  console.log("\n🎨 מייבא מ-Figma...");

  const fileKeyMatch = params.figmaUrl.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) return { success: false, output: "URL של Figma לא תקין" };
  const fileKey = fileKeyMatch[1];

  const result = await runCommand({
    command: `curl -s -H "X-Figma-Token: ${params.token}" "https://api.figma.com/v1/files/${fileKey}" | head -c 50000`,
    timeout: 30000,
  });

  if (result.stderr && !result.stdout) return { success: false, output: `שגיאה בגישה ל-Figma: ${result.stderr}` };

  let figmaData: any;
  try {
    figmaData = JSON.parse(result.stdout);
  } catch {
    return { success: false, output: "תגובת Figma לא תקינה" };
  }

  if (figmaData.err) return { success: false, output: `שגיאת Figma: ${figmaData.err}` };

  const components = extractComponents(figmaData.document);
  const generatedFiles: string[] = [];

  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/components/figma`, timeout: 5000 });

  for (const component of components) {
    const code = await convertToReact(component);
    const fileName = `${WORKSPACE}/src/components/figma/${sanitizeName(component.name)}.tsx`;
    await writeFile({ path: fileName, content: code });
    generatedFiles.push(fileName);
  }

  return {
    success: true,
    output: `🎨 יובאו ${components.length} קומפוננטות מ-Figma:\n${generatedFiles.map(f => `  📄 ${f}`).join("\n")}`,
    components,
    generatedFiles,
  };
}

export async function importFromFigmaJSON(params: {
  figmaJSON: string;
}): Promise<{ success: boolean; output: string; files?: string[] }> {
  console.log("\n🎨 מייבא מ-Figma JSON...");

  let data: any;
  try {
    data = JSON.parse(params.figmaJSON);
  } catch {
    return { success: false, output: "JSON לא תקין" };
  }

  const components = extractComponents(data);
  const files: string[] = [];

  await runCommand({ command: `mkdir -p ${WORKSPACE}/src/components/figma`, timeout: 5000 });

  for (const comp of components) {
    const code = await convertToReact(comp);
    const fileName = `${WORKSPACE}/src/components/figma/${sanitizeName(comp.name)}.tsx`;
    await writeFile({ path: fileName, content: code });
    files.push(fileName);
  }

  return {
    success: true,
    output: `🎨 יובאו ${components.length} קומפוננטות מ-JSON:\n${files.map(f => `  📄 ${f}`).join("\n")}`,
    files,
  };
}

export async function figmaToReact(params: {
  componentJSON: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🎨 ממיר קומפוננטה ל-React...");

  let component: FigmaComponent;
  try {
    component = JSON.parse(params.componentJSON);
  } catch {
    return { success: false, output: "JSON לא תקין" };
  }

  const code = await convertToReact(component);
  return { success: true, output: code };
}

export async function cssToTailwind(params: {
  cssCode: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🎨 ממיר CSS ל-Tailwind...");

  const response = await callLLM({
    system: "Convert CSS to Tailwind CSS utility classes. Respond with ONLY the JSX with Tailwind classes.",
    messages: [{ role: "user", content: `Convert to Tailwind:\n\`\`\`css\n${params.cssCode}\n\`\`\`` }],
  });

  const result = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  return { success: true, output: result };
}

export const FIGMA_IMPORT_TOOLS = [
  {
    name: "import_from_figma",
    description: "ייבוא עיצוב מ-Figma — קומפוננטות React + Tailwind אוטומטי",
    input_schema: {
      type: "object" as const,
      properties: {
        figmaUrl: { type: "string", description: "URL של קובץ Figma" },
        token: { type: "string", description: "Figma API token" },
      },
      required: ["figmaUrl", "token"] as string[],
    },
  },
  {
    name: "import_from_figma_json",
    description: "ייבוא מ-Figma JSON — המרה לקומפוננטות React",
    input_schema: {
      type: "object" as const,
      properties: {
        figmaJSON: { type: "string", description: "Figma JSON data" },
      },
      required: ["figmaJSON"] as string[],
    },
  },
  {
    name: "figma_to_react",
    description: "המרת קומפוננטת Figma בודדת ל-React + Tailwind",
    input_schema: {
      type: "object" as const,
      properties: {
        componentJSON: { type: "string", description: "JSON של קומפוננטה" },
      },
      required: ["componentJSON"] as string[],
    },
  },
  {
    name: "css_to_tailwind",
    description: "המרת CSS ל-Tailwind CSS classes",
    input_schema: {
      type: "object" as const,
      properties: {
        cssCode: { type: "string", description: "קוד CSS להמרה" },
      },
      required: ["cssCode"] as string[],
    },
  },
];
