#!/usr/bin/env node
/**
 * verify-routes.ts
 *
 * Post-build smoke test for the ERP app.
 *
 * Phase 1 – Static analysis:
 *   1. Parses App.tsx to extract every lazyPage(() => import(...)) declaration,
 *      building a map of  ComponentName → importPath.
 *   2. Parses App.tsx to extract every <Route path="..." component={Name} />
 *      declaration, building a map of  routePath → ComponentName.
 *   3. Joins the two maps:  routePath → importPath.
 *   4. Uses the Vite build manifest (dist/public/.vite/manifest.json) for a
 *      deterministic importPath → chunk file lookup.
 *   5. Hard fails (exit 1) on ANY route whose import path is not found in the
 *      manifest.
 *
 * Phase 2 – HTTP smoke test (--http flag):
 *   Performs HTTP GET against:
 *     - The SPA root (/)
 *     - The chunk file URL for every matched route
 *     - Every other .js file in dist/public/assets/ (vendor/shared chunks)
 *   Exits with code 1 if ANY request returns non-200.
 *
 * Exit code 0 = all OK, exit code 1 = one or more failures.
 *
 * Usage:
 *   pnpm --filter @workspace/erp-app verify-routes
 *   PORT=23023 pnpm --filter @workspace/erp-app verify-routes -- --http
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST_PUBLIC = path.join(ROOT, "dist", "public");
const DIST_ASSETS = path.join(DIST_PUBLIC, "assets");
const MANIFEST_PATH = path.join(DIST_PUBLIC, ".vite", "manifest.json");
const APP_TSX = path.join(ROOT, "src", "App.tsx");

const doHttpCheck = process.argv.includes("--http");
const BASE_URL =
  process.env.BASE_URL ||
  `http://localhost:${process.env.PORT || "23023"}`;
const BASE_PATH = (process.env.BASE_PATH || "/").replace(/\/$/, "");

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Extract a map of  ComponentVariableName → aliased import path
 * from lazyPage(() => import("@/pages/...")) declarations.
 */
