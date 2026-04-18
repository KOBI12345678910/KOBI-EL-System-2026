interface OpenAPIPath {
  [method: string]: {
    tags: string[];
    summary: string;
    operationId: string;
    parameters?: Array<Record<string, unknown>>;
    requestBody?: Record<string, unknown>;
    responses: Record<string, unknown>;
    security?: Array<Record<string, unknown>>;
  };
}

const ENTITY_GROUPS: Record<string, { tag: string; tagHe: string; entities: string[] }> = {
  sales: {
    tag: "Sales & CRM",
    tagHe: "מכירות ו-CRM",
    entities: ["customers", "sales-orders", "quotes", "quote-items", "customer-invoices", "customer-invoice-items",
      "delivery-notes", "delivery-note-items", "customer-payments", "customer-refunds", "crm-leads", "crm-deals",
      "crm-opportunities", "crm-contacts", "crm-activities", "crm-tasks", "crm-pipeline-stages"],
  },
  procurement: {
    tag: "Procurement & Supply Chain",
    tagHe: "רכש ושרשרת אספקה",
    entities: ["suppliers", "purchase-orders", "purchase-order-items", "purchase-requests", "goods-receipts",
      "goods-receipt-items", "supplier-contacts", "contracts", "import-orders", "customs-clearances", "rfqs"],
  },
  inventory: {
    tag: "Inventory & Warehouse",
    tagHe: "מלאי ומחסנים",
    entities: ["raw-materials", "warehouses", "warehouse-locations", "stock-movements", "stock-counts",
      "inventory-transactions", "inventory-alerts"],
  },
  production: {
    tag: "Production & Fabrication",
    tagHe: "ייצור ופבריקציה",
    entities: ["work-orders", "bom-headers", "bom-lines", "production-schedules", "production-reports",
      "cutting-lists", "welding-orders", "coating-orders", "assembly-orders", "transport-orders",
      "quality-inspections", "equipment"],
  },
  finance: {
    tag: "Finance & Accounting",
    tagHe: "כספים וחשבונאות",
    entities: ["chart-of-accounts", "journal-entries", "general-ledger", "bank-accounts", "bank-reconciliations",
      "budgets", "budget-lines", "fixed-assets", "depreciation-schedules", "accounts-payable", "accounts-receivable",
      "ap-payments", "ar-receipts", "cash-flow-records", "tax-records", "vat-reports", "credit-notes",
      "checks", "expenses", "revenues", "petty-cash"],
  },
  hr: {
    tag: "Human Resources",
    tagHe: "משאבי אנוש",
    entities: ["employees", "attendance-records", "leave-requests", "payroll-records", "payroll-runs",
      "performance-reviews", "training-records", "trainings", "shift-assignments", "shift-definitions",
      "benefit-plans", "onboarding-tasks"],
  },
  projects: {
    tag: "Project Management",
    tagHe: "ניהול פרויקטים",
    entities: ["projects", "project-tasks", "timesheet-entries"],
  },
  documents: {
    tag: "Documents & DMS",
    tagHe: "ניהול מסמכים",
    entities: ["documents", "document-files", "document-folders", "document-templates", "controlled-documents"],
  },
  system: {
    tag: "System & Settings",
    tagHe: "מערכת והגדרות",
    entities: ["users", "system-settings", "notifications", "alerts"],
  },
};

function getTagForEntity(entity: string): string {
  for (const group of Object.values(ENTITY_GROUPS)) {
    if (group.entities.includes(entity)) return group.tag;
  }
  return "General";
}

