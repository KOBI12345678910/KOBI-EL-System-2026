import { runCommand } from "./terminalTool";
import { writeFile } from "./fileTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

async function ensureSharp(): Promise<void> {
  const check = await runCommand({ command: "node -e \"require('sharp')\"", timeout: 5000 });
  if (!check.success) {
    await runCommand({ command: "npm install sharp", timeout: 60000 });
  }
}

export async function optimizeImage(params: { filePath: string; quality?: number; width?: number; height?: number; format?: string }): Promise<{ success: boolean; output: string }> {
  const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(WORKSPACE_DIR, params.filePath);
  if (!fs.existsSync(fullPath)) return { success: false, output: `File not found: ${params.filePath}` };

  await ensureSharp();
  const origSize = fs.statSync(fullPath).size;
  const fmt = params.format || "webp";
  const outPath = fullPath.replace(/\.[^.]+$/, `.optimized.${fmt}`);
  const q = params.quality || 80;

  const script = `
const sharp = require('sharp');
const fs = require('fs');
async function run() {
  let p = sharp('${fullPath.replace(/'/g, "\\'")}');
  ${params.width || params.height ? `p = p.resize(${params.width || "null"}, ${params.height || "null"}, { fit: 'inside', withoutEnlargement: true });` : ""}
  ${fmt === "jpeg" || fmt === "jpg" ? `p = p.jpeg({ quality: ${q}, mozjpeg: true });` : ""}
  ${fmt === "png" ? `p = p.png({ quality: ${q}, compressionLevel: 9 });` : ""}
  ${fmt === "avif" ? `p = p.avif({ quality: ${q} });` : ""}
  ${fmt === "webp" ? `p = p.webp({ quality: ${q} });` : ""}
  await p.toFile('${outPath.replace(/'/g, "\\'")}');
  const newSize = fs.statSync('${outPath.replace(/'/g, "\\'")}').size;
  console.log(JSON.stringify({ newSize }));
}
run().catch(e => { console.error(e.message); process.exit(1); });
`;
  fs.writeFileSync("/tmp/_img_opt.js", script);
  const result = await runCommand({ command: "node /tmp/_img_opt.js", timeout: 30000 });

  if (fs.existsSync(outPath)) {
    const newSize = fs.statSync(outPath).size;
    const saved = Math.round((1 - newSize / origSize) * 100);
    return { success: true, output: `Optimized: ${params.filePath}\n  ${(origSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (${saved}% saved)\n  Output: ${outPath}` };
  }
  return { success: false, output: `Optimization failed: ${result.stderr || "unknown error"}` };
}

export async function optimizeBatch(params: { directory: string; format?: string; quality?: number }): Promise<{ success: boolean; output: string }> {
  const dir = path.isAbsolute(params.directory) ? params.directory : path.join(WORKSPACE_DIR, params.directory);
  if (!fs.existsSync(dir)) return { success: false, output: `Directory not found: ${params.directory}` };

  const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i.test(f));
  if (!files.length) return { success: true, output: "No image files found" };

  const results: string[] = [];
  for (const file of files.slice(0, 50)) {
    const r = await optimizeImage({ filePath: path.join(params.directory, file), format: params.format, quality: params.quality });
    results.push(`${file}: ${r.success ? "OK" : "FAILED"}`);
  }
  return { success: true, output: `Processed ${files.length} images:\n${results.join("\n")}` };
}

export async function generateResponsiveImages(params: { filePath: string; sizes: number[] }): Promise<{ success: boolean; output: string }> {
  const results: string[] = [];
  for (const width of params.sizes) {
    const r = await optimizeImage({ filePath: params.filePath, width, format: "webp" });
    results.push(`${width}px: ${r.success ? "OK" : "FAILED"}`);
  }
  return { success: true, output: `Generated responsive images:\n${results.join("\n")}` };
}

export async function convertToWebP(params: { directory: string; quality?: number }): Promise<{ success: boolean; output: string }> {
  return optimizeBatch({ directory: params.directory, format: "webp", quality: params.quality || 80 });
}

export async function generateFavicons(params: { sourcePath: string; outputDir?: string }): Promise<{ success: boolean; output: string }> {
  const src = path.isAbsolute(params.sourcePath) ? params.sourcePath : path.join(WORKSPACE_DIR, params.sourcePath);
  if (!fs.existsSync(src)) return { success: false, output: `Source not found: ${params.sourcePath}` };

  await ensureSharp();
  const outDir = params.outputDir || "public";
  const fullOutDir = path.isAbsolute(outDir) ? outDir : path.join(WORKSPACE_DIR, outDir);
  if (!fs.existsSync(fullOutDir)) fs.mkdirSync(fullOutDir, { recursive: true });

  const sizes = [16, 32, 48, 64, 128, 180, 192, 512];
  const script = `
const sharp = require('sharp');
const sizes = ${JSON.stringify(sizes)};
const src = '${src.replace(/'/g, "\\'")}';
const outDir = '${fullOutDir.replace(/'/g, "\\'")}';

async function gen() {
  for (const size of sizes) {
    const name = size === 180 ? 'apple-touch-icon.png' :
                 size === 192 ? 'android-chrome-192x192.png' :
                 size === 512 ? 'android-chrome-512x512.png' :
                 'favicon-' + size + 'x' + size + '.png';
    await sharp(src).resize(size, size).png().toFile(outDir + '/' + name);
    console.log(name);
  }
  await sharp(src).resize(32, 32).toFile(outDir + '/favicon.ico');
  console.log('favicon.ico');
}
gen().catch(e => { console.error(e.message); process.exit(1); });
`;
  fs.writeFileSync("/tmp/_favicon_gen.js", script);
  const result = await runCommand({ command: "node /tmp/_favicon_gen.js", timeout: 30000 });

  const manifest = {
    name: "App", short_name: "App",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    theme_color: "#ffffff", background_color: "#ffffff", display: "standalone",
  };
  fs.writeFileSync(path.join(fullOutDir, "site.webmanifest"), JSON.stringify(manifest, null, 2));

  const generated = (result.stdout || "").split("\n").filter(Boolean);
  generated.push("site.webmanifest");
  return { success: true, output: `Generated ${generated.length} favicon files:\n${generated.map(f => `  ✓ ${f}`).join("\n")}` };
}