function extractLazyImports(source: string): Map<string, string> {
  const map = new Map<string, string>();
  // Matches: const SomeName = lazyPage(() => import("@/pages/..."))
  const pattern =
    /const\s+(\w+)\s*=\s*lazyPage\(\s*\(\s*\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

/**
 * Extract a list of { routePath, componentName } from all Route forms in App.tsx.
 *
 * Handled forms:
 *  1. component={ComponentName}         — direct lazy/named component
 *  2. component={() => <ComponentName   — lambda wrapping a lazy component
 *  3. <Route path="...">
 *       {(params) => <ComponentName     — child-render function
 *     </Route>
 *
 * Skips pure Redirect routes (no component or child component found).
 * Includes static, dynamic (:param), and wildcard (:rest*) path forms.
 */
function extractRouteDeclarations(
  source: string
): Array<{ routePath: string; componentName: string }> {
  const routes: Array<{ routePath: string; componentName: string }> = [];

  // Form 1: component={ComponentName}
  const directPattern =
    /<Route\s+path=["']([^"']+)["'][^>]*component=\{(\w+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = directPattern.exec(source)) !== null) {
    routes.push({ routePath: match[1], componentName: match[2] });
  }

  // Form 2: component={() => <ComponentName ...  (lambda wrapper)
  // e.g. component={() => <BuilderSection section="entities" />}
  const lambdaPattern =
    /<Route\s+path=["']([^"']+)["'][^>]*component=\{[^}]*=>\s*<(\w+)[^}]*\}/g;
  while ((match = lambdaPattern.exec(source)) !== null) {
    // Skip if already captured by Form 1 (same path+component combo)
    const routePath = match[1];
    const componentName = match[2];
    if (!routes.some((r) => r.routePath === routePath && r.componentName === componentName)) {
      routes.push({ routePath, componentName });
    }
  }

  // Form 3: child-render — <Route path="...">...<ComponentName ... /></Route>
  // Matches the first JSX component used inside a Route's child render function
  const childRenderPattern =
    /<Route\s+path=["']([^"']+)["'][^/]*>\s*\{[^}]*=>\s*<(\w+)[^<]*<\/Route>/gs;
  while ((match = childRenderPattern.exec(source)) !== null) {
    const routePath = match[1];
    const componentName = match[2];
    if (!routes.some((r) => r.routePath === routePath && r.componentName === componentName)) {
      routes.push({ routePath, componentName });
    }
  }

  return routes;
}

// ─── Vite manifest helpers ────────────────────────────────────────────────────

type ManifestEntry = {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
};
type Manifest = Record<string, ManifestEntry>;

/**
 * Resolve an @/pages/... import path to the corresponding chunk filename
 * using the Vite build manifest.
 *
 * Vite manifest keys use the src-relative path, e.g.
 *   "src/pages/finance/invoices.tsx" → { file: "assets/invoices-Bz3kXgHi.js" }
 *
 * The importPath is the @-aliased version ("@/pages/finance/invoices").
 * We normalise both sides for the comparison.
 */
function resolveChunkFromManifest(
  importPath: string,
  manifest: Manifest
): ManifestEntry | undefined {
  // Strip @/ prefix → src/...
  const relative = importPath.replace(/^@\//, "src/");

  // Try exact match with common extensions
  for (const ext of ["", ".tsx", ".ts", ".jsx", ".js"]) {
    const key = `${relative}${ext}`;
    if (manifest[key]) return manifest[key];
  }
  return undefined;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let exitCode = 0;
  console.log("=== ERP App Route & Chunk Verification ===\n");

  // ── 0. Check prerequisites ────────────────────────────────────────────────
  if (!fs.existsSync(APP_TSX)) {
    console.error(`FAIL: App.tsx not found at ${APP_TSX}`);
    process.exit(1);
  }
  if (!fs.existsSync(DIST_ASSETS)) {
    console.error(
      `FAIL: dist/public/assets not found at ${DIST_ASSETS}\n` +
        `      Run 'pnpm --filter @workspace/erp-app build' first.`
    );
    process.exit(1);
  }
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      `FAIL: Vite manifest not found at ${MANIFEST_PATH}\n` +
        `      Ensure vite.config.ts has 'build.manifest: true' and rebuild.`
    );
    process.exit(1);
  }

  // ── 1. Parse App.tsx ──────────────────────────────────────────────────────
  const source = fs.readFileSync(APP_TSX, "utf-8");
  const lazyImports = extractLazyImports(source); // ComponentName → importPath
  const routeDeclarations = extractRouteDeclarations(source); // { routePath, componentName }[]

  console.log(`Lazy imports found        : ${lazyImports.size}`);
  console.log(`Route declarations found  : ${routeDeclarations.length}`);

  // Build: routePath → importPath
  const routeToImport = new Map<string, string>();
  const unmappedComponents: string[] = [];
  for (const { routePath, componentName } of routeDeclarations) {
    const importPath = lazyImports.get(componentName);
    if (importPath) {
      routeToImport.set(routePath, importPath);
    } else {
      // Component defined inline (not lazy) — not a chunk concern
      unmappedComponents.push(`${routePath} → ${componentName} (not lazy)`);
    }
  }

  console.log(`Routes with lazy component : ${routeToImport.size}`);
  if (unmappedComponents.length > 0) {
    console.log(
      `Routes with inline component: ${unmappedComponents.length} (skipped — no chunk needed)`
    );
  }
  console.log();

  // ── 2. Load Vite manifest ─────────────────────────────────────────────────
  const manifest: Manifest = JSON.parse(
    fs.readFileSync(MANIFEST_PATH, "utf-8")
  );
  console.log(`Manifest entries          : ${Object.keys(manifest).length}`);
  console.log();

  // ── 3. Validate every route → chunk (manifest + disk existence) ──────────
  const missingChunks: Array<{ routePath: string; importPath: string; reason: string }> = [];
  const resolvedRoutes: Array<{
    routePath: string;
    importPath: string;
    chunkFile: string;
  }> = [];

  for (const [routePath, importPath] of routeToImport) {
    const entry = resolveChunkFromManifest(importPath, manifest);
    if (!entry) {
      missingChunks.push({
        routePath,
        importPath,
        reason: "not found in Vite manifest",
      });
      continue;
    }
    // Verify the chunk file actually exists on disk
    const chunkPath = path.join(DIST_PUBLIC, entry.file);
    if (!fs.existsSync(chunkPath)) {
      missingChunks.push({
        routePath,
        importPath,
        reason: `manifest references ${entry.file} but file missing from dist/public/`,
      });
      continue;
    }
    resolvedRoutes.push({ routePath, importPath, chunkFile: entry.file });
  }

  if (missingChunks.length > 0) {
    console.error(
      `FAIL: ${missingChunks.length} route(s) have missing or unresolvable chunks:\n`
    );
    for (const { routePath, importPath, reason } of missingChunks) {
      console.error(`  ${routePath}  ←  ${importPath}`);
      console.error(`    Reason: ${reason}`);
    }
    console.error();
    exitCode = 1;
  } else {
    console.log(
      `OK: All ${resolvedRoutes.length} lazy routes resolved to a chunk on disk.\n`
    );
  }

  // ── 4. HTTP smoke test ────────────────────────────────────────────────────
  if (doHttpCheck) {
    console.log(`=== HTTP Smoke Test against ${BASE_URL} ===\n`);
    let httpFailures = 0;

    // SPA root
    const rootRes = await httpGet(`${BASE_URL}/`);
    if (rootRes.ok) {
      console.log(`  OK    GET /  →  HTTP ${rootRes.status}`);
    } else {
      console.error(`  FAIL  GET /  →  HTTP ${rootRes.status}`);
      httpFailures++;
    }

    // All JS assets (route chunks + vendor/shared chunks)
    const jsAssets = fs
      .readdirSync(DIST_ASSETS)
      .filter((f) => f.endsWith(".js"));

    for (const jsFile of jsAssets) {
      const url = `${BASE_URL}${BASE_PATH}/assets/${jsFile}`;
      const res = await httpGet(url);
      if (res.ok) {
        console.log(`  OK    GET /assets/${jsFile}  →  HTTP ${res.status}`);
      } else {
        console.error(`  FAIL  GET /assets/${jsFile}  →  HTTP ${res.status}`);
        httpFailures++;
      }
    }

    console.log();
    if (httpFailures > 0) {
      console.error(
        `HTTP check: ${httpFailures} failure(s) out of ${jsAssets.length + 1} requests`
      );
      exitCode = 1;
    } else {
      console.log(
        `HTTP check: all ${jsAssets.length + 1} requests returned 200`
      );
    }
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("\n=== Summary ===");
  console.log(`  Lazy imports         : ${lazyImports.size}`);
  console.log(`  Route declarations   : ${routeDeclarations.length}`);
  console.log(`    (includes direct, lambda-wrapper, and child-render forms)`);
  console.log(`  Routes resolved      : ${resolvedRoutes.length}`);
  console.log(`  Missing chunks       : ${missingChunks.length}`);
  console.log(`  Inline (non-lazy)    : ${unmappedComponents.length}`);
  console.log();

  if (exitCode !== 0) {
    console.error("RESULT: FAILED");
    process.exit(1);
  }
  console.log("RESULT: PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
