import { db } from "@workspace/db";
import { entityRecordsTable, moduleEntitiesTable, notificationsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { eventBus, type RecordEvent } from "./event-bus";
import { VAT_RATE } from "../constants";

interface EnrichmentResult {
  handler: string;
  entitySlug: string;
  recordId: number;
  fieldsEnriched: string[];
  success: boolean;
  error?: string;
  timestamp: string;
}

const enrichmentHistory: EnrichmentResult[] = [];
const MAX_HISTORY = 300;

function addEnrichmentResult(result: EnrichmentResult) {
  enrichmentHistory.unshift(result);
  if (enrichmentHistory.length > MAX_HISTORY) enrichmentHistory.length = MAX_HISTORY;
}

export function getEnrichmentHistory(limit = 100): EnrichmentResult[] {
  return enrichmentHistory.slice(0, limit);
}

export function getEnrichmentStats() {
  const last24h = enrichmentHistory.filter(r => new Date(r.timestamp).getTime() > Date.now() - 86400000);
  const successCount = last24h.filter(r => r.success).length;
  const byHandler: Record<string, number> = {};
  for (const r of last24h) {
    byHandler[r.handler] = (byHandler[r.handler] || 0) + 1;
  }
  return {
    total: enrichmentHistory.length,
    last24h: last24h.length,
    successRate: last24h.length > 0 ? Math.round((successCount / last24h.length) * 100) : 100,
    totalFieldsEnriched: last24h.reduce((s, r) => s + r.fieldsEnriched.length, 0),
    byHandler,
  };
}

const entitySlugCache = new Map<number, string>();

async function getEntitySlug(entityId: number): Promise<string | null> {
  if (entitySlugCache.has(entityId)) return entitySlugCache.get(entityId)!;
  const [entity] = await db
    .select({ slug: moduleEntitiesTable.slug })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.id, entityId));
  if (entity) {
    entitySlugCache.set(entityId, entity.slug);
    return entity.slug;
  }
  return null;
}

async function findEntityBySlug(slug: string): Promise<number | null> {
  const slugs = [slug, slug + "s", slug.replace(/_/g, "-")];
  for (const s of slugs) {
    const [entity] = await db
      .select({ id: moduleEntitiesTable.id })
      .from(moduleEntitiesTable)
      .where(eq(moduleEntitiesTable.slug, s));
    if (entity) return entity.id;
  }
  return null;
}

