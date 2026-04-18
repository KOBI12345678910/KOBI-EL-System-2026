import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cpq_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(300) NOT NULL,
      product_family VARCHAR(200),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
      base_price NUMERIC(15,2) DEFAULT 0,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cpq_option_groups (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES cpq_templates(id) ON DELETE CASCADE,
      name VARCHAR(300) NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_required BOOLEAN DEFAULT false,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 999,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cpq_options (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES cpq_option_groups(id) ON DELETE CASCADE,
      name VARCHAR(300) NOT NULL,
      code VARCHAR(100),
      price_impact NUMERIC(15,2) DEFAULT 0,
      is_default BOOLEAN DEFAULT false,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cpq_constraint_rules (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES cpq_templates(id) ON DELETE CASCADE,
      rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('requires','excludes','limits')),
      source_option_id INTEGER REFERENCES cpq_options(id) ON DELETE CASCADE,
      target_option_id INTEGER REFERENCES cpq_options(id) ON DELETE CASCADE,
      message VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cpq_sessions (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES cpq_templates(id),
      customer_id INTEGER,
      customer_name VARCHAR(300),
      selected_options JSONB DEFAULT '[]',
      calculated_price NUMERIC(15,2) DEFAULT 0,
      generated_bom JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','validated','approved','rejected')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cpq_pricing_rules (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES cpq_templates(id) ON DELETE CASCADE,
      name VARCHAR(300) NOT NULL,
      rule_type VARCHAR(30) DEFAULT 'discount' CHECK (rule_type IN ('discount','surcharge','volume','bundle')),
      condition JSONB DEFAULT '{}',
      value NUMERIC(15,4) DEFAULT 0,
      value_type VARCHAR(20) DEFAULT 'percentage' CHECK (value_type IN ('percentage','fixed')),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cpq_templates_status ON cpq_templates(status);
    CREATE INDEX IF NOT EXISTS idx_cpq_option_groups_template ON cpq_option_groups(template_id);
    CREATE INDEX IF NOT EXISTS idx_cpq_options_group ON cpq_options(group_id);
    CREATE INDEX IF NOT EXISTS idx_cpq_constraints_template ON cpq_constraint_rules(template_id);
    CREATE INDEX IF NOT EXISTS idx_cpq_sessions_template ON cpq_sessions(template_id);
    CREATE INDEX IF NOT EXISTS idx_cpq_sessions_status ON cpq_sessions(status);
  `);
}
ensureTables().catch(() => {});

// ══════════ TEMPLATES ══════════

router.post("/cpq/templates", async (req, res) => {
  try {
    const { name, product_family, base_price, description } = req.body;
    if (!name) return res.status(400).json({ error: "שם תבנית נדרש" });
    const result = await pool.query(
      `INSERT INTO cpq_templates (name, product_family, base_price, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, product_family || null, base_price || 0, description || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/cpq/templates", async (req, res) => {
  try {
    const { status } = req.query;
    let q = `SELECT t.*,
      (SELECT COUNT(*) FROM cpq_option_groups g WHERE g.template_id = t.id) as group_count,
      (SELECT COUNT(*) FROM cpq_sessions s WHERE s.template_id = t.id) as session_count
      FROM cpq_templates t`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` WHERE t.status = $1`; }
    q += ` ORDER BY t.updated_at DESC`;
    const result = await pool.query(q, params);
    res.json({ templates: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/cpq/templates/:id", async (req, res) => {
  try {
    const tmpl = await pool.query(`SELECT * FROM cpq_templates WHERE id = $1`, [req.params.id]);
    if (tmpl.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    const groups = await pool.query(
      `SELECT g.*, json_agg(json_build_object('id',o.id,'name',o.name,'code',o.code,'price_impact',o.price_impact,'is_default',o.is_default) ORDER BY o.id) as options
       FROM cpq_option_groups g LEFT JOIN cpq_options o ON o.group_id = g.id
       WHERE g.template_id = $1 GROUP BY g.id ORDER BY g.display_order`,
      [req.params.id]
    );
    const constraints = await pool.query(`SELECT * FROM cpq_constraint_rules WHERE template_id = $1`, [req.params.id]);
    const pricingRules = await pool.query(`SELECT * FROM cpq_pricing_rules WHERE template_id = $1 AND is_active = true`, [req.params.id]);
    res.json({ ...tmpl.rows[0], option_groups: groups.rows, constraint_rules: constraints.rows, pricing_rules: pricingRules.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/cpq/templates/:id", async (req, res) => {
  try {
    const { name, product_family, status, base_price, description } = req.body;
    const result = await pool.query(
      `UPDATE cpq_templates SET name=COALESCE($1,name), product_family=COALESCE($2,product_family),
       status=COALESCE($3,status), base_price=COALESCE($4,base_price), description=COALESCE($5,description),
       updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, product_family, status, base_price, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════ OPTIONS & GROUPS ══════════

router.post("/cpq/option-groups", async (req, res) => {
  try {
    const { template_id, name, display_order, is_required, min_selections, max_selections } = req.body;
    const result = await pool.query(
      `INSERT INTO cpq_option_groups (template_id, name, display_order, is_required, min_selections, max_selections)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [template_id, name, display_order || 0, is_required || false, min_selections || 0, max_selections || 999]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cpq/options", async (req, res) => {
  try {
    const { group_id, name, code, price_impact, is_default, description } = req.body;
    const result = await pool.query(
      `INSERT INTO cpq_options (group_id, name, code, price_impact, is_default, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [group_id, name, code || null, price_impact || 0, is_default || false, description || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cpq/constraints", async (req, res) => {
  try {
    const { template_id, rule_type, source_option_id, target_option_id, message } = req.body;
    const result = await pool.query(
      `INSERT INTO cpq_constraint_rules (template_id, rule_type, source_option_id, target_option_id, message)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [template_id, rule_type, source_option_id, target_option_id, message || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════ SESSIONS ══════════

router.post("/cpq/sessions", async (req, res) => {
  try {
    const { template_id, customer_id, customer_name, notes } = req.body;
    if (!template_id) return res.status(400).json({ error: "template_id נדרש" });
    // Load template defaults
    const defaults = await pool.query(
      `SELECT o.id, o.name, o.code, o.price_impact FROM cpq_options o
       JOIN cpq_option_groups g ON g.id = o.group_id
       WHERE g.template_id = $1 AND o.is_default = true`,
      [template_id]
    );
    const tmpl = await pool.query(`SELECT base_price FROM cpq_templates WHERE id = $1`, [template_id]);
    const basePrice = Number(tmpl.rows[0]?.base_price || 0);
    const defaultOptions = defaults.rows;
    const initialPrice = basePrice + defaultOptions.reduce((sum, o) => sum + Number(o.price_impact || 0), 0);

    const result = await pool.query(
      `INSERT INTO cpq_sessions (template_id, customer_id, customer_name, selected_options, calculated_price, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [template_id, customer_id || null, customer_name || null, JSON.stringify(defaultOptions.map(o => o.id)), initialPrice, notes || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/cpq/sessions", async (req, res) => {
  try {
    const { status, template_id } = req.query;
    let q = `SELECT s.*, t.name as template_name FROM cpq_sessions s JOIN cpq_templates t ON t.id = s.template_id WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND s.status = $${params.length}`; }
    if (template_id) { params.push(template_id); q += ` AND s.template_id = $${params.length}`; }
    q += ` ORDER BY s.updated_at DESC LIMIT 100`;
    const result = await pool.query(q, params);
    res.json({ sessions: result.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/cpq/sessions/:id/options", async (req, res) => {
  try {
    const { selected_options } = req.body;
    const result = await pool.query(
      `UPDATE cpq_sessions SET selected_options = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(selected_options || []), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Validate constraints ──
router.post("/cpq/sessions/:id/validate", async (req, res) => {
  try {
    const session = await pool.query(`SELECT * FROM cpq_sessions WHERE id = $1`, [req.params.id]);
    if (session.rows.length === 0) return res.status(404).json({ error: "סשן לא נמצא" });

    const selectedIds: number[] = session.rows[0].selected_options || [];
    const constraints = await pool.query(
      `SELECT * FROM cpq_constraint_rules WHERE template_id = $1`,
      [session.rows[0].template_id]
    );

    const violations: { rule_id: number; rule_type: string; message: string }[] = [];
    for (const rule of constraints.rows) {
      const srcSelected = selectedIds.includes(rule.source_option_id);
      const tgtSelected = selectedIds.includes(rule.target_option_id);
      if (rule.rule_type === "requires" && srcSelected && !tgtSelected) {
        violations.push({ rule_id: rule.id, rule_type: "requires", message: rule.message || `אפשרות ${rule.source_option_id} דורשת את אפשרות ${rule.target_option_id}` });
      }
      if (rule.rule_type === "excludes" && srcSelected && tgtSelected) {
        violations.push({ rule_id: rule.id, rule_type: "excludes", message: rule.message || `אפשרות ${rule.source_option_id} סותרת את אפשרות ${rule.target_option_id}` });
      }
    }

    // Check group min/max selections
    const groups = await pool.query(
      `SELECT g.id, g.name, g.is_required, g.min_selections, g.max_selections,
        array_agg(o.id) as option_ids
       FROM cpq_option_groups g JOIN cpq_options o ON o.group_id = g.id
       WHERE g.template_id = $1 GROUP BY g.id`,
      [session.rows[0].template_id]
    );
    for (const grp of groups.rows) {
      const grpSelected = (grp.option_ids || []).filter((oid: number) => selectedIds.includes(oid)).length;
      if (grp.is_required && grpSelected === 0) {
        violations.push({ rule_id: 0, rule_type: "limits", message: `קבוצה "${grp.name}" חובה - נדרשת בחירה אחת לפחות` });
      }
      if (grpSelected < grp.min_selections) {
        violations.push({ rule_id: 0, rule_type: "limits", message: `קבוצה "${grp.name}" דורשת לפחות ${grp.min_selections} בחירות` });
      }
      if (grpSelected > grp.max_selections) {
        violations.push({ rule_id: 0, rule_type: "limits", message: `קבוצה "${grp.name}" מאפשרת לכל היותר ${grp.max_selections} בחירות` });
      }
    }

    const valid = violations.length === 0;
    if (valid) {
      await pool.query(`UPDATE cpq_sessions SET status = 'validated', updated_at = NOW() WHERE id = $1`, [req.params.id]);
    }
    res.json({ valid, violations, checked_options: selectedIds.length, checked_rules: constraints.rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Calculate price ──
router.post("/cpq/sessions/:id/calculate-price", async (req, res) => {
  try {
    const session = await pool.query(`SELECT * FROM cpq_sessions WHERE id = $1`, [req.params.id]);
    if (session.rows.length === 0) return res.status(404).json({ error: "סשן לא נמצא" });

    const templateId = session.rows[0].template_id;
    const selectedIds: number[] = session.rows[0].selected_options || [];

    const tmpl = await pool.query(`SELECT base_price FROM cpq_templates WHERE id = $1`, [templateId]);
    const basePrice = Number(tmpl.rows[0]?.base_price || 0);

    // Sum option price impacts
    let optionsTotal = 0;
    if (selectedIds.length > 0) {
      const opts = await pool.query(`SELECT price_impact FROM cpq_options WHERE id = ANY($1::int[])`, [selectedIds]);
      optionsTotal = opts.rows.reduce((sum, o) => sum + Number(o.price_impact || 0), 0);
    }

    // Apply pricing rules
    const pricingRules = await pool.query(`SELECT * FROM cpq_pricing_rules WHERE template_id = $1 AND is_active = true ORDER BY id`, [templateId]);
    let subtotal = basePrice + optionsTotal;
    const appliedRules: any[] = [];
    for (const rule of pricingRules.rows) {
      let adjustment = 0;
      if (rule.value_type === "percentage") {
        adjustment = subtotal * (Number(rule.value) / 100);
      } else {
        adjustment = Number(rule.value);
      }
      if (rule.rule_type === "discount") adjustment = -Math.abs(adjustment);
      if (rule.rule_type === "surcharge") adjustment = Math.abs(adjustment);
      subtotal += adjustment;
      appliedRules.push({ rule_name: rule.name, type: rule.rule_type, adjustment: Math.round(adjustment * 100) / 100 });
    }

    const finalPrice = Math.round(subtotal * 100) / 100;
    await pool.query(`UPDATE cpq_sessions SET calculated_price = $1, updated_at = NOW() WHERE id = $2`, [finalPrice, req.params.id]);

    res.json({
      base_price: basePrice,
      options_total: optionsTotal,
      applied_rules: appliedRules,
      final_price: finalPrice,
      selected_count: selectedIds.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Generate BOM ──
router.post("/cpq/sessions/:id/generate-bom", async (req, res) => {
  try {
    const session = await pool.query(`SELECT * FROM cpq_sessions WHERE id = $1`, [req.params.id]);
    if (session.rows.length === 0) return res.status(404).json({ error: "סשן לא נמצא" });

    const selectedIds: number[] = session.rows[0].selected_options || [];
    const tmpl = await pool.query(`SELECT * FROM cpq_templates WHERE id = $1`, [session.rows[0].template_id]);

    const bom: any[] = [
      { line: 1, item_code: `BASE-${tmpl.rows[0]?.product_family || "GEN"}`, description: tmpl.rows[0]?.name || "מוצר בסיס", quantity: 1, unit_price: Number(tmpl.rows[0]?.base_price || 0), type: "base" }
    ];

    if (selectedIds.length > 0) {
      const opts = await pool.query(
        `SELECT o.*, g.name as group_name FROM cpq_options o
         JOIN cpq_option_groups g ON g.id = o.group_id
         WHERE o.id = ANY($1::int[])`,
        [selectedIds]
      );
      opts.rows.forEach((o, i) => {
        bom.push({
          line: i + 2,
          item_code: o.code || `OPT-${o.id}`,
          description: `${o.group_name}: ${o.name}`,
          quantity: 1,
          unit_price: Number(o.price_impact || 0),
          type: "option",
        });
      });
    }

    const totalPrice = bom.reduce((sum, b) => sum + b.unit_price * b.quantity, 0);
    bom.push({ line: bom.length + 1, item_code: "TOTAL", description: "סה״כ", quantity: 1, unit_price: totalPrice, type: "total" });

    await pool.query(
      `UPDATE cpq_sessions SET generated_bom = $1, calculated_price = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(bom), totalPrice, req.params.id]
    );

    res.json({ bom, total_lines: bom.length, total_price: totalPrice });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ──
router.get("/cpq/dashboard", async (req, res) => {
  try {
    const [templates, sessions, avgPrice, byStatus, recentSessions] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM cpq_templates WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) FROM cpq_sessions`),
      pool.query(`SELECT COALESCE(AVG(calculated_price),0) as avg_price FROM cpq_sessions WHERE calculated_price > 0`),
      pool.query(`SELECT status, COUNT(*) as count FROM cpq_sessions GROUP BY status ORDER BY count DESC`),
      pool.query(`SELECT s.*, t.name as template_name FROM cpq_sessions s JOIN cpq_templates t ON t.id = s.template_id ORDER BY s.updated_at DESC LIMIT 10`),
    ]);
    res.json({
      active_templates: Number(templates.rows[0].count),
      total_sessions: Number(sessions.rows[0].count),
      average_price: Math.round(Number(avgPrice.rows[0].avg_price) * 100) / 100,
      sessions_by_status: byStatus.rows,
      recent_sessions: recentSessions.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
