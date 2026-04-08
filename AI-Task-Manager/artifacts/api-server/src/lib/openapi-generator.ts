import { Router } from "express";

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
    securitySchemes: Record<string, any>;
  };
  tags: Array<{ name: string; description: string }>;
}

export function generateOpenAPISpec(baseUrl?: string): OpenAPISpec {
  const devUrl = `http://localhost:${process.env.PORT || "8080"}`;
  const resolvedBase = baseUrl || devUrl;
  return {
    openapi: "3.0.3",
    info: {
      title: "ERP System API",
      version: "1.0.0",
      description: "Comprehensive Enterprise Resource Planning System API with full CRUD operations, workflows, analytics, and integrations",
    },
    servers: [
      { url: resolvedBase, description: "Production Server" },
      { url: devUrl, description: "Development Server" },
    ],
    paths: {
      "/api/v1/health": {
        get: {
          tags: ["System"],
          summary: "Health check endpoint",
          responses: {
            "200": {
              description: "Server is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "healthy" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/contracts": {
        get: {
          tags: ["Contracts"],
          summary: "List contracts",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: {
            "200": {
              description: "List of contracts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      contracts: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Contracts"],
          summary: "Create contract",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    contractNumber: { type: "string" },
                    title: { type: "string" },
                    vendor: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Contract created",
            },
          },
        },
      },
      "/api/v1/contracts/{id}": {
        get: {
          tags: ["Contracts"],
          summary: "Get contract details",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Contract details" },
            "404": { description: "Contract not found" },
          },
        },
      },
      "/api/v1/procurement/rfq": {
        get: {
          tags: ["Procurement"],
          summary: "List RFQs",
          responses: { "200": { description: "List of RFQs" } },
        },
        post: {
          tags: ["Procurement"],
          summary: "Create RFQ",
          responses: { "201": { description: "RFQ created" } },
        },
      },
      "/api/v1/supplier-performance/scorecards": {
        get: {
          tags: ["Suppliers"],
          summary: "Get supplier performance scorecards",
          responses: { "200": { description: "Supplier scorecards" } },
        },
      },
    },
    components: {
      schemas: {
        Contract: {
          type: "object",
          properties: {
            id: { type: "integer" },
            contractNumber: { type: "string" },
            title: { type: "string" },
            status: { type: "string", enum: ["draft", "review", "approved", "signed", "expired"] },
            vendor: { type: "string" },
            amount: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "string" },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        apiKeyAuth: {
          type: "apiKey",
          name: "X-Api-Key",
          in: "header",
        },
      },
    },
    tags: [
      { name: "System", description: "System health and status endpoints" },
      { name: "Contracts", description: "Contract lifecycle management" },
      { name: "Procurement", description: "Procurement and RFQ management" },
      { name: "Suppliers", description: "Supplier management and performance" },
      { name: "Finance", description: "Financial management" },
      { name: "Inventory", description: "Inventory management" },
    ],
  };
}

export function serveOpenAPIUI(baseUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>ERP API Documentation</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.0/swagger-ui.min.css">
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.0/swagger-ui.min.js"></script>
        <script>
          SwaggerUIBundle({
            url: "/api/v1/spec.json",
            dom_id: "#swagger-ui",
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIBundle.SwaggerUIStandalonePreset
            ],
            layout: "StandaloneLayout"
          });
        </script>
      </body>
    </html>
  `;
}