async function updateRecordData(recordId: number, enrichedFields: Record<string, any>) {
  const [existing] = await db
    .select()
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.id, recordId));
  if (!existing) return;
  const currentData = (existing.data as Record<string, any>) || {};
  await db
    .update(entityRecordsTable)
    .set({
      data: { ...currentData, ...enrichedFields, _last_enriched: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(entityRecordsTable.id, recordId));
}

function extractCustomerIntent(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};
  const notes = String(data.notes || data.description || data.requirements || "").toLowerCase();
  const name = String(data.name || data.company_name || "").toLowerCase();

  if (notes.includes("אלומיניום") || notes.includes("aluminum")) enriched.material_preference = "אלומיניום";
  else if (notes.includes("פלדה") || notes.includes("steel") || notes.includes("ברזל")) enriched.material_preference = "פלדה/ברזל";
  else if (notes.includes("נירוסטה") || notes.includes("stainless")) enriched.material_preference = "נירוסטה";
  else if (notes.includes("זכוכית") || notes.includes("glass")) enriched.material_preference = "זכוכית";

  if (notes.includes("דחוף") || notes.includes("urgent") || notes.includes("בהקדם")) enriched.urgency_level = "high";
  else if (notes.includes("לא דחוף") || notes.includes("flexible")) enriched.urgency_level = "low";
  else enriched.urgency_level = "normal";

  if (notes.includes("חלון") || notes.includes("window")) enriched.project_type = "חלונות";
  else if (notes.includes("דלת") || notes.includes("door")) enriched.project_type = "דלתות";
  else if (notes.includes("מעקה") || notes.includes("railing") || notes.includes("מרפסת")) enriched.project_type = "מעקות";
  else if (notes.includes("פרגולה") || notes.includes("pergola")) enriched.project_type = "פרגולות";
  else if (notes.includes("שער") || notes.includes("gate")) enriched.project_type = "שערים";
  else if (notes.includes("חזית") || notes.includes("facade") || notes.includes("קירות מסך")) enriched.project_type = "חזיתות";
  else if (notes.includes("תריס") || notes.includes("shutter")) enriched.project_type = "תריסים";

  const budgetMatch = notes.match(/(\d[\d,.]+)\s*(ש[״"]ח|₪|ils|שקל)/i);
  if (budgetMatch) enriched.estimated_budget = parseFloat(budgetMatch[1].replace(/,/g, ""));

  const dimMatch = notes.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (dimMatch) {
    enriched.extracted_width = parseFloat(dimMatch[1]);
    enriched.extracted_height = parseFloat(dimMatch[2]);
  }

  const qtyMatch = notes.match(/(\d+)\s*(יחידות|units|חלונות|דלתות|פריטים)/);
  if (qtyMatch) enriched.extracted_quantity = parseInt(qtyMatch[1]);

  enriched.ai_classification = "rule_based";
  enriched.ai_enriched_at = new Date().toISOString();

  return enriched;
}

function extractQuotationContext(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};
  const amount = Number(data.total || data.amount || data.total_amount || 0);

  if (amount > 0) {
    enriched.price_tier = amount > 100000 ? "enterprise" : amount > 30000 ? "business" : amount > 10000 ? "standard" : "basic";
    enriched.vat_amount = Math.round(amount * VAT_RATE * 100) / 100;
    enriched.amount_with_vat = Math.round(amount * (1 + VAT_RATE) * 100) / 100;
  }

  if (data.items && Array.isArray(data.items)) {
    enriched.item_count = data.items.length;
    enriched.total_units = data.items.reduce((s: number, i: any) => s + Number(i.quantity || i.qty || 0), 0);
    const materials = new Set<string>();
    for (const item of data.items) {
      if (item.material) materials.add(String(item.material));
      if (item.material_type) materials.add(String(item.material_type));
    }
    if (materials.size > 0) enriched.materials_required = Array.from(materials);
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

function extractProductionContext(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};

  if (data.items && Array.isArray(data.items)) {
    const materialTypes = new Set<string>();
    let totalCutLength = 0;
    let totalArea = 0;

    for (const item of data.items) {
      if (item.material_type || item.material) materialTypes.add(String(item.material_type || item.material));
      const w = Number(item.width || 0);
      const h = Number(item.height || 0);
      const qty = Number(item.quantity || 1);
      if (w > 0 && h > 0) {
        totalArea += (w * h * qty) / 1000000;
        totalCutLength += (2 * (w + h) * qty) / 1000;
      }
    }

    if (materialTypes.size > 0) enriched.production_material_types = Array.from(materialTypes);
    if (totalArea > 0) enriched.total_production_area_m2 = Math.round(totalArea * 100) / 100;
    if (totalCutLength > 0) enriched.total_cut_length_m = Math.round(totalCutLength * 100) / 100;
  }

  if (data.deadline || data.due_date || data.delivery_date) {
    const deadline = new Date(data.deadline || data.due_date || data.delivery_date);
    const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    enriched.days_until_deadline = daysUntil;
    enriched.production_priority = daysUntil <= 3 ? "critical" : daysUntil <= 7 ? "high" : daysUntil <= 14 ? "normal" : "low";
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

function extractProcurementSignals(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};

  if (data.items && Array.isArray(data.items)) {
    const materialNeeds: Record<string, number> = {};
    for (const item of data.items) {
      const mat = String(item.material_id || item.raw_material_id || item.material || "unknown");
      const qty = Number(item.quantity || 0);
      if (qty > 0) materialNeeds[mat] = (materialNeeds[mat] || 0) + qty;
    }
    enriched.procurement_material_needs = materialNeeds;
    enriched.procurement_line_count = data.items.length;
  }

  const amount = Number(data.total_amount || data.total || data.amount || 0);
  if (amount > 0) {
    enriched.procurement_approval_required = amount > 50000;
    enriched.procurement_budget_tier = amount > 100000 ? "large" : amount > 20000 ? "medium" : "small";
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

function extractFinanceContext(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};
  const amount = Number(data.total || data.amount || data.total_amount || 0);
  const cost = Number(data.cost || data.total_cost || data.production_cost || 0);

  if (amount > 0) {
    enriched.revenue_amount = amount;
    enriched.vat_component = Math.round(amount * VAT_RATE * 100) / 100;
    enriched.net_revenue = Math.round(amount / (1 + VAT_RATE) * 100) / 100;
  }

  if (amount > 0 && cost > 0) {
    enriched.gross_profit = Math.round((amount - cost) * 100) / 100;
    enriched.gross_margin_pct = Math.round(((amount - cost) / amount) * 10000) / 100;
    enriched.profitability_tier = enriched.gross_margin_pct > 30 ? "high" : enriched.gross_margin_pct > 15 ? "normal" : "low";
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

function extractInstallationContext(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};

  if (data.address || data.site_address || data.installation_address) {
    enriched.site_location = data.address || data.site_address || data.installation_address;
  }

  if (data.items && Array.isArray(data.items)) {
    enriched.installation_item_count = data.items.length;
    enriched.estimated_installation_hours = data.items.length * 2;
  }

  if (data.customer_name || data.client_name) {
    enriched.installation_customer = data.customer_name || data.client_name;
  }

  if (data.scheduled_date || data.installation_date) {
    const schedDate = new Date(data.scheduled_date || data.installation_date);
    enriched.days_until_installation = Math.ceil((schedDate.getTime() - Date.now()) / 86400000);
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

function extractDeliveryContext(data: Record<string, any>): Record<string, any> {
  const enriched: Record<string, any> = {};

  if (data.items && Array.isArray(data.items)) {
    enriched.delivery_item_count = data.items.length;
    enriched.total_delivery_units = data.items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);

    let totalWeight = 0;
    for (const item of data.items) {
      const w = Number(item.weight || item.unit_weight || 0);
      const q = Number(item.quantity || 1);
      totalWeight += w * q;
    }
    if (totalWeight > 0) enriched.estimated_weight_kg = Math.round(totalWeight * 100) / 100;
  }

  if (data.delivery_address || data.address || data.shipping_address) {
    enriched.delivery_destination = data.delivery_address || data.address || data.shipping_address;
  }

  enriched.ai_enriched_at = new Date().toISOString();
  return enriched;
}

async function enrichRecord(event: RecordEvent, slug: string): Promise<void> {
  const data = event.data;
  let enrichedFields: Record<string, any> = {};
  let handler = "";

  const leadSlugs = ["lead", "leads", "crm_lead"];
  const customerSlugs = ["customer", "customers", "client", "clients"];
  const quoteSlugs = ["quotation", "quotations", "quote", "quotes", "price_quote", "price_quotes", "הצעת_מחיר"];
  const soSlugs = ["sales_order", "sales_orders", "order", "orders"];
  const woSlugs = ["work_order", "work_orders", "production_order", "production_work_order"];
  const poSlugs = ["purchase_order", "purchase_orders", "po"];
  const invoiceSlugs = ["invoice", "invoices", "sales_invoice"];
  const deliverySlugs = ["delivery_note", "delivery_notes", "shipment"];
  const installSlugs = ["installation", "installations", "installation_order"];

  if (leadSlugs.includes(slug)) {
    handler = "lead_enrichment";
    enrichedFields = extractCustomerIntent(data);
  } else if (customerSlugs.includes(slug)) {
    handler = "customer_enrichment";
    enrichedFields = extractCustomerIntent(data);
  } else if (quoteSlugs.includes(slug)) {
    handler = "quotation_enrichment";
    enrichedFields = { ...extractQuotationContext(data), ...extractFinanceContext(data) };
  } else if (soSlugs.includes(slug)) {
    handler = "sales_order_enrichment";
    enrichedFields = { ...extractProductionContext(data), ...extractProcurementSignals(data), ...extractFinanceContext(data) };
  } else if (woSlugs.includes(slug)) {
    handler = "work_order_enrichment";
    enrichedFields = extractProductionContext(data);
  } else if (poSlugs.includes(slug)) {
    handler = "purchase_order_enrichment";
    enrichedFields = extractProcurementSignals(data);
  } else if (invoiceSlugs.includes(slug)) {
    handler = "invoice_enrichment";
    enrichedFields = extractFinanceContext(data);
  } else if (deliverySlugs.includes(slug)) {
    handler = "delivery_enrichment";
    enrichedFields = extractDeliveryContext(data);
  } else if (installSlugs.includes(slug)) {
    handler = "installation_enrichment";
    enrichedFields = extractInstallationContext(data);
  } else {
    return;
  }

  if (Object.keys(enrichedFields).length === 0) return;

  try {
    await updateRecordData(event.recordId, enrichedFields);
    addEnrichmentResult({
      handler,
      entitySlug: slug,
      recordId: event.recordId,
      fieldsEnriched: Object.keys(enrichedFields),
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    addEnrichmentResult({
      handler,
      entitySlug: slug,
      recordId: event.recordId,
      fieldsEnriched: [],
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function initializeAIEnrichment(): void {
  eventBus.on("record.created", async (event: RecordEvent) => {
    try {
      const slug = await getEntitySlug(event.entityId);
      if (slug) await enrichRecord(event, slug);
    } catch (err) {
      console.error("[AIEnrichment] Error on record.created:", err);
    }
  });

  eventBus.on("record.updated", async (event: RecordEvent) => {
    try {
      const slug = await getEntitySlug(event.entityId);
      if (slug) await enrichRecord(event, slug);
    } catch (err) {
      console.error("[AIEnrichment] Error on record.updated:", err);
    }
  });

  console.log("[AIEnrichment] Initialized - AI data enrichment layer active");
}