export async function generateOGImage(params: { title: string; subtitle?: string; bgColor?: string; textColor?: string; outputPath?: string }): Promise<{ success: boolean; output: string }> {
  await ensureSharp();
  const width = 1200, height = 630;
  const bg = params.bgColor || "#1a1a2e";
  const text = params.textColor || "#ffffff";
  const output = params.outputPath || "public/og-image.png";
  const fullOutput = path.isAbsolute(output) ? output : path.join(WORKSPACE_DIR, output);
  const outDir = path.dirname(fullOutput);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="50%" y="45%" font-family="sans-serif" font-size="56" font-weight="bold" fill="${text}" text-anchor="middle" dominant-baseline="middle">${escXml(params.title)}</text>
  ${params.subtitle ? `<text x="50%" y="60%" font-family="sans-serif" font-size="28" fill="${text}99" text-anchor="middle">${escXml(params.subtitle)}</text>` : ""}
</svg>`;

  const script = `
const sharp = require('sharp');
const svg = Buffer.from(\`${svg.replace(/`/g, "\\`")}\`);
sharp(svg).resize(${width}, ${height}).png().toFile('${fullOutput.replace(/'/g, "\\'")}').then(() => console.log('OK'));
`;
  fs.writeFileSync("/tmp/_og_gen.js", script);
  await runCommand({ command: "node /tmp/_og_gen.js", timeout: 15000 });

  if (fs.existsSync(fullOutput)) {
    return { success: true, output: `OG Image generated → ${output}\n  ${width}x${height}, title: "${params.title}"` };
  }
  return { success: false, output: "OG image generation failed" };
}

export async function generatePlaceholder(params: { width: number; height: number; text?: string; outputPath?: string }): Promise<{ success: boolean; output: string }> {
  const label = params.text || `${params.width}x${params.height}`;
  const svg = `<svg width="${params.width}" height="${params.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#e0e0e0"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#999" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;

  const output = params.outputPath || `/tmp/placeholder-${params.width}x${params.height}.svg`;
  const fullOutput = path.isAbsolute(output) ? output : path.join(WORKSPACE_DIR, output);
  fs.writeFileSync(fullOutput, svg);
  return { success: true, output: `Placeholder generated → ${output} (${params.width}x${params.height})` };
}

export const IMAGE_OPTIMIZATION_TOOLS = [
  { name: "optimize_image", description: "Optimize an image: resize, compress, convert format using Sharp", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, quality: { type: "number", description: "Quality 1-100 (default 80)" }, width: { type: "number" }, height: { type: "number" }, format: { type: "string", enum: ["webp", "png", "jpg", "jpeg", "avif"] } }, required: ["filePath"] as string[] } },
  { name: "optimize_batch", description: "Batch optimize all images in a directory", input_schema: { type: "object" as const, properties: { directory: { type: "string" }, format: { type: "string" }, quality: { type: "number" } }, required: ["directory"] as string[] } },
  { name: "generate_responsive_images", description: "Generate multiple sizes of an image for responsive design", input_schema: { type: "object" as const, properties: { filePath: { type: "string" }, sizes: { type: "array", items: { type: "number" }, description: "Width sizes e.g. [320, 640, 1024, 1920]" } }, required: ["filePath", "sizes"] as string[] } },
  { name: "convert_to_webp", description: "Convert all images in a directory to WebP format", input_schema: { type: "object" as const, properties: { directory: { type: "string" }, quality: { type: "number" } }, required: ["directory"] as string[] } },
  { name: "generate_favicons", description: "Generate all favicon sizes (16-512px) + apple-touch-icon + manifest from a source image", input_schema: { type: "object" as const, properties: { sourcePath: { type: "string", description: "Source image (ideally 512x512+ PNG)" }, outputDir: { type: "string", description: "Output directory (default: public)" } }, required: ["sourcePath"] as string[] } },
  { name: "generate_og_image", description: "Generate an Open Graph image (1200x630) with title and subtitle", input_schema: { type: "object" as const, properties: { title: { type: "string" }, subtitle: { type: "string" }, bgColor: { type: "string", description: "Background color (default: #1a1a2e)" }, textColor: { type: "string", description: "Text color (default: #ffffff)" }, outputPath: { type: "string" } }, required: ["title"] as string[] } },
  { name: "generate_placeholder", description: "Generate an SVG placeholder image with dimensions label", input_schema: { type: "object" as const, properties: { width: { type: "number" }, height: { type: "number" }, text: { type: "string" }, outputPath: { type: "string" } }, required: ["width", "height"] as string[] } },
];