import { writeFile } from "./fileTool";

interface SearchDoc { id: string; content: Record<string, any>; score?: number }
const indexes = new Map<string, SearchDoc[]>();

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\sא-ת]/g, "").split(/\s+/).filter(Boolean);
}

export async function createSearchIndex(params: { name: string }): Promise<{ success: boolean; output: string }> {
  indexes.set(params.name, []);
  return { success: true, output: `Created search index "${params.name}"` };
}

export async function indexDocument(params: { index: string; id: string; document: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  if (!indexes.has(params.index)) indexes.set(params.index, []);
  const docs = indexes.get(params.index)!;
  const existing = docs.findIndex(d => d.id === params.id);
  if (existing >= 0) docs[existing] = { id: params.id, content: params.document };
  else docs.push({ id: params.id, content: params.document });
  return { success: true, output: `Indexed document "${params.id}" in "${params.index}"` };
}

export async function searchDocuments(params: { index: string; query: string; limit?: number; fields?: string[] }): Promise<{ success: boolean; output: string }> {
  const docs = indexes.get(params.index);
  if (!docs) return { success: false, output: `Index "${params.index}" not found` };

  const queryTokens = tokenize(params.query);
  const results: SearchDoc[] = [];

  for (const doc of docs) {
    let score = 0;
    const searchFields = params.fields || Object.keys(doc.content);
    for (const field of searchFields) {
      const val = doc.content[field];
      if (typeof val !== "string") continue;
      const fieldTokens = tokenize(val);
      for (const qt of queryTokens) {
        for (const ft of fieldTokens) {
          if (ft === qt) score += 10;
          else if (ft.includes(qt)) score += 5;
          else if (qt.includes(ft)) score += 3;
        }
      }
    }
    if (score > 0) results.push({ ...doc, score });
  }

  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  const limited = results.slice(0, params.limit || 20);
  return { success: true, output: limited.length ? limited.map(d => `[${d.score}] ${d.id}: ${JSON.stringify(d.content).slice(0, 200)}`).join("\n") : "No results found" };
}

export async function removeDocument(params: { index: string; id: string }): Promise<{ success: boolean; output: string }> {
  const docs = indexes.get(params.index);
  if (!docs) return { success: false, output: `Index "${params.index}" not found` };
  const idx = docs.findIndex(d => d.id === params.id);
  if (idx < 0) return { success: false, output: `Document "${params.id}" not found` };
  docs.splice(idx, 1);
  return { success: true, output: `Removed "${params.id}" from "${params.index}"` };
}

export async function getIndexStats(params: { index?: string }): Promise<{ success: boolean; output: string }> {
  if (params.index) {
    const docs = indexes.get(params.index);
    return { success: true, output: docs ? `Index "${params.index}": ${docs.length} documents` : `Index "${params.index}" not found` };
  }
  return { success: true, output: Array.from(indexes.entries()).map(([name, docs]) => `${name}: ${docs.length} documents`).join("\n") || "No indexes" };
}

export async function generateMeiliSearchSetup(): Promise<{ success: boolean; output: string }> {
  const code = `import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({ host: process.env.MEILI_HOST || 'http://localhost:7700', apiKey: process.env.MEILI_KEY });

export async function indexDocuments(indexName: string, documents: any[]) {
  const index = client.index(indexName);
  return index.addDocuments(documents);
}

export async function search(indexName: string, query: string, options?: { limit?: number; filter?: string; sort?: string[] }) {
  const index = client.index(indexName);
  return index.search(query, options);
}

export async function deleteDocument(indexName: string, id: string) {
  return client.index(indexName).deleteDocument(id);
}
`;
  await writeFile({ path: "src/search/meilisearch.ts", content: code });
  return { success: true, output: "MeiliSearch setup generated → src/search/meilisearch.ts" };
}

export const SEARCH_ENGINE_TOOLS = [
  { name: "create_search_index", description: "Create a full-text search index", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
  { name: "index_document", description: "Index a document for full-text search", input_schema: { type: "object" as const, properties: { index: { type: "string" }, id: { type: "string" }, document: { type: "object" } }, required: ["index", "id", "document"] as string[] } },
  { name: "search_documents", description: "Full-text search with relevance scoring (supports Hebrew)", input_schema: { type: "object" as const, properties: { index: { type: "string" }, query: { type: "string" }, limit: { type: "number" }, fields: { type: "array", items: { type: "string" } } }, required: ["index", "query"] as string[] } },
  { name: "remove_document", description: "Remove a document from a search index", input_schema: { type: "object" as const, properties: { index: { type: "string" }, id: { type: "string" } }, required: ["index", "id"] as string[] } },
  { name: "get_index_stats", description: "Get search index statistics", input_schema: { type: "object" as const, properties: { index: { type: "string" } }, required: [] as string[] } },
  { name: "generate_meilisearch_setup", description: "Generate MeiliSearch integration code", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];