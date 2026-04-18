import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";

export async function generateDataGrid(params: { name: string; columns: Array<{ field: string; header: string; type?: string; sortable?: boolean; filterable?: boolean; width?: number }>; apiEndpoint?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React data grid/table component. Requirements:
- TypeScript, Tailwind CSS, dark theme (bg-gray-800/900, text-white)
- RTL support, Hebrew headers
- Features: sorting, filtering, pagination, row selection, column resize
- Loading skeleton state
- Export to CSV button
- Responsive: horizontal scroll on mobile
- Use @tanstack/react-table or custom implementation
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: `DataGrid "${params.name}":\nColumns: ${JSON.stringify(params.columns, null, 2)}${params.apiEndpoint ? `\nAPI: ${params.apiEndpoint}` : ""}` }],
    maxTokens: 6000,
  });
  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `src/components/grids/${params.name}Grid.tsx`;
  await writeFile({ path: filePath, content: code });
  return { success: true, output: `DataGrid generated → ${filePath}\nColumns: ${params.columns.map(c => c.header).join(", ")}` };
}

export async function generateDataGridFromTable(params: { tableName: string; columns: string[] }): Promise<{ success: boolean; output: string }> {
  const cols = params.columns.map(c => ({ field: c, header: c, type: "string", sortable: true, filterable: true }));
  return generateDataGrid({ name: params.tableName, columns: cols, apiEndpoint: `/api/${params.tableName.toLowerCase()}` });
}

export const DATA_GRID_TOOLS = [
  { name: "generate_data_grid", description: "Generate an advanced data grid component with sorting, filtering, pagination, and CSV export", input_schema: { type: "object" as const, properties: { name: { type: "string" }, columns: { type: "array", items: { type: "object", properties: { field: { type: "string" }, header: { type: "string" }, type: { type: "string" }, sortable: { type: "boolean" }, filterable: { type: "boolean" }, width: { type: "number" } } } }, apiEndpoint: { type: "string" } }, required: ["name", "columns"] as string[] } },
  { name: "generate_data_grid_from_table", description: "Generate a data grid from a database table name and columns", input_schema: { type: "object" as const, properties: { tableName: { type: "string" }, columns: { type: "array", items: { type: "string" } } }, required: ["tableName", "columns"] as string[] } },
];