function generateEntityPaths(entity: string): Record<string, OpenAPIPath> {
  const tag = getTagForEntity(entity);
  const paths: Record<string, OpenAPIPath> = {};
  const basePath = `/api/${entity}`;
  const itemPath = `${basePath}/{id}`;

  paths[basePath] = {
    get: {
      tags: [tag],
      summary: `List ${entity}`,
      operationId: `list_${entity.replace(/-/g, "_")}`,
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 500 } },
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "sort_by", in: "query", schema: { type: "string" } },
        { name: "sort_dir", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
      ],
      responses: {
        "200": {
          description: "Paginated list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "array", items: { type: "object" } },
                  pagination: {
                    type: "object",
                    properties: {
                      page: { type: "integer" },
                      limit: { type: "integer" },
                      total: { type: "integer" },
                      totalPages: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    post: {
      tags: [tag],
      summary: `Create ${entity}`,
      operationId: `create_${entity.replace(/-/g, "_")}`,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
      responses: {
        "201": { description: "Created", content: { "application/json": { schema: { type: "object" } } } },
        "400": { description: "Invalid data" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  paths[itemPath] = {
    get: {
      tags: [tag],
      summary: `Get ${entity} by ID`,
      operationId: `get_${entity.replace(/-/g, "_")}`,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        "200": { description: "Record found", content: { "application/json": { schema: { type: "object" } } } },
        "404": { description: "Not found" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    put: {
      tags: [tag],
      summary: `Update ${entity}`,
      operationId: `update_${entity.replace(/-/g, "_")}`,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {
        "200": { description: "Updated", content: { "application/json": { schema: { type: "object" } } } },
        "404": { description: "Not found" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    delete: {
      tags: [tag],
      summary: `Delete ${entity}`,
      operationId: `delete_${entity.replace(/-/g, "_")}`,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        "200": { description: "Deleted" },
        "404": { description: "Not found" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  const statsPath = `${basePath}/stats`;
  paths[statsPath] = {
    get: {
      tags: [tag],
      summary: `Get ${entity} statistics`,
      operationId: `stats_${entity.replace(/-/g, "_")}`,
      responses: {
        "200": {
          description: "Stats",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  total: { type: "integer" },
                  active: { type: "integer" },
                  byStatus: { type: "object" },
                  last30Days: { type: "integer" },
                },
              },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  const exportPath = `${basePath}/export`;
  paths[exportPath] = {
    get: {
      tags: [tag],
      summary: `Export ${entity} to CSV`,
      operationId: `export_${entity.replace(/-/g, "_")}`,
      responses: {
        "200": { description: "CSV file", content: { "text/csv": { schema: { type: "string" } } } },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  return paths;
}

function getAllRegistryEntities(): string[] {
  try {
    const { getRegisteredTables } = require("../routes/entity-crud-registry");
    const registeredTables: Set<string> = getRegisteredTables();
    return Array.from(registeredTables);
  } catch {
    return [];
  }
}

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
  name?: string;
  handle?: { stack?: RouteLayer[] };
  regexp?: RegExp;
  keys?: Array<{ name: string }>;
  path?: string;
}

function extractMountPath(layer: RouteLayer): string {
  if (layer.path && typeof layer.path === "string") return layer.path;
  if (layer.keys && layer.keys.length > 0) {
    return "/" + layer.keys.map(k => `{${k.name}}`).join("/");
  }
  const re = layer.regexp;
  if (re) {
    const src = re.source
      .replace(/\\\//g, "/")
      .replace(/\^/g, "")
      .replace(/\$.*/, "")
      .replace(/\(\?:([^)]+)\)/g, "$1")
      .replace(/\?(?:\/\?)?/g, "");
    if (src && src !== "/" && src !== "(?:/)?") return src;
  }
  return "";
}

function walkRouter(
  stack: RouteLayer[],
  prefix: string,
  discovered: Map<string, Set<string>>
): void {
  for (const layer of stack) {
    if (layer.route) {
      const fullPath = prefix + layer.route.path;
      if (!discovered.has(fullPath)) discovered.set(fullPath, new Set());
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) {
          discovered.get(fullPath)!.add(method.toLowerCase());
        }
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const mountPath = extractMountPath(layer);
      walkRouter(layer.handle.stack, prefix + mountPath, discovered);
    }
  }
}

let _expressApp: { _router?: { stack?: RouteLayer[] } } | null = null;

export function setExpressApp(app: { _router?: { stack?: RouteLayer[] } }): void {
  _expressApp = app;
}

function introspectExpressRoutes(): Map<string, Set<string>> {
  const discovered = new Map<string, Set<string>>();
  if (!_expressApp?._router?.stack) return discovered;

  for (const layer of _expressApp._router.stack) {
    if (layer.route) {
      const path = layer.route.path;
      if (!discovered.has(path)) discovered.set(path, new Set());
      for (const m of Object.keys(layer.route.methods)) {
        if (layer.route.methods[m]) discovered.get(path)!.add(m.toLowerCase());
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      const mount = extractMountPath(layer);
      walkRouter(layer.handle.stack, mount, discovered);
    }
  }
  return discovered;
}

export async function generateOpenAPISpec(): Promise<Record<string, unknown>> {
  const catalogSlugs = new Set(
    Object.values(ENTITY_GROUPS).flatMap(g => g.entities)
  );

  const registryTables = getAllRegistryEntities();
  const registrySlugs = new Set(
    registryTables.map(t => t.replace(/_/g, "-"))
  );

  const allSlugs = new Set([...catalogSlugs, ...registrySlugs]);

  let paths: Record<string, OpenAPIPath> = {};

  for (const slug of allSlugs) {
    const entityPaths = generateEntityPaths(slug);
    paths = { ...paths, ...entityPaths };
  }

  const MODULE_PATH_TAGS: Record<string, string> = {
    auth: "Authentication",
    claude: "AI & Automation",
    kimi: "AI & Automation",
    kobi: "AI & Automation",
    "super-agent": "AI & Automation",
    "ai-": "AI & Automation",
    chat: "Chat & Communications",
    documents: "Documents & DMS",
    finance: "Finance & Accounting",
    hr: "Human Resources",
    crm: "Sales & CRM",
    production: "Production & Fabrication",
    fabrication: "Production & Fabrication",
    inventory: "Inventory & Warehouse",
    warehouse: "Inventory & Warehouse",
    projects: "Project Management",
    strategy: "Strategy & Analytics",
    marketing: "Marketing",
    maintenance: "Maintenance",
    settings: "System & Settings",
    platform: "System & Settings",
    "live-ops": "System & Settings",
    calendar: "General",
    analytics: "Strategy & Analytics",
  };

  function inferTagFromPath(p: string): string {
    const segment = p.replace("/api/", "").split("/")[0] || "";
    for (const [prefix, tag] of Object.entries(MODULE_PATH_TAGS)) {
      if (segment.startsWith(prefix)) return tag;
    }
    return getTagForEntity(segment);
  }

  const discoveredRoutes = introspectExpressRoutes();
  for (const [routePath, methods] of discoveredRoutes) {
    if (!routePath.startsWith("/api/")) continue;
    if (paths[routePath]) continue;

    const oaPath = routePath.replace(/:([^/]+)/g, "{$1}");
    if (paths[oaPath]) continue;

    const tag = inferTagFromPath(routePath);
    const pathObj: OpenAPIPath = {};

    for (const method of methods) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const opId = `${method}_${routePath.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_")}`;
      const params: Array<Record<string, unknown>> = [];
      const paramMatches = routePath.matchAll(/:([^/]+)/g);
      for (const m of paramMatches) {
        params.push({ name: m[1], in: "path", required: true, schema: { type: "string" } });
      }

      pathObj[method] = {
        tags: [tag],
        summary: `${method.toUpperCase()} ${routePath.replace("/api/", "")}`,
        operationId: opId,
        ...(params.length > 0 ? { parameters: params } : {}),
        responses: {
          "200": { description: "Successful response" },
          "401": { description: "Not authenticated" },
        },
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      };
    }

    if (Object.keys(pathObj).length > 0) {
      paths[oaPath] = pathObj;
    }
  }

  // ─── 1. Authentication ───────────────────────────────────────────────────────
  paths["/api/auth/login"] = {
    post: {
      tags: ["Authentication"],
      summary: "התחברות למערכת — Login",
      description: "מחזיר token JWT לשימוש בכל הקריאות הבאות. שלח בכותרת: `Authorization: Bearer <token>`",
      operationId: "login",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["username", "password"],
              properties: {
                username: { type: "string", example: "admin", description: "שם משתמש" },
                password: { type: "string", format: "password", example: "admin123", description: "סיסמה" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "התחברות הצליחה — Token JWT הוחזר",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string", description: "JWT Bearer token" },
                  user: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      username: { type: "string" },
                      role: { type: "string", enum: ["admin", "manager", "employee", "viewer"] },
                      fullName: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "שם משתמש או סיסמה שגויים" },
      },
    },
  };

  paths["/api/auth/me"] = {
    get: {
      tags: ["Authentication"],
      summary: "פרטי המשתמש המחובר — Get current user",
      description: "מחזיר את פרטי המשתמש הנוכחי לפי ה-token שסופק",
      operationId: "getCurrentUser",
      responses: {
        "200": {
          description: "פרטי המשתמש",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  username: { type: "string" },
                  role: { type: "string" },
                  fullName: { type: "string" },
                  email: { type: "string" },
                },
              },
            },
          },
        },
        "401": { description: "לא מחובר — token חסר או פג תוקף" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  paths["/api/auth/logout"] = {
    post: {
      tags: ["Authentication"],
      summary: "התנתקות — Logout",
      description: "מבטל את ה-session הנוכחי",
      operationId: "logout",
      responses: {
        "200": { description: "התנתקות הצליחה" },
        "401": { description: "לא מחובר" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 2. Employees (HR) ────────────────────────────────────────────────────────
  paths["/api/employees"] = {
    get: {
      tags: ["Human Resources"],
      summary: "רשימת עובדים — List employees",
      description: "מחזיר רשימה של כל העובדים במערכת עם אפשרות סינון וחיפוש. נדרשת הרשאת HR/מנהל.",
      operationId: "listEmployees",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "מספר עמוד" },
        { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "רשומות לעמוד" },
        { name: "search", in: "query", schema: { type: "string" }, description: "חיפוש בשם/מחלקה" },
        { name: "department", in: "query", schema: { type: "string" }, description: "סינון לפי מחלקה" },
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "inactive", "on_leave"] }, description: "סינון לפי סטטוס" },
      ],
      responses: {
        "200": {
          description: "רשימת עובדים עם פגינציה",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "array", items: { $ref: "#/components/schemas/Employee" } },
                  pagination: { $ref: "#/components/schemas/PaginatedResponse/properties/pagination" },
                },
              },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    post: {
      tags: ["Human Resources"],
      summary: "הוספת עובד חדש — Create employee",
      description: "יוצר עובד חדש במערכת. נדרשת הרשאת HR/מנהל.",
      operationId: "createEmployee",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Employee" },
          },
        },
      },
      responses: {
        "201": { description: "עובד נוצר בהצלחה" },
        "400": { description: "נתונים לא תקינים" },
        "403": { description: "אין הרשאה" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 3. Work Orders (Production) ─────────────────────────────────────────────
  paths["/api/work-orders"] = {
    get: {
      tags: ["Production & Fabrication"],
      summary: "רשימת פקודות עבודה — List work orders",
      description: "מחזיר פקודות עבודה עם מצב ייצור, תאריכי יעד, ומידע על מוצרים. כולל פקודות ייצור, חיתוך, ריתוך וציפוי.",
      operationId: "listWorkOrders",
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["draft", "pending", "in_progress", "completed", "cancelled"] }, description: "סינון לפי סטטוס" },
        { name: "priority", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "urgent"] }, description: "סינון לפי עדיפות" },
        { name: "from_date", in: "query", schema: { type: "string", format: "date" }, description: "מתאריך (YYYY-MM-DD)" },
        { name: "to_date", in: "query", schema: { type: "string", format: "date" }, description: "עד תאריך (YYYY-MM-DD)" },
      ],
      responses: {
        "200": { description: "רשימת פקודות עבודה" },
        "401": { description: "לא מחובר" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    post: {
      tags: ["Production & Fabrication"],
      summary: "יצירת פקודת עבודה — Create work order",
      description: "יוצר פקודת עבודה חדשה לייצור/עיבוד. ניתן לשייך לפרויקט, ציוד, ועובד אחראי.",
      operationId: "createWorkOrder",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["title", "product_name"],
              properties: {
                title: { type: "string", description: "כותרת פקודת העבודה" },
                product_name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                due_date: { type: "string", format: "date" },
                assigned_to: { type: "integer", description: "מזהה עובד אחראי" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "פקודת עבודה נוצרה" },
        "400": { description: "נתונים חסרים" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 4. Customers ────────────────────────────────────────────────────────────
  paths["/api/customers"] = {
    get: {
      tags: ["Sales & CRM"],
      summary: "רשימת לקוחות — List customers",
      description: "מחזיר את כל הלקוחות עם יתרות, סטטוס אשראי, ומידע קשר. כולל לקוחות פרטיים ועסקיים.",
      operationId: "listCustomers",
      parameters: [
        { name: "search", in: "query", schema: { type: "string" }, description: "חיפוש בשם/מספר עוסק" },
        { name: "status", in: "query", schema: { type: "string" }, description: "סינון לפי סטטוס" },
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
      ],
      responses: {
        "200": { description: "רשימת לקוחות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 5. Quotes / Price Quotes ────────────────────────────────────────────────
  paths["/api/quotes"] = {
    get: {
      tags: ["Sales & CRM"],
      summary: "רשימת הצעות מחיר — List quotes",
      description: "מחזיר הצעות מחיר עם פריטים, מחירים, הנחות ומע\"מ. ניתן לסנן לפי סטטוס ולקוח.",
      operationId: "listQuotes",
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired"] } },
        { name: "customer_id", in: "query", schema: { type: "integer" } },
        { name: "from_date", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: {
        "200": { description: "רשימת הצעות מחיר" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 6. Customer Invoices ─────────────────────────────────────────────────────
  paths["/api/customer-invoices"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "רשימת חשבוניות לקוחות — List customer invoices",
      description: "מחזיר חשבוניות מכירה עם פרטי מע\"מ, לקוח, ויתרות לגביה. תואם דוחות מע\"מ ישראלי.",
      operationId: "listCustomerInvoices",
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"] } },
        { name: "customer_id", in: "query", schema: { type: "integer" } },
        { name: "from_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "to_date", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: {
        "200": { description: "רשימת חשבוניות" },
        "401": { description: "נדרשת התחברות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 7. Customer Payments ────────────────────────────────────────────────────
  paths["/api/customer-payments"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "רשימת תשלומים שהתקבלו — List customer payments",
      description: "מחזיר תשלומים שהתקבלו מלקוחות עם פרטי שיק, העברה בנקאית, ואמצעי תשלום אחרים.",
      operationId: "listCustomerPayments",
      parameters: [
        { name: "from_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "to_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "payment_method", in: "query", schema: { type: "string", enum: ["bank_transfer", "check", "cash", "credit_card"] } },
      ],
      responses: {
        "200": { description: "רשימת תשלומים שהתקבלו" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 8. Inventory / Raw Materials ────────────────────────────────────────────
  paths["/api/raw-materials"] = {
    get: {
      tags: ["Inventory & Warehouse"],
      summary: "רשימת חומרי גלם — List raw materials",
      description: "מחזיר את כל חומרי הגלם במלאי עם כמויות, יחידות מידה, ספקים, ומחירים. כולל אזהרות מלאי מינימום.",
      operationId: "listRawMaterials",
      parameters: [
        { name: "category", in: "query", schema: { type: "string" }, description: "קטגוריה (מתכת, אלומיניום, נירוסטה)" },
        { name: "low_stock", in: "query", schema: { type: "boolean" }, description: "הצג רק מלאי נמוך" },
        { name: "warehouse_id", in: "query", schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "רשימת חומרי גלם" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 9. Purchase Orders ───────────────────────────────────────────────────────
  paths["/api/purchase-orders"] = {
    get: {
      tags: ["Procurement & Supply Chain"],
      summary: "רשימת הזמנות רכש — List purchase orders",
      description: "מחזיר הזמנות רכש לספקים עם סטטוס, סכומים, ותאריכי אספקה. כולל השוואה ל-3-way matching.",
      operationId: "listPurchaseOrders",
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["draft", "pending", "approved", "sent", "received", "closed"] } },
        { name: "supplier_id", in: "query", schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "רשימת הזמנות רכש" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 10. Attendance ───────────────────────────────────────────────────────────
  paths["/api/attendance-records"] = {
    get: {
      tags: ["Human Resources"],
      summary: "רשומות נוכחות — List attendance records",
      description: "מחזיר רשומות נוכחות של עובדים עם שעות כניסה/יציאה, שעות נוספות, ועבודה מהבית. נדרשת הרשאת HR.",
      operationId: "listAttendanceRecords",
      parameters: [
        { name: "employee_id", in: "query", schema: { type: "integer" } },
        { name: "from_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "to_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "month", in: "query", schema: { type: "integer" }, description: "חודש (1-12)" },
        { name: "year", in: "query", schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "רשומות נוכחות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 11. Shifts ───────────────────────────────────────────────────────────────
  paths["/api/shift-definitions"] = {
    get: {
      tags: ["Human Resources"],
      summary: "הגדרות משמרות — List shift definitions",
      description: "מחזיר הגדרות משמרות עם שעות, ימים, ותוספות. נדרש לתכנון סידור עבודה.",
      operationId: "listShiftDefinitions",
      responses: {
        "200": { description: "רשימת הגדרות משמרות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 12. Leave Requests ───────────────────────────────────────────────────────
  paths["/api/leave-requests"] = {
    get: {
      tags: ["Human Resources"],
      summary: "בקשות חופשה/היעדרות — List leave requests",
      description: "מחזיר בקשות חופשה, מחלה, ואחרים. ניתן לסנן לפי עובד, סטטוס, ותקופה.",
      operationId: "listLeaveRequests",
      parameters: [
        { name: "employee_id", in: "query", schema: { type: "integer" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } },
        { name: "leave_type", in: "query", schema: { type: "string", enum: ["vacation", "sick", "personal", "military"] } },
      ],
      responses: {
        "200": { description: "בקשות חופשה" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
    post: {
      tags: ["Human Resources"],
      summary: "הגשת בקשת חופשה — Submit leave request",
      description: "עובד מגיש בקשת חופשה/מחלה. הבקשה ממתינה לאישור מנהל.",
      operationId: "createLeaveRequest",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["employee_id", "leave_type", "start_date", "end_date"],
              properties: {
                employee_id: { type: "integer" },
                leave_type: { type: "string", enum: ["vacation", "sick", "personal", "military"] },
                start_date: { type: "string", format: "date" },
                end_date: { type: "string", format: "date" },
                reason: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "בקשת חופשה הוגשה" },
        "400": { description: "נתונים לא תקינים" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 13. Departments ─────────────────────────────────────────────────────────
  paths["/api/departments"] = {
    get: {
      tags: ["Human Resources"],
      summary: "רשימת מחלקות — List departments",
      description: "מחזיר את כל המחלקות הארגוניות עם מנהל אחראי ומספר עובדים.",
      operationId: "listDepartments",
      responses: {
        "200": { description: "רשימת מחלקות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 14. Reports ─────────────────────────────────────────────────────────────
  paths["/api/bi/schedules"] = {
    get: {
      tags: ["Dashboard & Reports"],
      summary: "דוחות מתוזמנים — BI Scheduled Reports",
      description: "מחזיר רשימת דוחות BI מתוזמנים. ניתן להפעיל ידנית או לקבל לוגי שליחה.",
      operationId: "listBISchedules",
      responses: {
        "200": { description: "רשימת דוחות מתוזמנים" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };
  paths["/api/bi/dashboards"] = {
    get: {
      tags: ["Dashboard & Reports"],
      summary: "דשבורדים של BI — BI Dashboards",
      description: "מחזיר דשבורדים ו-widgets של מערכת ה-BI. תומך בסינון ושמירה.",
      operationId: "listBIDashboards",
      responses: {
        "200": { description: "רשימת דשבורדים" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 15. Dashboard / KPI ─────────────────────────────────────────────────────
  paths["/api/dashboard-stats"] = {
    get: {
      tags: ["Dashboard & Reports"],
      summary: "נתוני לוח בקרה — Dashboard KPIs",
      description: "מחזיר מדדי ביצוע עיקריים: הכנסות, הוצאות, מלאי, פקודות עבודה, נוכחות. מתאים לדשבורד הנהלה.",
      operationId: "getDashboardKPIs",
      responses: {
        "200": {
          description: "נתוני KPI",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  revenue: { type: "number", description: "הכנסות החודש (ש\"ח)" },
                  expenses: { type: "number", description: "הוצאות החודש (ש\"ח)" },
                  open_work_orders: { type: "integer" },
                  employees_present: { type: "integer" },
                },
              },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 16. Notifications ────────────────────────────────────────────────────────
  paths["/api/notifications"] = {
    get: {
      tags: ["System & Settings"],
      summary: "רשימת התראות — List notifications",
      description: "מחזיר התראות למשתמש המחובר. ניתן לסנן לא-נקראות, לפי סוג, ולפי תאריך.",
      operationId: "listNotifications",
      parameters: [
        { name: "unread_only", in: "query", schema: { type: "boolean" }, description: "הצג רק לא נקראות" },
        { name: "type", in: "query", schema: { type: "string" }, description: "סוג התראה" },
      ],
      responses: {
        "200": { description: "רשימת התראות" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 17. Global Search ────────────────────────────────────────────────────────
  paths["/api/global-search"] = {
    get: {
      tags: ["System & Settings"],
      summary: "חיפוש גלובלי — Global search",
      description: "מחפש בכל ישויות המערכת: עובדים, לקוחות, חשבוניות, פקודות עבודה ועוד. מינימום 2 תווים.",
      operationId: "globalSearch",
      parameters: [
        { name: "q", in: "query", required: true, schema: { type: "string" }, description: "מחרוזת חיפוש" },
        { name: "entity", in: "query", schema: { type: "string" }, description: "הגבל לישות מסוימת" },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
      ],
      responses: {
        "200": { description: "תוצאות חיפוש" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  // ─── 18. Audit Log ────────────────────────────────────────────────────────────
  paths["/api/audit-log"] = {
    get: {
      tags: ["System & Settings"],
      summary: "יומן ביקורת — Audit log",
      description: "מחזיר יומן פעולות של כל המשתמשים. נדרשת הרשאת מנהל. כולל: יצירה, עדכון, מחיקה, התחברות.",
      operationId: "listAuditLog",
      parameters: [
        { name: "user_id", in: "query", schema: { type: "integer" } },
        { name: "action", in: "query", schema: { type: "string", enum: ["create", "update", "delete", "login", "export"] } },
        { name: "entity", in: "query", schema: { type: "string" } },
        { name: "from_date", in: "query", schema: { type: "string", format: "date" } },
        { name: "to_date", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: {
        "200": { description: "רשומות יומן ביקורת" },
        "403": { description: "נדרשת הרשאת מנהל" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 19. Settings ─────────────────────────────────────────────────────────────
  paths["/api/settings"] = {
    get: {
      tags: ["System & Settings"],
      summary: "הגדרות מערכת — System settings",
      description: "מחזיר הגדרות מערכת גלובליות: שם חברה, ח.פ., כתובת, מע\"מ, מטבע ברירת מחדל. נדרשת הרשאת מנהל.",
      operationId: "getSettings",
      responses: {
        "200": { description: "הגדרות מערכת" },
        "403": { description: "נדרשת הרשאת מנהל" },
      },
      security: [{ BearerAuth: [] }],
    },
    put: {
      tags: ["System & Settings"],
      summary: "עדכון הגדרות מערכת — Update settings",
      description: "מעדכן הגדרות מערכת. שינויים כלליים משפיעים על כל המסמכים שיוצרו לאחר מכן.",
      operationId: "updateSettings",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                company_name: { type: "string", example: "טכנו-כל עוזי בע\"מ" },
                tax_id: { type: "string", example: "054227129" },
                vat_rate: { type: "number", example: 18 },
                default_currency: { type: "string", example: "ILS" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "הגדרות עודכנו" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  // ─── 20. Health Check ─────────────────────────────────────────────────────────
  paths["/api/healthz"] = {
    get: {
      tags: ["System & Settings"],
      summary: "בדיקת תקינות — Health check",
      description: "מחזיר את מצב המערכת: חיבור בסיס נתונים, טבלאות קריטיות, זיכרון וזמן הפעלה. לא נדרשת התחברות.",
      operationId: "healthCheck",
      responses: {
        "200": {
          description: "המערכת תקינה",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "ok" },
                  db: { type: "string", example: "connected" },
                  uptime: { type: "number", description: "שניות מאז הפעלה" },
                  version: { type: "string" },
                  timestamp: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        "503": { description: "שירות לא זמין" },
      },
    },
  };

  // ─── 21. Accounting Export (חשבשבת) ──────────────────────────────────────────
  paths["/api/accounting-export/summary"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "סיכום נתוני ייצוא חשבשבת — Accounting export summary",
      description: "מחזיר ספירה של רשומות לייצוא וכן אזהרות על נתונים חסרים (מספר עוסק, מספר חשבונית וכו'). נדרשת הרשאת מנהל/חשב.",
      operationId: "accountingExportSummary",
      parameters: [
        { name: "month", in: "query", required: true, schema: { type: "integer", minimum: 1, maximum: 12 }, description: "חודש (1-12)" },
        { name: "year", in: "query", required: true, schema: { type: "integer" }, description: "שנה (לדוגמה: 2025)" },
      ],
      responses: {
        "200": {
          description: "סיכום ואזהרות",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  period: { type: "object" },
                  counts: {
                    type: "object",
                    properties: {
                      customer_invoices: { type: "integer" },
                      customer_payments: { type: "integer" },
                      supplier_invoices: { type: "integer" },
                    },
                  },
                  warnings: { type: "array", items: { type: "string" }, description: "אזהרות על נתונים חסרים" },
                  ready: { type: "boolean", description: "האם הנתונים מוכנים לייצוא" },
                },
              },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  paths["/api/accounting-export/invoices.csv"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "ייצוא חשבוניות לקוחות CSV — Export customer invoices",
      description: "מוריד קובץ CSV עם חשבוניות לקוחות לחודש נבחר. עמודות: מספר חשבונית, תאריך, שם לקוח, מספר עוסק, סכום לפני מע\"מ, מע\"מ, סה\"כ. מתאים לייבוא בחשבשבת.",
      operationId: "exportCustomerInvoicesCSV",
      parameters: [
        { name: "month", in: "query", required: true, schema: { type: "integer" } },
        { name: "year", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "קובץ CSV — חשבוניות לקוחות", content: { "text/csv": { schema: { type: "string" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  paths["/api/accounting-export/payments.csv"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "ייצוא תשלומים שהתקבלו CSV — Export customer payments",
      description: "מוריד קובץ CSV עם תשלומים שהתקבלו מלקוחות לחודש נבחר. מתאים לייבוא בחשבשבת.",
      operationId: "exportCustomerPaymentsCSV",
      parameters: [
        { name: "month", in: "query", required: true, schema: { type: "integer" } },
        { name: "year", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "קובץ CSV — תשלומים", content: { "text/csv": { schema: { type: "string" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  paths["/api/accounting-export/expenses.csv"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "ייצוא הוצאות ספקים CSV — Export supplier expenses",
      description: "מוריד קובץ CSV עם חשבוניות ספקים לחודש נבחר. מתאים לייבוא כחשבוניות קנייה בחשבשבת.",
      operationId: "exportSupplierExpensesCSV",
      parameters: [
        { name: "month", in: "query", required: true, schema: { type: "integer" } },
        { name: "year", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "קובץ CSV — הוצאות ספקים", content: { "text/csv": { schema: { type: "string" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  paths["/api/accounting-export/all.csv"] = {
    get: {
      tags: ["Finance & Accounting"],
      summary: "ייצוא מאוחד לחשבשבת CSV — Full accounting export",
      description: "מוריד קובץ CSV מאוחד עם כל הנתונים הפיננסיים לחודש נבחר: חשבוניות לקוחות, תשלומים, והוצאות ספקים. מומלץ לייבוא מלא בחשבשבת.",
      operationId: "exportAllAccountingCSV",
      parameters: [
        { name: "month", in: "query", required: true, schema: { type: "integer" } },
        { name: "year", in: "query", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "קובץ CSV מאוחד", content: { "text/csv": { schema: { type: "string" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  paths["/api/graphql"] = {
    post: {
      tags: ["GraphQL"],
      summary: "GraphQL endpoint",
      operationId: "graphql",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["query"],
              properties: {
                query: { type: "string" },
                variables: { type: "object" },
                operationName: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "GraphQL response" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  paths["/api/graphql/subscribe"] = {
    get: {
      tags: ["GraphQL"],
      summary: "GraphQL SSE subscription stream",
      operationId: "graphqlSubscribe",
      parameters: [
        { name: "entities", in: "query", schema: { type: "string" }, description: "Comma-separated entity IDs to subscribe to" },
        { name: "events", in: "query", schema: { type: "string", default: "record.created,record.updated,record.deleted" }, description: "Comma-separated event types" },
      ],
      responses: {
        "200": { description: "SSE stream of record events", content: { "text/event-stream": { schema: { type: "string" } } } },
        "401": { description: "Not authenticated" },
      },
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    },
  };

  paths["/api/api-keys"] = {
    get: {
      tags: ["API Keys"],
      summary: "List API keys",
      operationId: "listApiKeys",
      responses: { "200": { description: "List of API keys" } },
      security: [{ BearerAuth: [] }],
    },
    post: {
      tags: ["API Keys"],
      summary: "Create API key",
      operationId: "createApiKey",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                scopes: { type: "array", items: { type: "string" } },
                expires_in_days: { type: "integer" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "API key created" },
      },
      security: [{ BearerAuth: [] }],
    },
  };

  const usedTags = new Set<string>();
  for (const pathObj of Object.values(paths)) {
    for (const methodObj of Object.values(pathObj)) {
      if (methodObj.tags) {
        for (const t of methodObj.tags) usedTags.add(t);
      }
    }
  }

  const tags = [
    { name: "Authentication", description: "אימות והרשאות — Authentication & Authorization" },
    { name: "GraphQL", description: "ממשק GraphQL גמיש — Flexible GraphQL query interface" },
    { name: "API Keys", description: "ניהול מפתחות API — API Key management" },
    { name: "AI & Automation", description: "בינה מלאכותית ואוטומציה — AI services & automation" },
    { name: "Chat & Communications", description: "צ'אט ותקשורת — Chat & messaging" },
    { name: "Strategy & Analytics", description: "אסטרטגיה וניתוח — Business analytics & strategy" },
    { name: "Marketing", description: "שיווק — Marketing campaigns & content" },
    { name: "Maintenance", description: "תחזוקה — Equipment maintenance" },
    ...Object.values(ENTITY_GROUPS).map(g => ({
      name: g.tag,
      description: g.tagHe,
    })),
    { name: "General", description: "ישויות נוספות — Additional entities" },
  ].filter(t => usedTags.has(t.name));

  return {
    openapi: "3.0.3",
    info: {
      title: "Techno-Kol Uzi ERP API — טכנו-כל עוזי",
      description: "מערכת ERP מלאה למפעל מתכת/אלומיניום/נירוסטה/זכוכית.\n\nFull ERP system API for metal/aluminum/stainless-steel/glass factory.\n\n**API Versioning:** All routes are available at both `/api/` and `/api/v1/`. Use `/api/v1/` for version-locked access.\n\n**Authentication:** Use Bearer token (from /api/auth/login) or X-Api-Key header.\n\n**Rate Limits:** 200 req/min per user, 20 req/min for heavy endpoints.\n\n**Subscriptions:** Connect to `/api/graphql/subscribe` (SSE) for real-time record events.\n\n**Currency:** All monetary values in Agorot (1/100 ILS). VAT: 17%.",
      version: "1.0.0",
      contact: {
        name: "Techno-Kol Uzi IT",
        email: "admin@technokol.co.il",
      },
    },
    servers: [
      { url: "/", description: "Current server" },
    ],
    tags,
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "JWT token from /api/auth/login or /api/v1/auth/login",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description: "API Key from admin settings",
        },
      },
      schemas: {
        PaginatedResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { type: "object" } },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
        Employee: {
          type: "object",
          properties: {
            id: { type: "integer" },
            first_name: { type: "string", description: "שם פרטי" },
            last_name: { type: "string", description: "שם משפחה" },
            employee_number: { type: "string", description: "מספר עובד" },
            department: { type: "string", description: "מחלקה" },
            position: { type: "string", description: "תפקיד" },
            start_date: { type: "string", format: "date", description: "תאריך תחילת עבודה" },
            status: { type: "string", enum: ["active", "inactive", "on_leave"], description: "סטטוס עובד" },
            email: { type: "string", format: "email" },
            phone: { type: "string" },
            id_number: { type: "string", description: "תעודת זהות" },
            salary_type: { type: "string", enum: ["monthly", "hourly", "daily"] },
            base_salary: { type: "number", description: "שכר בסיס (ש\"ח)" },
          },
        },
        WorkOrder: {
          type: "object",
          properties: {
            id: { type: "integer" },
            work_order_number: { type: "string" },
            title: { type: "string" },
            product_name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            status: { type: "string", enum: ["draft", "pending", "in_progress", "completed", "cancelled"] },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            due_date: { type: "string", format: "date" },
            assigned_to: { type: "integer" },
            notes: { type: "string" },
          },
        },
        CustomerInvoice: {
          type: "object",
          properties: {
            id: { type: "integer" },
            invoice_number: { type: "string", description: "מספר חשבונית" },
            invoice_date: { type: "string", format: "date", description: "תאריך חשבונית" },
            customer_name: { type: "string", description: "שם לקוח" },
            customer_tax_id: { type: "string", description: "מספר עוסק מורשה/ח.פ. לקוח" },
            subtotal: { type: "number", description: "סכום לפני מע\"מ (ש\"ח)" },
            vat_rate: { type: "number", description: "שיעור מע\"מ (%)", example: 18 },
            vat_amount: { type: "number", description: "סכום מע\"מ (ש\"ח)" },
            total_amount: { type: "number", description: "סה\"כ כולל מע\"מ (ש\"ח)" },
            status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"] },
            payment_method: { type: "string" },
            currency: { type: "string", default: "ILS" },
          },
        },
      },
    },
  };
}
