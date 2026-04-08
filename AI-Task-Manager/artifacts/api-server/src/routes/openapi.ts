/**
 * Swagger UI and OpenAPI spec — development-only routes
 * Mounted at /api/docs via app.use("/api/docs", openapiRouter)
 * Also aliased at /api-docs via app.use("/api-docs", apiDocsRouter)
 */
import { Router, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { generateOpenAPISpec } from "../lib/openapi-spec";
import path from "path";

let cachedSpec: Record<string, unknown> | null = null;

async function buildSpec(): Promise<Record<string, unknown>> {
  const generatedSpec = await generateOpenAPISpec();

  const routesDir = path.join(process.cwd(), "src", "routes");

  let jsdocPaths: Record<string, unknown> = {};
  try {
    const jsdocSpec = swaggerJsdoc({
      definition: {
        openapi: "3.0.3",
        info: { title: "temp", version: "0" },
      },
      apis: [
        path.join(routesDir, "*.ts"),
        path.join(routesDir, "*.js"),
      ],
      failOnErrors: false,
    }) as Record<string, unknown>;
    jsdocPaths = (jsdocSpec.paths as Record<string, unknown>) || {};
  } catch (err) {
    console.warn("[OpenAPI] swagger-jsdoc scan failed:", err instanceof Error ? err.message : String(err));
  }

  const generatedPaths = (generatedSpec.paths as Record<string, unknown>) || {};
  const mergedPaths: Record<string, unknown> = { ...generatedPaths };

  for (const [routePath, methods] of Object.entries(jsdocPaths)) {
    if (mergedPaths[routePath]) {
      mergedPaths[routePath] = { ...(mergedPaths[routePath] as object), ...(methods as object) };
    } else {
      mergedPaths[routePath] = methods;
    }
  }

  console.info(`[OpenAPI] Spec built: ${Object.keys(generatedPaths).length} generated + ${Object.keys(jsdocPaths).length} jsdoc = ${Object.keys(mergedPaths).length} total paths`);

  return {
    ...generatedSpec,
    paths: mergedPaths,
  };
}

const customCss = `
  .swagger-ui .topbar { background: #1e293b; }
  .swagger-ui .topbar .link img { content: url(data:,) }
  .swagger-ui .topbar .link::after { content: "טכנו-כל עוזי ERP API"; color: #60a5fa; font-size: 18px; font-weight: bold; margin-right: 12px; }
  .swagger-ui .info .title { direction: rtl; }
  .swagger-ui .opblock-summary-description { direction: rtl; text-align: right; }
`;

const swaggerOptions = {
  swaggerOptions: {
    url: "/api/docs/spec.json",
    persistAuthorization: true,
    docExpansion: "none",
    filter: true,
    showExtensions: true,
    tagsSorter: "alpha",
    operationsSorter: "alpha",
    tryItOutEnabled: true,
  },
  customSiteTitle: "תיעוד API — טכנו-כל עוזי ERP",
  customCss,
};

const apiDocsSwaggerOptions = {
  ...swaggerOptions,
  swaggerOptions: {
    ...swaggerOptions.swaggerOptions,
    url: "/api/docs/spec.json",
  },
};

const openapiRouter = Router();

openapiRouter.get("/spec.json", async (_req: Request, res: Response) => {
  try {
    if (!cachedSpec) {
      cachedSpec = await buildSpec();
    }
    res.json(cachedSpec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

openapiRouter.get("/spec/refresh", async (_req: Request, res: Response) => {
  try {
    cachedSpec = null;
    cachedSpec = await buildSpec();
    res.json({ success: true, message: "Spec refreshed", pathCount: Object.keys(cachedSpec.paths as object || {}).length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

openapiRouter.use("/", swaggerUi.serve);
openapiRouter.get("/", swaggerUi.setup(undefined, swaggerOptions));

export default openapiRouter;

export const apiDocsRouter = Router();
apiDocsRouter.use("/", swaggerUi.serve);
apiDocsRouter.get("/", swaggerUi.setup(undefined, apiDocsSwaggerOptions));
