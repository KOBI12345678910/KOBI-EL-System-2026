import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, createDirectory } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function generateSlides(params: {
  topic: string;
  slideCount?: number;
  style?: string;
}): Promise<{ success: boolean; output: string; filePath: string }> {
  console.log("\n📊 מייצר מצגת...");
  const count = params.slideCount || 10;
  const style = params.style || "minimal";

  const response = await callLLM({
    system: `Generate a slide deck as a single HTML file using Reveal.js.
Include: ${count} slides, smooth transitions, speaker notes, responsive.
Style: ${style}. Use CDN for Reveal.js.
Respond with ONLY the complete HTML file.`,
    messages: [{ role: "user", content: `Create a slide deck about: ${params.topic}` }],
    maxTokens: 8192,
  });

  let html = extractTextContent(response.content);
  html = html.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `${WORKSPACE}/output/slides-${Date.now()}.html`;
  await createDirectory({ path: `${WORKSPACE}/output` });
  await writeFile({ path: filePath, content: html });

  return { success: true, output: `מצגת נוצרה: ${filePath} (${count} שקפים, סגנון: ${style})`, filePath };
}

export async function generateAnimation(params: {
  description: string;
  width?: number;
  height?: number;
}): Promise<{ success: boolean; output: string; filePath: string }> {
  console.log("\n🎬 מייצר אנימציה...");
  const width = params.width || 1920;
  const height = params.height || 1080;

  const response = await callLLM({
    system: `Generate an HTML5 Canvas animation. Create a self-contained HTML file that:
- Renders ${width}x${height} canvas animation
- Is smooth and visually appealing
- Has controls (play/pause)
- Can be recorded with MediaRecorder API to produce a video
- Uses requestAnimationFrame for smooth animation
Respond with ONLY the complete HTML file.`,
    messages: [{ role: "user", content: `Create animation: ${params.description}` }],
    maxTokens: 8192,
  });

  let html = extractTextContent(response.content);
  html = html.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `${WORKSPACE}/output/animation-${Date.now()}.html`;
  await createDirectory({ path: `${WORKSPACE}/output` });
  await writeFile({ path: filePath, content: html });

  return { success: true, output: `אנימציה נוצרה: ${filePath} (${width}x${height})`, filePath };
}

export async function generateDashboard(params: {
  title: string;
  charts: string;
  layout?: string;
  theme?: string;
}): Promise<{ success: boolean; output: string; filePath: string }> {
  console.log("\n📈 מייצר דשבורד...");

  const response = await callLLM({
    system: `Generate a complete React dashboard component with TypeScript and Tailwind CSS.
Use Recharts for charts. Include: responsive layout, loading states, error handling, refresh button, date range picker.
Theme: ${params.theme || "dark"}. Layout: ${params.layout || "grid"}.
Respond with ONLY the complete TSX code.`,
    messages: [{ role: "user", content: `Generate dashboard "${params.title}":\nCharts: ${params.charts}` }],
    maxTokens: 8192,
  });

  let code = extractTextContent(response.content);
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const fileName = params.title.replace(/\s/g, "");
  const filePath = `${WORKSPACE}/src/components/dashboards/${fileName}.tsx`;
  await createDirectory({ path: `${WORKSPACE}/src/components/dashboards` });
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `דשבורד "${params.title}" נוצר: ${filePath}`, filePath };
}

export async function generateKPICards(params: {
  metrics: string;
}): Promise<{ success: boolean; output: string; filePath: string }> {
  console.log("\n📊 מייצר כרטיסי KPI...");

  const response = await callLLM({
    system: "Generate React KPI card components with Tailwind CSS. Include: animated counters, trend indicators, responsive grid. Dark theme. Respond with ONLY TSX code.",
    messages: [{ role: "user", content: `KPI cards:\n${params.metrics}` }],
    maxTokens: 4096,
  });

  let code = extractTextContent(response.content);
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `${WORKSPACE}/src/components/KPICards.tsx`;
  await createDirectory({ path: `${WORKSPACE}/src/components` });
  await writeFile({ path: filePath, content: code });

  return { success: true, output: `כרטיסי KPI נוצרו: ${filePath}`, filePath };
}

export const CONTENT_GEN_TOOLS = [
  {
    name: "generate_slides",
    description: "יצירת מצגת Reveal.js — שקפים עם מעברים, הערות דובר, עיצוב",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string", description: "נושא המצגת" },
        slideCount: { type: "number", description: "מספר שקפים (ברירת מחדל: 10)" },
        style: { type: "string", description: "corporate, startup, creative, minimal" },
      },
      required: ["topic"] as string[],
    },
  },
  {
    name: "generate_animation",
    description: "יצירת אנימציית HTML5 Canvas — עם שליטה ואפשרות הקלטה",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "תיאור האנימציה" },
        width: { type: "number", description: "רוחב (ברירת מחדל: 1920)" },
        height: { type: "number", description: "גובה (ברירת מחדל: 1080)" },
      },
      required: ["description"] as string[],
    },
  },
  {
    name: "generate_dashboard",
    description: "יצירת דשבורד React + Recharts — גרפים, טבלאות, KPI",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "שם הדשבורד" },
        charts: { type: "string", description: "תיאור הגרפים (JSON או טקסט)" },
        layout: { type: "string", description: "grid, rows, tabs" },
        theme: { type: "string", description: "light, dark" },
      },
      required: ["title", "charts"] as string[],
    },
  },
  {
    name: "generate_kpi_cards",
    description: "יצירת כרטיסי KPI — מונים מונפשים, טרנדים, גריד רספונסיבי",
    input_schema: {
      type: "object" as const,
      properties: {
        metrics: { type: "string", description: "תיאור המדדים (JSON או טקסט חופשי)" },
      },
      required: ["metrics"] as string[],
    },
  },
];
