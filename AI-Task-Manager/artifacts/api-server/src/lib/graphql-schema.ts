import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLEnumType,
} from "graphql";
import { pool } from "@workspace/db";
import { checkEntityAccess, type ResolvedPermissions } from "./permission-engine";
import { eventBus } from "./event-bus";

interface GraphQLContext {
  userId?: string;
  permissions?: ResolvedPermissions;
}

function requireAuth(context: GraphQLContext): void {
  if (!context.userId) {
    throw new Error("נדרש אימות — Authentication required");
  }
}

function requireAdmin(context: GraphQLContext): void {
  requireAuth(context);
  if (!context.permissions?.isSuperAdmin) {
    throw new Error("נדרשת הרשאת מנהל — Admin access required");
  }
}

function requireEntityAccess(
  context: GraphQLContext,
  tableName: string,
  action: "create" | "read" | "update" | "delete"
): void {
  requireAuth(context);
  if (!context.permissions) {
    throw new Error("הרשאות לא נטענו — Permissions not loaded");
  }
  if (!checkEntityAccess(context.permissions, tableName, action)) {
    throw new Error(`אין הרשאת ${action} לישות ${tableName} — No ${action} access to ${tableName}`);
  }
}

const SortDirEnum = new GraphQLEnumType({
  name: "SortDirection",
  values: {
    ASC: { value: "ASC" },
    DESC: { value: "DESC" },
  },
});

const PaginationInput = new GraphQLInputObjectType({
  name: "PaginationInput",
  fields: {
    page: { type: GraphQLInt, defaultValue: 1 },
    limit: { type: GraphQLInt, defaultValue: 50 },
  },
});

const PaginationType = new GraphQLObjectType({
  name: "Pagination",
  fields: {
    page: { type: GraphQLInt },
    limit: { type: GraphQLInt },
    total: { type: GraphQLInt },
    totalPages: { type: GraphQLInt },
  },
});

const RelatedRecordType: GraphQLObjectType = new GraphQLObjectType({
  name: "RelatedRecord",
  fields: {
    id: { type: GraphQLInt },
    data: {
      type: GraphQLString,
      resolve: (obj: Record<string, unknown>) => JSON.stringify(obj),
    },
  },
});

