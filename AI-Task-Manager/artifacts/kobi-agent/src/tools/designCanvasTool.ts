import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile, readFile, createDirectory } from "./fileTool";

export interface DesignVariant {
  id: string;
  name: string;
  code: string;
  selected: boolean;
}

export interface DesignElement {
  id: string;
  type: string;
  name: string;
  variants: DesignVariant[];
}

const elements = new Map<string, DesignElement>();
const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function generateDesignVariants(params: {
  description: string;
  count?: number;
  style?: string;
}): Promise<{ success: boolean; output: string; variants?: DesignVariant[] }> {
  const count = params.count || 3;
  const style = params.style || "modern";

  console.log(`\n🎨 Generating ${count} design variants: ${params.description.slice(0, 60)}...`);

  const response = await callLLM({
    system: `You are a UI/UX designer. Generate ${count} distinct design variants as React components with Tailwind CSS.
Each variant should have a meaningfully different visual approach:
- Variant 1: ${style} with emphasis on whitespace
- Variant 2: Bold, with strong visual hierarchy
- Variant 3: Creative/unique approach

Rules:
- Use Tailwind CSS only (no custom CSS)
- Mobile responsive
- Dark mode compatible (use dark: prefix)
- Include hover/active states
- Each variant must be a complete, self-contained React component
- RTL support for Hebrew text

Respond with JSON:
{
  "variants": [
    {
      "name": "descriptive name",
      "description": "design approach",
      "code": "complete React/TSX code"
    }
  ]
}`,
    messages: [{ role: "user", content: `Generate ${count} design variants for: ${params.description}\nStyle: ${style}` }],
    maxTokens: 8192,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed?.variants) return { success: false, output: "Failed to generate variants" };

  const variants: DesignVariant[] = [];
  const elementId = `el_${Date.now()}`;

  for (let i = 0; i < parsed.variants.length; i++) {
    const v = parsed.variants[i];
    variants.push({
      id: `var_${Date.now()}_${i}`,
      name: v.name,
      code: v.code,
      selected: i === 0,
    });
  }

  elements.set(elementId, {
    id: elementId,
    type: "component",
    name: params.description,
    variants,
  });

  const lines = [
    `## Design Variants (${variants.length})`,
    `**Element ID**: ${elementId}`,
    ``,
    ...variants.map((v, i) => `### ${i + 1}. ${v.name} [${v.id}]${v.selected ? " ✅" : ""}\n\`\`\`tsx\n${v.code.slice(0, 200)}...\n\`\`\``),
  ];

  return { success: true, output: lines.join("\n"), variants };
}

export async function applyDesignVariant(params: {
  variantId: string;
  targetFile: string;
}): Promise<{ success: boolean; output: string }> {
  let variant: DesignVariant | undefined;

  for (const [, element] of elements) {
    variant = element.variants.find(v => v.id === params.variantId);
    if (variant) break;
  }

  if (!variant) return { success: false, output: `Variant ${params.variantId} not found` };

  let code = variant.code;
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const targetPath = params.targetFile.startsWith("/") ? params.targetFile : `${WORKSPACE}/${params.targetFile}`;
  const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  await createDirectory({ path: dir });
  await writeFile({ path: targetPath, content: code });

  return { success: true, output: `Variant "${variant.name}" applied to ${params.targetFile}` };
}

export async function generatePageDesign(params: {
  pageName: string;
  sections: string[];
  style?: string;
  primaryColor?: string;
  secondaryColor?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n🎨 Designing page: ${params.pageName}`);

  const response = await callLLM({
    system: `Design a complete page with all sections. Use React + Tailwind CSS.
Include: responsive design, animations, proper spacing, typography hierarchy.
RTL support for Hebrew text. Dark mode compatible.
Respond with ONLY the complete TSX code.`,
    messages: [{
      role: "user",
      content: `Design page "${params.pageName}" with sections: ${params.sections.join(", ")}
Style: ${params.style || "modern"}
${params.primaryColor ? `Brand colors: primary=${params.primaryColor}, secondary=${params.secondaryColor || "#666"}` : ""}`,
    }],
    maxTokens: 8192,
  });

  let code = extractTextContent(response.content);
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const filePath = `${WORKSPACE}/src/pages/${params.pageName}.tsx`;
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await createDirectory({ path: dir });
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `Page "${params.pageName}" created at ${filePath} with ${params.sections.length} sections` };
}

export async function convertToMobile(params: {
  componentPath: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n📱 Converting to mobile: ${params.componentPath}`);

  const content = await readFile({ path: params.componentPath });
  if (!content.success) return { success: false, output: `Cannot read: ${params.componentPath}` };

  const response = await callLLM({
    system: `Convert this web React component to React Native (Expo).
Rules:
- Replace HTML elements with RN components (View, Text, ScrollView, TouchableOpacity, etc.)
- Replace Tailwind with StyleSheet
- Use SafeAreaView
- Handle platform differences
- Keep all functionality
- RTL support
Respond with ONLY the React Native code.`,
    messages: [{
      role: "user",
      content: `Convert to React Native:\n\`\`\`\n${content.output}\n\`\`\``,
    }],
    maxTokens: 8192,
  });

  let mobileCode = extractTextContent(response.content);
  mobileCode = mobileCode.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const mobilePath = params.componentPath
    .replace("/pages/", "/mobile/")
    .replace("/components/", "/mobile/");

  const dir = mobilePath.substring(0, mobilePath.lastIndexOf("/"));
  await createDirectory({ path: dir });
  await writeFile({ path: mobilePath, content: mobileCode });

  return { success: true, output: `Mobile version created at ${mobilePath}` };
}

export async function listDesignElements(params: {}): Promise<{ success: boolean; output: string }> {
  if (elements.size === 0) return { success: true, output: "No design elements yet" };

  const lines = [
    `## Design Elements (${elements.size})`,
    ``,
    ...Array.from(elements.values()).map(el => {
      const selected = el.variants.find(v => v.selected);
      return `- **${el.name}** [${el.id}] — ${el.type} — ${el.variants.length} variants${selected ? ` — selected: ${selected.name}` : ""}`;
    }),
  ];

  return { success: true, output: lines.join("\n") };
}

export const DESIGN_CANVAS_TOOLS = [
  {
    name: "generate_design_variants",
    description: "יצירת וריאנטים עיצוביים — AI מייצר 2-5 גרסאות שונות של קומפוננט React+Tailwind",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "תיאור הקומפוננט" },
        count: { type: "number", description: "כמות וריאנטים (ברירת מחדל: 3)" },
        style: { type: "string", description: "סגנון: minimal, modern, playful, corporate, dark" },
      },
      required: ["description"] as string[],
    },
  },
  {
    name: "apply_design_variant",
    description: "החלת וריאנט עיצובי נבחר לקובץ יעד",
    input_schema: {
      type: "object" as const,
      properties: {
        variantId: { type: "string", description: "ID הוריאנט" },
        targetFile: { type: "string", description: "נתיב קובץ יעד" },
      },
      required: ["variantId", "targetFile"] as string[],
    },
  },
  {
    name: "generate_page_design",
    description: "עיצוב דף שלם — AI מייצר React page עם כל הסקשנים, responsive, dark mode",
    input_schema: {
      type: "object" as const,
      properties: {
        pageName: { type: "string", description: "שם הדף" },
        sections: { type: "array", items: { type: "string" }, description: "רשימת סקשנים" },
        style: { type: "string", description: "סגנון עיצוב" },
        primaryColor: { type: "string", description: "צבע ראשי" },
        secondaryColor: { type: "string", description: "צבע משני" },
      },
      required: ["pageName", "sections"] as string[],
    },
  },
  {
    name: "convert_web_to_mobile",
    description: "המרת קומפוננט React web ל-React Native (Expo) — AI ממיר HTML→RN, Tailwind→StyleSheet",
    input_schema: {
      type: "object" as const,
      properties: {
        componentPath: { type: "string", description: "נתיב קומפוננט web" },
      },
      required: ["componentPath"] as string[],
    },
  },
  {
    name: "list_design_elements",
    description: "רשימת אלמנטים עיצוביים ווריאנטים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
