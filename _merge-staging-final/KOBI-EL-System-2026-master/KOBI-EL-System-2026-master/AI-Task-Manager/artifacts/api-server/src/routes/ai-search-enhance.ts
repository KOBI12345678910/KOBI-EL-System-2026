import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function callAnthropicRanking(query: string, results: any[]): Promise<any[]> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ? 'claude-sonnet-4-6' : 'claude-3-5-haiku-20241022';

  if (!apiKey || results.length === 0) return results;

  const prompt = `משתמש חיפש: "${query}"

מצאנו ${results.length} תוצאות. עבור כל תוצאה, תן ציון רלוונטיות בין 0-100 ותיאור קצר למה היא רלוונטית.
החזר JSON מערך בלבד: [{"index": 0, "relevance": 85, "reason": "..."}, ...]

תוצאות:
${results.slice(0, 20).map((r, i) => `${i}. [${r.type}] ${r.title} — ${r.description || ''}`).join('\n')}`;

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return results;

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return results;

    const rankings: Array<{ index: number; relevance: number; reason: string }> = JSON.parse(jsonMatch[0]);
    const ranked = [...results];
    rankings.forEach(r => {
      if (ranked[r.index]) {
        ranked[r.index].relevance = r.relevance;
        ranked[r.index].aiReason = r.reason;
      }
    });

    return ranked.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  } catch {
    return results;
  }
}

router.get('/ai-search', async (req: any, res: any) => {
  const query = (req.query.q as string || '').trim();
  if (!query || query.length < 1) {
    return res.json({ results: [], categories: {}, aiEnhanced: false });
  }

  const likeQ = `%${query}%`;
  const results: any[] = [];

  const SEARCH_TABLES = [
    { table: 'customers', label: 'לקוחות', type: 'customers', href: '/customers', cols: ['name', 'contact_person', 'phone', 'email'], titleCol: 'name', descCols: ['contact_person', 'phone'] },
    { table: 'sales_customers', label: 'לקוחות מכירות', type: 'customers', href: '/customers', cols: ['name', 'contact_person', 'phone', 'email'], titleCol: 'name', descCols: ['contact_person', 'phone'] },
    { table: 'suppliers', label: 'ספקים', type: 'suppliers', href: '/suppliers', cols: ['supplier_name', 'contact_person', 'phone', 'email'], titleCol: 'supplier_name', descCols: ['contact_person', 'phone'] },
    { table: 'employees', label: 'עובדים', type: 'employees', href: '/hr', cols: ['first_name', 'last_name', 'employee_number', 'email'], titleCol: "COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')", descCols: ['employee_number', 'email'] },
    { table: 'raw_materials', label: 'חומרי גלם', type: 'materials', href: '/raw-materials', cols: ['sku', 'category', 'description'], titleCol: "COALESCE(sku, category)", descCols: ['category', 'description'] },
    { table: 'products', label: 'מוצרים', type: 'products', href: '/products', cols: ['product_name', 'sku', 'description'], titleCol: "COALESCE(product_name, sku)", descCols: ['sku', 'description'] },
    { table: 'purchase_orders', label: 'הזמנות רכש', type: 'purchase_orders', href: '/purchase-orders', cols: ['order_number', 'status', 'notes'], titleCol: "COALESCE(order_number, '#' || id::text)", descCols: ['status', 'notes'] },
    { table: 'sales_orders', label: 'הזמנות מכירה', type: 'sales_orders', href: '/sales/orders', cols: ['order_number', 'customer_name', 'status'], titleCol: "COALESCE(order_number, '#' || id::text)", descCols: ['customer_name', 'status'] },
    { table: 'sales_invoices', label: 'חשבוניות', type: 'invoices', href: '/sales/invoices', cols: ['invoice_number', 'customer_name', 'status'], titleCol: "COALESCE(invoice_number, '#' || id::text)", descCols: ['customer_name', 'status'] },
    { table: 'sales_quotations', label: 'הצעות מחיר', type: 'quotes', href: '/sales/quotations', cols: ['quote_number', 'customer_name', 'status'], titleCol: "COALESCE(quote_number, '#' || id::text)", descCols: ['customer_name', 'status'] },
    { table: 'projects', label: 'פרויקטים', type: 'projects', href: '/projects', cols: ['project_number', 'customer_name', 'description'], titleCol: "COALESCE(project_number, '#' || id::text)", descCols: ['customer_name', 'description'] },
    { table: 'crm_leads', label: 'לידים', type: 'leads', href: '/crm/leads', cols: ['first_name', 'last_name', 'phone', 'email', 'status'], titleCol: "COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')", descCols: ['phone', 'email', 'status'] },
  ];

  await Promise.all(
    SEARCH_TABLES.map(async (tbl) => {
      try {
        const whereClause = tbl.cols.map(c => `COALESCE(${c}::text,'') ILIKE $1`).join(' OR ');
        const descExpr = tbl.descCols.map(c => `COALESCE(${c}::text,'')`).join(" || ' · ' || ");
        const sql = `
          SELECT id, (${tbl.titleCol}) as title,
                 (${descExpr}) as description
          FROM ${tbl.table}
          WHERE ${whereClause}
          LIMIT 5
        `;
        const r = await pool.query(sql, [likeQ]);
        r.rows.forEach(row => {
          results.push({
            type: tbl.type,
            typeLabel: tbl.label,
            title: row.title || '',
            description: row.description || '',
            href: tbl.href,
            id: row.id,
            relevance: 50,
          });
        });
      } catch (err: any) {
        console.warn(`[ai-search] Error in table ${tbl.table}:`, err?.message);
      }
    })
  );

  let aiEnhanced = false;
  let finalResults = results;

  if (results.length > 0 && results.length <= 40) {
    try {
      finalResults = await callAnthropicRanking(query, results);
      aiEnhanced = true;
    } catch {}
  }

  const categories: Record<string, any[]> = {};
  finalResults.forEach(r => {
    if (!categories[r.type]) categories[r.type] = [];
    categories[r.type].push(r);
  });

  res.json({
    results: finalResults.slice(0, 30),
    categories,
    total: results.length,
    aiEnhanced,
    query,
  });
});

export default router;