const GenericRecordType = new GraphQLObjectType({
  name: "GenericRecord",
  fields: {
    id: { type: GraphQLInt },
    data: {
      type: GraphQLString,
      resolve: (obj: Record<string, unknown>) => JSON.stringify(obj),
    },
    related: {
      type: RelatedRecordType,
      args: {
        table: { type: new GraphQLNonNull(GraphQLString) },
        foreignKey: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (
        obj: Record<string, unknown>,
        args: { table: string; foreignKey: string },
        context: GraphQLContext
      ) => {
        const tableName = args.table.replace(/-/g, "_");
        const fk = args.foreignKey.replace(/-/g, "_");
        if (!SAFE_COL.test(tableName) || !SAFE_COL.test(fk)) return null;
        requireEntityAccess(context, tableName, "read");
        const fkValue = obj[fk];
        if (fkValue == null) return null;
        try {
          const { rows } = await pool.query(
            `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`,
            [fkValue]
          );
          return rows[0] || null;
        } catch {
          return null;
        }
      },
    },
    relatedList: {
      type: new GraphQLList(RelatedRecordType),
      args: {
        table: { type: new GraphQLNonNull(GraphQLString) },
        foreignKey: { type: new GraphQLNonNull(GraphQLString) },
        limit: { type: GraphQLInt, defaultValue: 50 },
      },
      resolve: async (
        obj: Record<string, unknown>,
        args: { table: string; foreignKey: string; limit: number },
        context: GraphQLContext
      ) => {
        const tableName = args.table.replace(/-/g, "_");
        const fk = args.foreignKey.replace(/-/g, "_");
        if (!SAFE_COL.test(tableName) || !SAFE_COL.test(fk)) return [];
        requireEntityAccess(context, tableName, "read");
        const myId = obj.id;
        if (myId == null) return [];
        const lim = Math.min(500, Math.max(1, args.limit || 50));
        try {
          const { rows } = await pool.query(
            `SELECT * FROM ${tableName} WHERE "${fk}" = $1 ORDER BY id DESC LIMIT $2`,
            [myId, lim]
          );
          return rows;
        } catch {
          return [];
        }
      },
    },
  },
});

interface EntityConfig {
  table: string;
  typeName: string;
  description: string;
  orderBy?: string;
  fields?: Record<string, { type: unknown; description?: string }>;
  relations?: Record<string, { table: string; foreignKey: string; type: string }>;
}

const ENTITIES: Record<string, EntityConfig> = {
  customers: {
    table: "customers",
    typeName: "Customer",
    description: "לקוחות — Customers",
    orderBy: "created_at DESC NULLS LAST",
  },
  suppliers: {
    table: "suppliers",
    typeName: "Supplier",
    description: "ספקים — Suppliers",
    orderBy: "created_at DESC NULLS LAST",
  },
  employees: {
    table: "employees",
    typeName: "Employee",
    description: "עובדים — Employees",
    orderBy: "created_at DESC NULLS LAST",
  },
  salesOrders: {
    table: "sales_orders",
    typeName: "SalesOrder",
    description: "הזמנות מכירה — Sales Orders",
    orderBy: "created_at DESC NULLS LAST",
  },
  purchaseOrders: {
    table: "purchase_orders",
    typeName: "PurchaseOrder",
    description: "הזמנות רכש — Purchase Orders",
    orderBy: "created_at DESC NULLS LAST",
  },
  products: {
    table: "products",
    typeName: "Product",
    description: "מוצרים — Products",
  },
  rawMaterials: {
    table: "raw_materials",
    typeName: "RawMaterial",
    description: "חומרי גלם — Raw Materials",
  },
  workOrders: {
    table: "work_orders",
    typeName: "WorkOrder",
    description: "הזמנות עבודה — Work Orders",
    orderBy: "created_at DESC NULLS LAST",
  },
  warehouses: {
    table: "warehouses",
    typeName: "Warehouse",
    description: "מחסנים — Warehouses",
  },
  projects: {
    table: "projects",
    typeName: "Project",
    description: "פרויקטים — Projects",
    orderBy: "created_at DESC NULLS LAST",
  },
  chartOfAccounts: {
    table: "chart_of_accounts",
    typeName: "ChartOfAccount",
    description: "מפת חשבונות — Chart of Accounts",
    orderBy: "account_code ASC",
  },
  journalEntries: {
    table: "journal_entries",
    typeName: "JournalEntry",
    description: "פקודות יומן — Journal Entries",
    orderBy: "created_at DESC NULLS LAST",
  },
  customerInvoices: {
    table: "customer_invoices",
    typeName: "CustomerInvoice",
    description: "חשבוניות — Customer Invoices",
    orderBy: "created_at DESC NULLS LAST",
  },
  quotes: {
    table: "quotes",
    typeName: "Quote",
    description: "הצעות מחיר — Quotes",
    orderBy: "created_at DESC NULLS LAST",
  },
  crmLeads: {
    table: "crm_leads",
    typeName: "CrmLead",
    description: "לידים — CRM Leads",
    orderBy: "created_at DESC NULLS LAST",
  },
  crmDeals: {
    table: "crm_deals",
    typeName: "CrmDeal",
    description: "עסקאות — CRM Deals",
    orderBy: "created_at DESC NULLS LAST",
  },
  qualityInspections: {
    table: "quality_inspections",
    typeName: "QualityInspection",
    description: "בדיקות איכות — Quality Inspections",
    orderBy: "created_at DESC NULLS LAST",
  },
  maintenanceOrders: {
    table: "maintenance_orders",
    typeName: "MaintenanceOrder",
    description: "הזמנות תחזוקה — Maintenance Orders",
    orderBy: "created_at DESC NULLS LAST",
  },
  budgets: {
    table: "budgets",
    typeName: "Budget",
    description: "תקציבים — Budgets",
  },
  fixedAssets: {
    table: "fixed_assets",
    typeName: "FixedAsset",
    description: "רכוש קבוע — Fixed Assets",
  },
  notifications: {
    table: "notifications",
    typeName: "Notification",
    description: "התראות — Notifications",
    orderBy: "created_at DESC NULLS LAST",
  },
  attendanceRecords: {
    table: "attendance_records",
    typeName: "AttendanceRecord",
    description: "רשומות נוכחות — Attendance Records",
    orderBy: "date DESC NULLS LAST",
  },
  leaveRequests: {
    table: "leave_requests",
    typeName: "LeaveRequest",
    description: "בקשות חופשה — Leave Requests",
    orderBy: "created_at DESC NULLS LAST",
  },
  stockMovements: {
    table: "stock_movements",
    typeName: "StockMovement",
    description: "תנועות מלאי — Stock Movements",
    orderBy: "created_at DESC NULLS LAST",
  },
  deliveryNotes: {
    table: "delivery_notes",
    typeName: "DeliveryNote",
    description: "תעודות משלוח — Delivery Notes",
    orderBy: "created_at DESC NULLS LAST",
  },
};

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/i;
const colCache = new Map<string, string[]>();

async function getColumns(table: string): Promise<string[]> {
  if (colCache.has(table)) return colCache.get(table)!;
  try {
    const { rows } = await pool.query(
      `SELECT a.attname as col FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [table]
    );
    const cols = rows.map((r: Record<string, unknown>) => r.col as string);
    colCache.set(table, cols);
    return cols;
  } catch {
    return [];
  }
}

async function getTextColumns(table: string): Promise<string[]> {
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND data_type IN ('text','character varying','character')`,
      [table]
    );
    return rows.map((r: Record<string, unknown>) => r.column_name as string);
  } catch {
    return [];
  }
}

function buildEntityQueryFields(): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  for (const [key, config] of Object.entries(ENTITIES)) {
    fields[key] = {
      type: new GraphQLObjectType({
        name: `${config.typeName}Result`,
        fields: {
          data: { type: new GraphQLList(GenericRecordType) },
          pagination: { type: PaginationType },
        },
      }),
      description: config.description,
      args: {
        pagination: { type: PaginationInput },
        search: { type: GraphQLString },
        sortBy: { type: GraphQLString },
        sortDir: { type: SortDirEnum },
        filter: { type: GraphQLString, description: "JSON filter object e.g. {\"status\":\"active\"}" },
      },
      resolve: async (_root: unknown, args: Record<string, unknown>, context: GraphQLContext) => {
        requireEntityAccess(context, config.table, "read");
        const pag = (args.pagination || { page: 1, limit: 50 }) as { page: number; limit: number };
        const page = Math.max(1, pag.page || 1);
        const limit = Math.min(500, Math.max(1, pag.limit || 50));
        const offset = (page - 1) * limit;
        const search = (args.search as string || "").trim();
        const sortBy = args.sortBy as string || "";
        const sortDir = (args.sortDir as string || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

        const cols = await getColumns(config.table);
        if (cols.length === 0) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };

        const params: unknown[] = [];
        const conditions: string[] = [];

        if (args.filter) {
          try {
            const filterObj = JSON.parse(args.filter as string);
            for (const [fk, fv] of Object.entries(filterObj)) {
              if (SAFE_COL.test(fk) && cols.includes(fk)) {
                params.push(fv);
                conditions.push(`"${fk}" = $${params.length}`);
              }
            }
          } catch { /* ignore bad filter */ }
        }

        if (search) {
          const textCols = await getTextColumns(config.table);
          const searchableCols = textCols.filter(c => cols.includes(c));
          if (searchableCols.length > 0) {
            params.push(`%${search}%`);
            const orConds = searchableCols.map(c => `"${c}" ILIKE $${params.length}`).join(" OR ");
            conditions.push(`(${orConds})`);
          }
        }

        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
        const validSort = SAFE_COL.test(sortBy) && cols.includes(sortBy);
        const orderByClause = validSort ? `"${sortBy}" ${sortDir} NULLS LAST` : (config.orderBy || "id DESC");

        const countQ = await pool.query(
          `SELECT COUNT(*) as total FROM ${config.table}${whereClause}`,
          params
        );
        const total = Number((countQ.rows[0] as Record<string, unknown>)?.total || 0);

        const pOff = params.length + 1;
        const pLim = params.length + 2;
        const { rows } = await pool.query(
          `SELECT * FROM ${config.table}${whereClause} ORDER BY ${orderByClause} OFFSET $${pOff} LIMIT $${pLim}`,
          [...params, offset, limit]
        );

        return {
          data: rows,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
    };

    fields[`${key}ById`] = {
      type: GenericRecordType,
      description: `Get single ${config.typeName} by ID`,
      args: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
      },
      resolve: async (_root: unknown, args: { id: number }, context: GraphQLContext) => {
        requireEntityAccess(context, config.table, "read");
        const { rows } = await pool.query(
          `SELECT * FROM ${config.table} WHERE id = $1`,
          [args.id]
        );
        return rows[0] || null;
      },
    };
  }

  fields["entityByTable"] = {
    type: new GraphQLObjectType({
      name: "DynamicEntityResult",
      fields: {
        data: { type: new GraphQLList(GenericRecordType) },
        pagination: { type: PaginationType },
      },
    }),
    description: "Query any table dynamically",
    args: {
      table: { type: new GraphQLNonNull(GraphQLString) },
      pagination: { type: PaginationInput },
      search: { type: GraphQLString },
      filter: { type: GraphQLString },
    },
    resolve: async (_root: unknown, args: Record<string, unknown>, context: GraphQLContext) => {
      const tableName = (args.table as string || "").replace(/-/g, "_");
      if (!SAFE_COL.test(tableName)) return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
      requireEntityAccess(context, tableName, "read");

      const cols = await getColumns(tableName);
      if (cols.length === 0) return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };

      const pag = (args.pagination || { page: 1, limit: 50 }) as { page: number; limit: number };
      const page = Math.max(1, pag.page || 1);
      const limit = Math.min(500, Math.max(1, pag.limit || 50));
      const offset = (page - 1) * limit;

      const params: unknown[] = [];
      const conditions: string[] = [];

      if (args.filter) {
        try {
          const filterObj = JSON.parse(args.filter as string);
          for (const [fk, fv] of Object.entries(filterObj)) {
            if (SAFE_COL.test(fk) && cols.includes(fk)) {
              params.push(fv);
              conditions.push(`"${fk}" = $${params.length}`);
            }
          }
        } catch { /* ignore */ }
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
      const orderBy = cols.includes("created_at") ? "created_at DESC NULLS LAST" : "id DESC";

      const countQ = await pool.query(`SELECT COUNT(*) as total FROM ${tableName}${whereClause}`, params);
      const total = Number((countQ.rows[0] as Record<string, unknown>)?.total || 0);

      const pOff = params.length + 1;
      const pLim = params.length + 2;
      const { rows } = await pool.query(
        `SELECT * FROM ${tableName}${whereClause} ORDER BY ${orderBy} OFFSET $${pOff} LIMIT $${pLim}`,
        [...params, offset, limit]
      );

      return {
        data: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
  };

  fields["tableSchema"] = {
    type: new GraphQLList(new GraphQLObjectType({
      name: "ColumnInfo",
      fields: {
        column_name: { type: GraphQLString },
        data_type: { type: GraphQLString },
        is_nullable: { type: GraphQLString },
        column_default: { type: GraphQLString },
      },
    })),
    description: "Get table column schema",
    args: {
      table: { type: new GraphQLNonNull(GraphQLString) },
    },
    resolve: async (_root: unknown, args: { table: string }, context: GraphQLContext) => {
      requireAdmin(context);
      const tableName = args.table.replace(/-/g, "_");
      if (!SAFE_COL.test(tableName)) return [];
      const { rows } = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [tableName]
      );
      return rows;
    },
  };

  fields["availableTables"] = {
    type: new GraphQLList(GraphQLString),
    description: "List all available tables",
    resolve: async (_root: unknown, _args: unknown, context: GraphQLContext) => {
      requireAdmin(context);
      const { rows } = await pool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      return rows.map((r: Record<string, unknown>) => r.tablename);
    },
  };

  fields["dashboardStats"] = {
    type: new GraphQLObjectType({
      name: "DashboardStats",
      fields: {
        customers: { type: GraphQLInt },
        suppliers: { type: GraphQLInt },
        employees: { type: GraphQLInt },
        products: { type: GraphQLInt },
        openOrders: { type: GraphQLInt },
        pendingInvoices: { type: GraphQLInt },
      },
    }),
    description: "Dashboard statistics",
    resolve: async (_root: unknown, _args: unknown, context: GraphQLContext) => {
      requireAuth(context);
      const queries = [
        pool.query(`SELECT COUNT(*) as c FROM customers`).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(`SELECT COUNT(*) as c FROM suppliers`).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(`SELECT COUNT(*) as c FROM employees`).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(`SELECT COUNT(*) as c FROM products`).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(`SELECT COUNT(*) as c FROM sales_orders WHERE status NOT IN ('completed','cancelled')`).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(`SELECT COUNT(*) as c FROM customer_invoices WHERE status = 'pending'`).catch(() => ({ rows: [{ c: 0 }] })),
      ];
      const [cust, sup, emp, prod, ord, inv] = await Promise.all(queries);
      return {
        customers: Number((cust.rows[0] as Record<string, unknown>)?.c || 0),
        suppliers: Number((sup.rows[0] as Record<string, unknown>)?.c || 0),
        employees: Number((emp.rows[0] as Record<string, unknown>)?.c || 0),
        products: Number((prod.rows[0] as Record<string, unknown>)?.c || 0),
        openOrders: Number((ord.rows[0] as Record<string, unknown>)?.c || 0),
        pendingInvoices: Number((inv.rows[0] as Record<string, unknown>)?.c || 0),
      };
    },
  };

  return fields;
}

const MutationResultType = new GraphQLObjectType({
  name: "MutationResult",
  fields: {
    success: { type: GraphQLBoolean },
    id: { type: GraphQLInt },
    data: { type: GraphQLString },
    error: { type: GraphQLString },
  },
});

function buildMutationFields(): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  fields["createRecord"] = {
    type: MutationResultType,
    args: {
      table: { type: new GraphQLNonNull(GraphQLString) },
      data: { type: new GraphQLNonNull(GraphQLString), description: "JSON string of fields" },
    },
    resolve: async (_root: unknown, args: { table: string; data: string }, context: GraphQLContext) => {
      const tableName = args.table.replace(/-/g, "_");
      if (!SAFE_COL.test(tableName)) return { success: false, error: "Invalid table name" };
      requireEntityAccess(context, tableName, "create");

      const cols = await getColumns(tableName);
      if (cols.length === 0) return { success: false, error: "Table not found" };

      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(args.data); } catch { return { success: false, error: "Invalid JSON" }; }

      const keys = Object.keys(parsed).filter(k => k !== "id" && SAFE_COL.test(k) && cols.includes(k));
      if (keys.length === 0) return { success: false, error: "No valid fields" };

      const vals = keys.map(k => parsed[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const colStr = keys.map(k => `"${k}"`).join(", ");

      const { rows } = await pool.query(
        `INSERT INTO ${tableName} (${colStr}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      return { success: true, id: (rows[0] as Record<string, unknown>)?.id as number, data: JSON.stringify(rows[0]) };
    },
  };

  fields["updateRecord"] = {
    type: MutationResultType,
    args: {
      table: { type: new GraphQLNonNull(GraphQLString) },
      id: { type: new GraphQLNonNull(GraphQLInt) },
      data: { type: new GraphQLNonNull(GraphQLString) },
    },
    resolve: async (_root: unknown, args: { table: string; id: number; data: string }, context: GraphQLContext) => {
      const tableName = args.table.replace(/-/g, "_");
      if (!SAFE_COL.test(tableName)) return { success: false, error: "Invalid table name" };
      requireEntityAccess(context, tableName, "update");

      const cols = await getColumns(tableName);
      if (cols.length === 0) return { success: false, error: "Table not found" };

      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(args.data); } catch { return { success: false, error: "Invalid JSON" }; }

      const keys = Object.keys(parsed).filter(k => k !== "id" && k !== "created_at" && SAFE_COL.test(k) && cols.includes(k));
      if (keys.length === 0) return { success: false, error: "No valid fields" };

      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const vals = [...keys.map(k => parsed[k]), args.id];
      const updatedAt = cols.includes("updated_at") ? `, "updated_at" = NOW()` : "";

      const { rows } = await pool.query(
        `UPDATE ${tableName} SET ${sets}${updatedAt} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (rows.length === 0) return { success: false, error: "Record not found" };
      return { success: true, id: args.id, data: JSON.stringify(rows[0]) };
    },
  };

  fields["deleteRecord"] = {
    type: MutationResultType,
    args: {
      table: { type: new GraphQLNonNull(GraphQLString) },
      id: { type: new GraphQLNonNull(GraphQLInt) },
    },
    resolve: async (_root: unknown, args: { table: string; id: number }, context: GraphQLContext) => {
      const tableName = args.table.replace(/-/g, "_");
      if (!SAFE_COL.test(tableName)) return { success: false, error: "Invalid table name" };
      requireEntityAccess(context, tableName, "delete");

      await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [args.id]);
      return { success: true, id: args.id };
    },
  };

  return fields;
}

const RecordChangeEventType = new GraphQLObjectType({
  name: "RecordChangeEvent",
  fields: {
    type: { type: GraphQLString },
    entityId: { type: GraphQLString },
    recordId: { type: GraphQLInt },
    data: { type: GraphQLString },
    status: { type: GraphQLString },
    oldStatus: { type: GraphQLString },
    timestamp: { type: GraphQLString },
  },
});

function createEventBusAsyncIterator(
  entityFilter?: string | null,
  eventTypes?: string[] | null
): AsyncIterableIterator<{ recordChanged: Record<string, unknown> }> {
  const events = (eventTypes && eventTypes.length > 0)
    ? eventTypes
    : ["record.created", "record.updated", "record.deleted"];

  type QueueItem = { recordChanged: Record<string, unknown> };
  const queue: QueueItem[] = [];
  let resolveWaiting: ((val: IteratorResult<QueueItem>) => void) | null = null;
  let done = false;

  const handler = (event: Record<string, unknown>) => {
    if (entityFilter && String(event.entityId) !== String(entityFilter)) return;

    const item: QueueItem = {
      recordChanged: {
        type: String(event.type || ""),
        entityId: String(event.entityId || ""),
        recordId: Number(event.recordId || 0),
        data: event.data ? JSON.stringify(event.data) : null,
        status: event.status ? String(event.status) : null,
        oldStatus: event.oldStatus ? String(event.oldStatus) : null,
        timestamp: event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : String(event.timestamp || new Date().toISOString()),
      },
    };

    if (resolveWaiting) {
      const resolve = resolveWaiting;
      resolveWaiting = null;
      resolve({ value: item, done: false });
    } else {
      queue.push(item);
    }
  };

  for (const evt of events) {
    eventBus.on(evt, handler);
  }

  return {
    next(): Promise<IteratorResult<QueueItem>> {
      if (done) return Promise.resolve({ value: undefined as unknown as QueueItem, done: true });
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift()!, done: false });
      }
      return new Promise((resolve) => { resolveWaiting = resolve; });
    },
    return(): Promise<IteratorResult<QueueItem>> {
      done = true;
      for (const evt of events) {
        eventBus.removeListener(evt, handler);
      }
      if (resolveWaiting) {
        resolveWaiting({ value: undefined as unknown as QueueItem, done: true });
        resolveWaiting = null;
      }
      return Promise.resolve({ value: undefined as unknown as QueueItem, done: true });
    },
    throw(err: Error): Promise<IteratorResult<QueueItem>> {
      done = true;
      for (const evt of events) {
        eventBus.removeListener(evt, handler);
      }
      return Promise.reject(err);
    },
    [Symbol.asyncIterator]() { return this; },
  };
}

export const erpGraphQLSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: () => buildEntityQueryFields() as Record<string, { type: GraphQLObjectType }>,
  }),
  mutation: new GraphQLObjectType({
    name: "Mutation",
    fields: () => buildMutationFields() as Record<string, { type: GraphQLObjectType }>,
  }),
  subscription: new GraphQLObjectType({
    name: "Subscription",
    fields: {
      recordChanged: {
        type: RecordChangeEventType,
        args: {
          entityId: { type: GraphQLString },
          events: { type: new GraphQLList(GraphQLString) },
        },
        subscribe: (
          _root: unknown,
          args: { entityId?: string | null; events?: string[] | null },
          context: GraphQLContext
        ) => {
          requireAuth(context);
          return createEventBusAsyncIterator(args.entityId, args.events);
        },
        resolve: (payload: { recordChanged: Record<string, unknown> }) => payload.recordChanged,
      },
    },
  }),
});
