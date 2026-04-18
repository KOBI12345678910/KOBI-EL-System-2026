import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile, readFile } from "./fileTool";
import { searchCode, findFiles } from "./searchTool";
import { fetchPage } from "./browserTool";

export async function seoAudit(params: { url?: string }): Promise<{ success: boolean; output: string; audit?: any }> {
  let htmlContent = "";

  if (params.url) {
    const result = await fetchPage({ url: params.url });
    htmlContent = result.output || "";
  } else {
    const htmlFiles = await findFiles({ pattern: "*.html" });
    const tsxFiles = await findFiles({ pattern: "*.tsx" });
    const allFiles = [...(htmlFiles.output || "").split("\n"), ...(tsxFiles.output || "").split("\n")].filter(Boolean).slice(0, 10);

    for (const file of allFiles) {
      const content = await readFile({ path: file });
      if (content.success) htmlContent += `\n\n--- ${file} ---\n${content.output}`;
    }
  }

  const response = await callLLM({
    system: `You are an SEO expert. Audit the provided content and return JSON:
{
  "score": 0-100,
  "issues": [{ "severity": "critical|warning|info", "category": "meta|content|technical|performance|mobile|structured-data", "message": "", "fix": "" }],
  "metaTags": { "title": "", "description": "", "og:title": "" },
  "structuredData": false,
  "sitemap": false,
  "robots": false,
  "performance": {}
}`,
    messages: [{ role: "user", content: `Audit SEO for:\n${htmlContent.slice(0, 5000)}` }],
  });

  const audit = extractJSON(extractTextContent(response.content));
  if (!audit) return { success: false, output: "Failed to audit SEO" };

  const criticals = (audit.issues || []).filter((i: any) => i.severity === "critical").length;
  const warnings = (audit.issues || []).filter((i: any) => i.severity === "warning").length;
  return { success: true, output: `SEO Score: ${audit.score}/100\nIssues: ${criticals} critical, ${warnings} warnings\n${(audit.issues || []).map((i: any) => `[${i.severity}] ${i.category}: ${i.message}`).join("\n")}`, audit };
}

export async function generateSitemap(params: { pages: Array<{ url: string; changefreq?: string; priority?: number; lastmod?: string }> }): Promise<{ success: boolean; output: string }> {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${params.pages.map(page => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${page.lastmod || new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>${page.changefreq || "weekly"}</changefreq>
    <priority>${page.priority || 0.8}</priority>
  </url>`).join("\n")}
</urlset>`;

  await writeFile({ path: "public/sitemap.xml", content: sitemap });
  return { success: true, output: `Sitemap generated with ${params.pages.length} URLs at public/sitemap.xml` };
}

export async function generateRobotsTxt(params: { sitemapUrl: string; disallow?: string[]; allow?: string[] }): Promise<{ success: boolean; output: string }> {
  const robots = `User-agent: *
${(params.allow || ["/"]).map(a => `Allow: ${a}`).join("\n")}
${(params.disallow || ["/api/", "/admin/", "/_next/", "/private/"]).map(d => `Disallow: ${d}`).join("\n")}

Sitemap: ${params.sitemapUrl}
`;

  await writeFile({ path: "public/robots.txt", content: robots });
  return { success: true, output: `robots.txt generated at public/robots.txt` };
}

export async function generateMetaTags(params: { title: string; description: string; url: string; image?: string; type?: string }): Promise<{ success: boolean; output: string }> {
  const meta = `<head>
  <title>${params.title}</title>
  <meta name="title" content="${params.title}" />
  <meta name="description" content="${params.description}" />
  <link rel="canonical" href="${params.url}" />
  <meta property="og:type" content="${params.type || "website"}" />
  <meta property="og:url" content="${params.url}" />
  <meta property="og:title" content="${params.title}" />
  <meta property="og:description" content="${params.description}" />
  ${params.image ? `<meta property="og:image" content="${params.image}" />` : ""}
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="${params.url}" />
  <meta property="twitter:title" content="${params.title}" />
  <meta property="twitter:description" content="${params.description}" />
  ${params.image ? `<meta property="twitter:image" content="${params.image}" />` : ""}
</head>`;
  return { success: true, output: meta };
}

export async function generateStructuredData(params: { type: "website" | "article" | "product" | "organization" | "faq"; data: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: "Generate JSON-LD structured data. Respond with ONLY the script tag.",
    messages: [{ role: "user", content: `Generate ${params.type} JSON-LD for: ${JSON.stringify(params.data)}` }],
  });

  let jsonLd = extractTextContent(response.content);
  jsonLd = jsonLd.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  return { success: true, output: jsonLd };
}

export const SEO_TOOLS = [
  { name: "seo_audit", description: "Audit SEO of a URL or local project — score, issues, meta tags, structured data, sitemap check", input_schema: { type: "object" as const, properties: { url: { type: "string", description: "URL to audit (optional, audits local files if omitted)" } }, required: [] as string[] } },
  { name: "generate_sitemap", description: "Generate XML sitemap for the project", input_schema: { type: "object" as const, properties: { pages: { type: "array", items: { type: "object", properties: { url: { type: "string" }, changefreq: { type: "string" }, priority: { type: "number" }, lastmod: { type: "string" } } } } }, required: ["pages"] as string[] } },
  { name: "generate_robots_txt", description: "Generate robots.txt with allow/disallow rules and sitemap URL", input_schema: { type: "object" as const, properties: { sitemapUrl: { type: "string" }, disallow: { type: "array", items: { type: "string" } }, allow: { type: "array", items: { type: "string" } } }, required: ["sitemapUrl"] as string[] } },
  { name: "generate_meta_tags", description: "Generate complete meta tags (SEO, Open Graph, Twitter) for a page", input_schema: { type: "object" as const, properties: { title: { type: "string" }, description: { type: "string" }, url: { type: "string" }, image: { type: "string" }, type: { type: "string" } }, required: ["title", "description", "url"] as string[] } },
  { name: "generate_structured_data", description: "Generate JSON-LD structured data for SEO (website, article, product, organization, FAQ)", input_schema: { type: "object" as const, properties: { type: { type: "string", enum: ["website", "article", "product", "organization", "faq"] }, data: { type: "object", description: "Data for structured data generation" } }, required: ["type", "data"] as string[] } },
];