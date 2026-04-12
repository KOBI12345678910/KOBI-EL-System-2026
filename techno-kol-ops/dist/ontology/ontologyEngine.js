"use strict";
// ════════════════════════════════════════════════════════════
//
//   TECHNO-KOL ONTOLOGY ENGINE
//   גרף אובייקטים מאוחד — Palantir Foundry-style
//
//   STUB VERSION — בנוי לפעול עם הסכמה הקיימת.
//   בעת קבלת הגרסה הקנונית מהמשתמש — להחליף.
//
// ════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.ontologyEngine = exports.ONTOLOGY_SCHEMA = void 0;
const connection_1 = require("../db/connection");
// ── סכמת אונטולוגיה
exports.ONTOLOGY_SCHEMA = {
    WorkOrder: {
        table: 'work_orders',
        display: 'product',
        preview: ['client_name', 'status', 'progress'],
        links: [
            { type: 'belongsTo', target: 'Client', foreignKey: 'client_id' },
            { type: 'hasMany', target: 'Task', foreignKey: 'order_id' }
        ]
    },
    Project: {
        table: 'projects',
        display: 'title',
        preview: ['client_name', 'current_stage', 'total_price'],
        links: [
            { type: 'belongsTo', target: 'Client', foreignKey: 'client_id' }
        ]
    },
    Employee: {
        table: 'employees',
        display: 'name',
        preview: ['role', 'department'],
        links: [
            { type: 'hasMany', target: 'Task', foreignKey: 'employee_id' }
        ]
    },
    Client: {
        table: 'clients',
        display: 'name',
        preview: ['type', 'phone'],
        links: [
            { type: 'hasMany', target: 'WorkOrder', foreignKey: 'client_id' },
            { type: 'hasMany', target: 'Project', foreignKey: 'client_id' }
        ]
    },
    MaterialItem: {
        table: 'material_items',
        display: 'name',
        preview: ['category', 'qty', 'unit'],
        links: [
            { type: 'belongsTo', target: 'Supplier', foreignKey: 'supplier_id' }
        ]
    },
    Lead: {
        table: 'leads',
        display: 'name',
        preview: ['phone', 'status', 'estimated_value'],
        links: [
            { type: 'belongsTo', target: 'Employee', foreignKey: 'assigned_to' }
        ]
    },
    Supplier: {
        table: 'suppliers',
        display: 'name',
        preview: ['phone', 'category'],
        links: [
            { type: 'hasMany', target: 'MaterialItem', foreignKey: 'supplier_id' }
        ]
    },
    Task: {
        table: 'tasks',
        display: 'title',
        preview: ['employee_id', 'status', 'scheduled_date'],
        links: [
            { type: 'belongsTo', target: 'Employee', foreignKey: 'employee_id' },
            { type: 'belongsTo', target: 'WorkOrder', foreignKey: 'order_id' }
        ]
    },
    Alert: {
        table: 'alerts',
        display: 'title',
        preview: ['severity', 'entity_type'],
        links: []
    }
};
// ── חישובי properties
async function computeProperties(type, obj) {
    const computed = {};
    if (type === 'WorkOrder') {
        computed.is_overdue = obj.delivery_date && new Date(obj.delivery_date) < new Date()
            && !['delivered', 'cancelled'].includes(obj.status);
        computed.days_until_delivery = obj.delivery_date
            ? Math.ceil((new Date(obj.delivery_date).getTime() - Date.now()) / 86400000)
            : null;
        computed.margin_pct = obj.price && obj.cost_actual
            ? Math.round((parseFloat(obj.price) - parseFloat(obj.cost_actual)) / parseFloat(obj.price) * 100)
            : null;
    }
    if (type === 'Project') {
        computed.is_stuck = obj.stage_updated_at
            && (Date.now() - new Date(obj.stage_updated_at).getTime()) > 7 * 86400000;
        computed.completion_pct = obj.current_stage === 'project_closed' ? 100 : null;
    }
    if (type === 'MaterialItem') {
        computed.is_critical = parseFloat(obj.qty || '0') <= parseFloat(obj.min_threshold || '0') * 0.3;
        computed.is_low = parseFloat(obj.qty || '0') <= parseFloat(obj.min_threshold || '0');
        computed.stock_value = parseFloat(obj.qty || '0') * parseFloat(obj.cost_per_unit || '0');
    }
    if (type === 'Employee') {
        const { rows } = await (0, connection_1.query)(`
      SELECT location FROM attendance WHERE employee_id=$1 AND date=CURRENT_DATE
    `, [obj.id]).catch(() => ({ rows: [] }));
        computed.is_present_today = rows[0]?.location && ['factory', 'field'].includes(rows[0].location);
        computed.current_location = rows[0]?.location || 'unknown';
    }
    return computed;
}
exports.ontologyEngine = {
    // ── קבל אובייקט עם links
    async getObject(type, id) {
        const schema = exports.ONTOLOGY_SCHEMA[type];
        if (!schema)
            throw new Error(`Unknown object type: ${type}`);
        const { rows } = await (0, connection_1.query)(`SELECT * FROM ${schema.table} WHERE id=$1`, [id]);
        if (!rows[0])
            throw new Error(`${type} not found: ${id}`);
        const obj = rows[0];
        const computed = await computeProperties(type, obj);
        // קבל links
        const links = [];
        for (const link of schema.links) {
            try {
                const targetSchema = exports.ONTOLOGY_SCHEMA[link.target];
                if (!targetSchema)
                    continue;
                if (link.type === 'hasMany') {
                    const { rows: linkedRows } = await (0, connection_1.query)(`SELECT id, * FROM ${targetSchema.table} WHERE ${link.foreignKey}=$1 LIMIT 5`, [id]);
                    for (const lr of linkedRows) {
                        links.push({
                            type: link.type,
                            target_type: link.target,
                            target_id: lr.id,
                            target_name: lr[targetSchema.display]
                        });
                    }
                }
                else if (link.type === 'belongsTo' && obj[link.foreignKey]) {
                    const { rows: linkedRows } = await (0, connection_1.query)(`SELECT id, * FROM ${targetSchema.table} WHERE id=$1`, [obj[link.foreignKey]]);
                    if (linkedRows[0]) {
                        links.push({
                            type: link.type,
                            target_type: link.target,
                            target_id: linkedRows[0].id,
                            target_name: linkedRows[0][targetSchema.display]
                        });
                    }
                }
            }
            catch { }
        }
        return {
            type,
            id: obj.id,
            properties: obj,
            computed,
            links
        };
    },
    // ── חיפוש גלובלי
    async globalSearch(q, types) {
        const searchTypes = types || Object.keys(exports.ONTOLOGY_SCHEMA);
        const results = [];
        for (const type of searchTypes) {
            const schema = exports.ONTOLOGY_SCHEMA[type];
            try {
                const { rows } = await (0, connection_1.query)(`SELECT * FROM ${schema.table} WHERE ${schema.display}::text ILIKE $1 LIMIT 5`, [`%${q}%`]);
                for (const row of rows) {
                    results.push({
                        type,
                        id: row.id,
                        display_name: row[schema.display],
                        preview: schema.preview.map(p => row[p]).filter(Boolean).join(' · ')
                    });
                }
            }
            catch { }
        }
        return results;
    },
    // ── תאום דיגיטלי של המפעל
    async getDigitalTwin() {
        const [orders, materials, finance, employees, leads, alerts, tasks] = await Promise.all([
            (0, connection_1.query)(`
        SELECT
          COUNT(*) FILTER (WHERE status='production') as in_production,
          COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled')) as active_orders,
          COUNT(*) FILTER (WHERE delivery_date < CURRENT_DATE AND status NOT IN ('delivered','cancelled')) as overdue,
          SUM(price) FILTER (WHERE status NOT IN ('delivered','cancelled')) as pipeline_value,
          AVG(progress) FILTER (WHERE status='production') as avg_progress
        FROM work_orders
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT
          COUNT(*) FILTER (WHERE qty <= min_threshold * 0.3) as critical_materials,
          COUNT(*) FILTER (WHERE qty <= min_threshold) as low_materials,
          SUM(qty * cost_per_unit) as total_inventory_value
        FROM material_items WHERE is_active=true
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
            AND date >= date_trunc('month', CURRENT_DATE)), 0) as revenue_mtd,
          COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','salary','material_cost')
            AND date >= date_trunc('month', CURRENT_DATE)), 0) as costs_mtd,
          COALESCE(SUM(amount) FILTER (WHERE is_paid=false AND date < CURRENT_DATE), 0) as overdue_receivables
        FROM financial_transactions
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM attendance a WHERE a.employee_id=employees.id
              AND a.date=CURRENT_DATE AND a.location='factory'
          )) as present,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM attendance a WHERE a.employee_id=employees.id
              AND a.date=CURRENT_DATE AND a.location='field'
          )) as field,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM attendance a WHERE a.employee_id=employees.id
              AND a.date=CURRENT_DATE AND a.location='sick'
          )) as sick
        FROM employees WHERE is_active=true
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('won','lost')) as open_leads,
          COUNT(DISTINCT client_id) as active_clients,
          SUM(estimated_value) FILTER (WHERE status NOT IN ('won','lost')) as pipeline_leads_value
        FROM leads
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT
          COUNT(*) FILTER (WHERE severity='critical') as critical,
          COUNT(*) FILTER (WHERE severity='danger') as danger,
          COUNT(*) FILTER (WHERE severity='warning') as warning
        FROM alerts WHERE is_resolved=false
      `).catch(() => ({ rows: [{}] })),
            (0, connection_1.query)(`
        SELECT status, COUNT(*) as count
        FROM tasks WHERE scheduled_date=CURRENT_DATE
        GROUP BY status
      `).catch(() => ({ rows: [] }))
        ]);
        const o = orders.rows[0];
        const m = materials.rows[0];
        const f = finance.rows[0];
        const e = employees.rows[0];
        const l = leads.rows[0];
        const a = alerts.rows[0];
        const revenueMtd = parseFloat(f?.revenue_mtd || '0');
        const costsMtd = parseFloat(f?.costs_mtd || '0');
        const grossMargin = revenueMtd > 0 ? Math.round((revenueMtd - costsMtd) / revenueMtd * 100) : 0;
        return {
            timestamp: new Date().toISOString(),
            production: {
                in_production: parseInt(o?.in_production || '0'),
                active_orders: parseInt(o?.active_orders || '0'),
                overdue: parseInt(o?.overdue || '0'),
                pipeline_value: Math.round(parseFloat(o?.pipeline_value || '0')),
                avg_progress: Math.round(parseFloat(o?.avg_progress || '0')),
                capacity_utilization: Math.min(100, Math.round(parseInt(o?.in_production || '0') / 12 * 100))
            },
            supply_chain: {
                critical_materials: parseInt(m?.critical_materials || '0'),
                low_materials: parseInt(m?.low_materials || '0'),
                total_inventory_value: Math.round(parseFloat(m?.total_inventory_value || '0'))
            },
            finance: {
                revenue_mtd: Math.round(revenueMtd),
                costs_mtd: Math.round(costsMtd),
                gross_margin: grossMargin,
                overdue_receivables: Math.round(parseFloat(f?.overdue_receivables || '0'))
            },
            workforce: {
                total: parseInt(e?.total || '0'),
                present: parseInt(e?.present || '0'),
                field: parseInt(e?.field || '0'),
                sick: parseInt(e?.sick || '0')
            },
            commercial: {
                active_clients: parseInt(l?.active_clients || '0'),
                open_leads: parseInt(l?.open_leads || '0'),
                pipeline_leads_value: Math.round(parseFloat(l?.pipeline_leads_value || '0'))
            },
            alerts: {
                critical: parseInt(a?.critical || '0'),
                danger: parseInt(a?.danger || '0'),
                warning: parseInt(a?.warning || '0')
            },
            tasks_today: tasks.rows
        };
    }
};
