import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

router.post("/builder-seed/populate", requireSuperAdmin, async (req, res) => {
  try {
    const results: Record<string, number> = {};

    const entityRows = await pool.query(`SELECT id, slug, name FROM module_entities ORDER BY id`);
    const entities = entityRows.rows;
    const entityMap: Record<string, number> = {};
    entities.forEach((e: any) => { entityMap[e.slug] = e.id; });

    const catCount = await pool.query(`SELECT COUNT(*) FROM entity_categories`);
    if (parseInt(catCount.rows[0].count) === 0) {
      const categories = [
        { entityId: entityMap['product'], name: 'פרופילי אלומיניום', slug: 'aluminum-profiles', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['product'], name: 'פרופילי ברזל', slug: 'iron-profiles', color: '#EF4444', sortOrder: 2 },
        { entityId: entityMap['product'], name: 'פרופילי נירוסטה', slug: 'stainless-steel-profiles', color: '#A855F7', sortOrder: 3 },
        { entityId: entityMap['product'], name: 'זכוכית', slug: 'glass', color: '#06B6D4', sortOrder: 4 },
        { entityId: entityMap['product'], name: 'אביזרים וחומרי עזר', slug: 'accessories', color: '#F59E0B', sortOrder: 5 },
        { entityId: entityMap['product'], name: 'חלונות', slug: 'windows', color: '#10B981', sortOrder: 6 },
        { entityId: entityMap['product'], name: 'דלתות', slug: 'doors', color: '#8B5CF6', sortOrder: 7 },
        { entityId: entityMap['product'], name: 'מעקות', slug: 'railings', color: '#F97316', sortOrder: 8 },
        { entityId: entityMap['product'], name: 'קירות מסך', slug: 'curtain-walls', color: '#14B8A6', sortOrder: 9 },
        { entityId: entityMap['product'], name: 'פרגולות', slug: 'pergolas', color: '#84CC16', sortOrder: 10 },
        { entityId: entityMap['raw-material-procurement'], name: 'אלומיניום גולמי', slug: 'raw-aluminum', color: '#60A5FA', sortOrder: 1 },
        { entityId: entityMap['raw-material-procurement'], name: 'ברזל גולמי', slug: 'raw-iron', color: '#F87171', sortOrder: 2 },
        { entityId: entityMap['raw-material-procurement'], name: 'נירוסטה גולמית', slug: 'raw-stainless', color: '#C084FC', sortOrder: 3 },
        { entityId: entityMap['raw-material-procurement'], name: 'זכוכית שטוחה', slug: 'flat-glass', color: '#22D3EE', sortOrder: 4 },
        { entityId: entityMap['raw-material-procurement'], name: 'חומרי איטום', slug: 'sealants', color: '#FBBF24', sortOrder: 5 },
        { entityId: entityMap['raw-material-procurement'], name: 'ברגים ומחברים', slug: 'fasteners', color: '#A3E635', sortOrder: 6 },
        { entityId: entityMap['supplier'], name: 'ספק מקומי', slug: 'local-supplier', color: '#10B981', sortOrder: 1 },
        { entityId: entityMap['supplier'], name: 'ספק חו"ל', slug: 'foreign-supplier-cat', color: '#6366F1', sortOrder: 2 },
        { entityId: entityMap['supplier'], name: 'קבלן משנה', slug: 'subcontractor', color: '#EC4899', sortOrder: 3 },
        { entityId: entityMap['supplier'], name: 'ספק שירותים', slug: 'service-provider', color: '#F59E0B', sortOrder: 4 },
        { entityId: entityMap['customer'], name: 'פרטי', slug: 'private-customer', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['customer'], name: 'עסקי', slug: 'business-customer', color: '#10B981', sortOrder: 2 },
        { entityId: entityMap['customer'], name: 'קבלן ראשי', slug: 'general-contractor', color: '#F59E0B', sortOrder: 3 },
        { entityId: entityMap['customer'], name: 'מוסד ציבורי', slug: 'public-institution', color: '#8B5CF6', sortOrder: 4 },
        { entityId: entityMap['customer'], name: 'אדריכל/מתכנן', slug: 'architect', color: '#EC4899', sortOrder: 5 },
        { entityId: entityMap['leads'], name: 'ליד מהאתר', slug: 'website-lead', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['leads'], name: 'ליד טלפוני', slug: 'phone-lead', color: '#10B981', sortOrder: 2 },
        { entityId: entityMap['leads'], name: 'המלצה', slug: 'referral-lead', color: '#F59E0B', sortOrder: 3 },
        { entityId: entityMap['leads'], name: 'מכרז', slug: 'tender-lead', color: '#8B5CF6', sortOrder: 4 },
        { entityId: entityMap['leads'], name: 'שיווק דיגיטלי', slug: 'digital-marketing-lead', color: '#EC4899', sortOrder: 5 },
        { entityId: entityMap['work-order'], name: 'חיתוך', slug: 'cutting', color: '#EF4444', sortOrder: 1 },
        { entityId: entityMap['work-order'], name: 'ריתוך', slug: 'welding', color: '#F97316', sortOrder: 2 },
        { entityId: entityMap['work-order'], name: 'כיפוף', slug: 'bending', color: '#FBBF24', sortOrder: 3 },
        { entityId: entityMap['work-order'], name: 'צביעה/ציפוי', slug: 'coating', color: '#84CC16', sortOrder: 4 },
        { entityId: entityMap['work-order'], name: 'זיגוג', slug: 'glazing', color: '#06B6D4', sortOrder: 5 },
        { entityId: entityMap['work-order'], name: 'הרכבה', slug: 'assembly', color: '#8B5CF6', sortOrder: 6 },
        { entityId: entityMap['work-order'], name: 'גימור', slug: 'finishing', color: '#EC4899', sortOrder: 7 },
        { entityId: entityMap['warehouse'], name: 'מחסן ראשי', slug: 'main-warehouse', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['warehouse'], name: 'מחסן חומרי גלם', slug: 'raw-materials-warehouse', color: '#F59E0B', sortOrder: 2 },
        { entityId: entityMap['warehouse'], name: 'מחסן מוצרים מוגמרים', slug: 'finished-goods-warehouse', color: '#10B981', sortOrder: 3 },
        { entityId: entityMap['warehouse'], name: 'אזור ייצור', slug: 'production-area', color: '#EF4444', sortOrder: 4 },
        { entityId: entityMap['equipment'], name: 'מכונת חיתוך', slug: 'cutting-machine', color: '#EF4444', sortOrder: 1 },
        { entityId: entityMap['equipment'], name: 'מכונת ריתוך', slug: 'welding-machine', color: '#F97316', sortOrder: 2 },
        { entityId: entityMap['equipment'], name: 'מכונת כיפוף', slug: 'bending-machine', color: '#FBBF24', sortOrder: 3 },
        { entityId: entityMap['equipment'], name: 'מכונת CNC', slug: 'cnc-machine', color: '#3B82F6', sortOrder: 4 },
        { entityId: entityMap['equipment'], name: 'תנור צביעה', slug: 'coating-oven', color: '#8B5CF6', sortOrder: 5 },
        { entityId: entityMap['equipment'], name: 'מלגזה', slug: 'forklift', color: '#10B981', sortOrder: 6 },
        { entityId: entityMap['equipment'], name: 'מנוף', slug: 'crane', color: '#06B6D4', sortOrder: 7 },
        { entityId: entityMap['invoice'], name: 'חשבונית מס', slug: 'tax-invoice', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['invoice'], name: 'חשבונית עסקה', slug: 'transaction-invoice', color: '#10B981', sortOrder: 2 },
        { entityId: entityMap['invoice'], name: 'חשבונית זיכוי', slug: 'credit-invoice', color: '#EF4444', sortOrder: 3 },
        { entityId: entityMap['invoice'], name: 'חשבונית מקדמה', slug: 'advance-invoice', color: '#F59E0B', sortOrder: 4 },
        { entityId: entityMap['installation'], name: 'התקנת חלונות', slug: 'window-installation', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['installation'], name: 'התקנת דלתות', slug: 'door-installation', color: '#10B981', sortOrder: 2 },
        { entityId: entityMap['installation'], name: 'התקנת מעקות', slug: 'railing-installation', color: '#F59E0B', sortOrder: 3 },
        { entityId: entityMap['installation'], name: 'התקנת קירות מסך', slug: 'curtain-wall-installation', color: '#8B5CF6', sortOrder: 4 },
        { entityId: entityMap['installation'], name: 'תיקון/אחריות', slug: 'warranty-repair', color: '#EF4444', sortOrder: 5 },
        { entityId: entityMap['project'], name: 'פרויקט בניה חדש', slug: 'new-construction', color: '#3B82F6', sortOrder: 1 },
        { entityId: entityMap['project'], name: 'שיפוץ', slug: 'renovation', color: '#10B981', sortOrder: 2 },
        { entityId: entityMap['project'], name: 'פרויקט תשתיות', slug: 'infrastructure', color: '#F59E0B', sortOrder: 3 },
        { entityId: entityMap['project'], name: 'פרויקט מיוחד', slug: 'special-project', color: '#8B5CF6', sortOrder: 4 },
      ];

      let catInserted = 0;
      for (const cat of categories) {
        if (cat.entityId) {
          await pool.query(
            `INSERT INTO entity_categories (entity_id, name, slug, color, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [cat.entityId, cat.name, cat.slug, cat.color, cat.sortOrder]
          );
          catInserted++;
        }
      }
      results.categories = catInserted;
    } else {
      results.categories_existing = parseInt(catCount.rows[0].count);
    }

    const actCount = await pool.query(`SELECT COUNT(*) FROM action_definitions`);
    if (parseInt(actCount.rows[0].count) === 0) {
      const actions = [
        { entityId: entityMap['leads'], name: 'המרה ללקוח', slug: 'convert-to-customer', actionType: 'status_change', icon: 'UserPlus', color: '#10B981' },
        { entityId: entityMap['leads'], name: 'שליחת הצעת מחיר', slug: 'send-quote', actionType: 'create_related', icon: 'FileText', color: '#3B82F6' },
        { entityId: entityMap['leads'], name: 'תזמון פגישה', slug: 'schedule-meeting', actionType: 'create_related', icon: 'Calendar', color: '#8B5CF6' },
        { entityId: entityMap['leads'], name: 'שליחת SMS', slug: 'send-sms', actionType: 'webhook', icon: 'MessageSquare', color: '#F59E0B' },
        { entityId: entityMap['leads'], name: 'שליחת WhatsApp', slug: 'send-whatsapp', actionType: 'webhook', icon: 'Phone', color: '#22C55E' },
        { entityId: entityMap['leads'], name: 'שליחת מייל', slug: 'send-email', actionType: 'webhook', icon: 'Mail', color: '#6366F1' },
        { entityId: entityMap['quote'], name: 'אישור הצעה', slug: 'approve-quote', actionType: 'status_change', icon: 'CheckCircle', color: '#10B981' },
        { entityId: entityMap['quote'], name: 'יצירת הזמנה', slug: 'create-order', actionType: 'create_related', icon: 'ShoppingCart', color: '#3B82F6' },
        { entityId: entityMap['quote'], name: 'שכפול הצעה', slug: 'duplicate-quote', actionType: 'custom', icon: 'Copy', color: '#8B5CF6' },
        { entityId: entityMap['quote'], name: 'שליחה ללקוח', slug: 'send-to-customer', actionType: 'webhook', icon: 'Send', color: '#F59E0B' },
        { entityId: entityMap['sales-order'], name: 'אישור הזמנה', slug: 'approve-order', actionType: 'status_change', icon: 'CheckCircle', color: '#10B981' },
        { entityId: entityMap['sales-order'], name: 'יצירת פרויקט', slug: 'create-project', actionType: 'create_related', icon: 'FolderKanban', color: '#8B5CF6' },
        { entityId: entityMap['sales-order'], name: 'יצירת פקודת עבודה', slug: 'create-work-order', actionType: 'create_related', icon: 'Wrench', color: '#F97316' },
        { entityId: entityMap['sales-order'], name: 'הפקת חשבונית', slug: 'generate-invoice', actionType: 'create_related', icon: 'Receipt', color: '#3B82F6' },
        { entityId: entityMap['work-order'], name: 'התחלת ייצור', slug: 'start-production', actionType: 'status_change', icon: 'Play', color: '#10B981' },
        { entityId: entityMap['work-order'], name: 'סיום ייצור', slug: 'complete-production', actionType: 'status_change', icon: 'CheckCircle', color: '#3B82F6' },
        { entityId: entityMap['work-order'], name: 'דיווח כשל איכות', slug: 'report-qc-failure', actionType: 'status_change', icon: 'AlertTriangle', color: '#EF4444' },
        { entityId: entityMap['work-order'], name: 'יצירת תעודת משלוח', slug: 'create-delivery', actionType: 'create_related', icon: 'Truck', color: '#F59E0B' },
        { entityId: entityMap['purchase-order'], name: 'אישור הזמנת רכש', slug: 'approve-po', actionType: 'status_change', icon: 'CheckCircle', color: '#10B981' },
        { entityId: entityMap['purchase-order'], name: 'שליחה לספק', slug: 'send-to-supplier', actionType: 'webhook', icon: 'Send', color: '#3B82F6' },
        { entityId: entityMap['purchase-order'], name: 'קבלת סחורה', slug: 'receive-goods', actionType: 'create_related', icon: 'Package', color: '#F59E0B' },
        { entityId: entityMap['delivery-note'], name: 'משלוח', slug: 'ship-delivery', actionType: 'status_change', icon: 'Truck', color: '#3B82F6' },
        { entityId: entityMap['delivery-note'], name: 'אישור קבלה', slug: 'confirm-receipt', actionType: 'status_change', icon: 'CheckCircle', color: '#10B981' },
        { entityId: entityMap['installation'], name: 'התחלת התקנה', slug: 'start-installation', actionType: 'status_change', icon: 'Play', color: '#10B981' },
        { entityId: entityMap['installation'], name: 'סיום התקנה', slug: 'complete-installation', actionType: 'status_change', icon: 'CheckCircle', color: '#3B82F6' },
        { entityId: entityMap['installation'], name: 'הפקת חשבונית סופית', slug: 'generate-final-invoice', actionType: 'create_related', icon: 'Receipt', color: '#F59E0B' },
        { entityId: entityMap['invoice'], name: 'שליחת חשבונית', slug: 'send-invoice', actionType: 'webhook', icon: 'Send', color: '#3B82F6' },
        { entityId: entityMap['invoice'], name: 'רישום תשלום', slug: 'record-payment', actionType: 'create_related', icon: 'CreditCard', color: '#10B981' },
        { entityId: entityMap['customer'], name: 'שליחת SMS', slug: 'customer-send-sms', actionType: 'webhook', icon: 'MessageSquare', color: '#F59E0B' },
        { entityId: entityMap['customer'], name: 'שליחת WhatsApp', slug: 'customer-send-whatsapp', actionType: 'webhook', icon: 'Phone', color: '#22C55E' },
        { entityId: entityMap['customer'], name: 'שליחת Telegram', slug: 'customer-send-telegram', actionType: 'webhook', icon: 'Send', color: '#0EA5E9' },
        { entityId: entityMap['customer'], name: 'שליחת מייל', slug: 'customer-send-email', actionType: 'webhook', icon: 'Mail', color: '#6366F1' },
      ];

      let actInserted = 0;
      for (const act of actions) {
        if (act.entityId) {
          await pool.query(
            `INSERT INTO action_definitions (entity_id, name, slug, action_type, handler_type, icon, color, sort_order, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) ON CONFLICT DO NOTHING`,
            [act.entityId, act.name, act.slug, act.actionType, act.actionType === 'webhook' ? 'webhook' : 'internal', act.icon, act.color, actInserted + 1]
          );
          actInserted++;
        }
      }
      results.actions = actInserted;
    } else {
      results.actions_existing = parseInt(actCount.rows[0].count);
    }

    const btnCount = await pool.query(`SELECT COUNT(*) FROM system_buttons`);
    if (parseInt(btnCount.rows[0].count) === 0) {
      const buttons = [
        { entityId: entityMap['leads'], name: 'המרה ללקוח', slug: 'convert-lead', buttonType: 'action', color: '#10B981', icon: 'UserPlus', sortOrder: 1 },
        { entityId: entityMap['leads'], name: 'שליחת הצעה', slug: 'send-quote-btn', buttonType: 'action', color: '#3B82F6', icon: 'FileText', sortOrder: 2 },
        { entityId: entityMap['leads'], name: 'SMS', slug: 'sms-lead', buttonType: 'integration', color: '#F59E0B', icon: 'MessageSquare', sortOrder: 3 },
        { entityId: entityMap['leads'], name: 'WhatsApp', slug: 'whatsapp-lead', buttonType: 'integration', color: '#22C55E', icon: 'Phone', sortOrder: 4 },
        { entityId: entityMap['leads'], name: 'מייל', slug: 'email-lead', buttonType: 'integration', color: '#6366F1', icon: 'Mail', sortOrder: 5 },
        { entityId: entityMap['quote'], name: 'אישור', slug: 'approve-quote-btn', buttonType: 'action', color: '#10B981', icon: 'CheckCircle', sortOrder: 1 },
        { entityId: entityMap['quote'], name: 'יצירת הזמנה', slug: 'create-order-btn', buttonType: 'action', color: '#3B82F6', icon: 'ShoppingCart', sortOrder: 2 },
        { entityId: entityMap['quote'], name: 'שכפול', slug: 'duplicate-quote-btn', buttonType: 'action', color: '#8B5CF6', icon: 'Copy', sortOrder: 3 },
        { entityId: entityMap['quote'], name: 'שליחה ללקוח', slug: 'send-quote-customer-btn', buttonType: 'integration', color: '#F59E0B', icon: 'Send', sortOrder: 4 },
        { entityId: entityMap['sales-order'], name: 'אישור הזמנה', slug: 'approve-so-btn', buttonType: 'action', color: '#10B981', icon: 'CheckCircle', sortOrder: 1 },
        { entityId: entityMap['sales-order'], name: 'פתיחת פרויקט', slug: 'open-project-btn', buttonType: 'action', color: '#8B5CF6', icon: 'FolderKanban', sortOrder: 2 },
        { entityId: entityMap['sales-order'], name: 'פקודת עבודה', slug: 'create-wo-btn', buttonType: 'action', color: '#F97316', icon: 'Wrench', sortOrder: 3 },
        { entityId: entityMap['sales-order'], name: 'חשבונית', slug: 'generate-inv-btn', buttonType: 'action', color: '#3B82F6', icon: 'Receipt', sortOrder: 4 },
        { entityId: entityMap['work-order'], name: 'התחל ייצור', slug: 'start-prod-btn', buttonType: 'action', color: '#10B981', icon: 'Play', sortOrder: 1 },
        { entityId: entityMap['work-order'], name: 'סיום ייצור', slug: 'complete-prod-btn', buttonType: 'action', color: '#3B82F6', icon: 'CheckCircle', sortOrder: 2 },
        { entityId: entityMap['work-order'], name: 'כשל QC', slug: 'qc-fail-btn', buttonType: 'action', color: '#EF4444', icon: 'AlertTriangle', sortOrder: 3 },
        { entityId: entityMap['work-order'], name: 'תעודת משלוח', slug: 'create-dn-btn', buttonType: 'action', color: '#F59E0B', icon: 'Truck', sortOrder: 4 },
        { entityId: entityMap['purchase-order'], name: 'אישור', slug: 'approve-po-btn', buttonType: 'action', color: '#10B981', icon: 'CheckCircle', sortOrder: 1 },
        { entityId: entityMap['purchase-order'], name: 'שליחה לספק', slug: 'send-po-btn', buttonType: 'integration', color: '#3B82F6', icon: 'Send', sortOrder: 2 },
        { entityId: entityMap['purchase-order'], name: 'קבלת סחורה', slug: 'receive-goods-btn', buttonType: 'action', color: '#F59E0B', icon: 'Package', sortOrder: 3 },
        { entityId: entityMap['invoice'], name: 'שליחה ללקוח', slug: 'send-inv-btn', buttonType: 'integration', color: '#3B82F6', icon: 'Send', sortOrder: 1 },
        { entityId: entityMap['invoice'], name: 'רישום תשלום', slug: 'record-pay-btn', buttonType: 'action', color: '#10B981', icon: 'CreditCard', sortOrder: 2 },
        { entityId: entityMap['customer'], name: 'SMS', slug: 'sms-customer', buttonType: 'integration', color: '#F59E0B', icon: 'MessageSquare', sortOrder: 1 },
        { entityId: entityMap['customer'], name: 'WhatsApp', slug: 'whatsapp-customer', buttonType: 'integration', color: '#22C55E', icon: 'Phone', sortOrder: 2 },
        { entityId: entityMap['customer'], name: 'Telegram', slug: 'telegram-customer', buttonType: 'integration', color: '#0EA5E9', icon: 'Send', sortOrder: 3 },
        { entityId: entityMap['customer'], name: 'מייל', slug: 'email-customer', buttonType: 'integration', color: '#6366F1', icon: 'Mail', sortOrder: 4 },
        { entityId: entityMap['installation'], name: 'התחל', slug: 'start-install-btn', buttonType: 'action', color: '#10B981', icon: 'Play', sortOrder: 1 },
        { entityId: entityMap['installation'], name: 'סיום', slug: 'complete-install-btn', buttonType: 'action', color: '#3B82F6', icon: 'CheckCircle', sortOrder: 2 },
        { entityId: entityMap['installation'], name: 'חשבונית', slug: 'install-inv-btn', buttonType: 'action', color: '#F59E0B', icon: 'Receipt', sortOrder: 3 },
      ];

      let btnInserted = 0;
      for (const btn of buttons) {
        if (btn.entityId) {
          await pool.query(
            `INSERT INTO system_buttons (entity_id, name, slug, button_type, color, icon, sort_order, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT DO NOTHING`,
            [btn.entityId, btn.name, btn.slug, btn.buttonType, btn.color, btn.icon, btn.sortOrder]
          );
          btnInserted++;
        }
      }
      results.buttons = btnInserted;
    } else {
      results.buttons_existing = parseInt(btnCount.rows[0].count);
    }

    const valCount = await pool.query(`SELECT COUNT(*) FROM validation_rules`);
    if (parseInt(valCount.rows[0].count) === 0) {
      const validations = [
        { entityId: entityMap['leads'], fieldSlug: 'name', name: 'שם חובה', ruleType: 'required', errorMessage: 'שם הליד הוא שדה חובה' },
        { entityId: entityMap['leads'], fieldSlug: 'phone', name: 'טלפון תקין', ruleType: 'pattern', errorMessage: 'מספר טלפון לא תקין' },
        { entityId: entityMap['leads'], fieldSlug: 'email', name: 'אימייל תקין', ruleType: 'email', errorMessage: 'כתובת אימייל לא תקינה' },
        { entityId: entityMap['customer'], fieldSlug: 'name', name: 'שם לקוח חובה', ruleType: 'required', errorMessage: 'שם הלקוח הוא שדה חובה' },
        { entityId: entityMap['customer'], fieldSlug: 'phone', name: 'טלפון לקוח', ruleType: 'pattern', errorMessage: 'מספר טלפון לא תקין' },
        { entityId: entityMap['quote'], fieldSlug: 'total', name: 'סכום חיובי', ruleType: 'min', errorMessage: 'סכום ההצעה חייב להיות חיובי' },
        { entityId: entityMap['quote'], fieldSlug: 'customer_id', name: 'לקוח חובה', ruleType: 'required', errorMessage: 'יש לבחור לקוח' },
        { entityId: entityMap['sales-order'], fieldSlug: 'delivery_date', name: 'תאריך אספקה', ruleType: 'required', errorMessage: 'תאריך אספקה הוא שדה חובה' },
        { entityId: entityMap['sales-order'], fieldSlug: 'total', name: 'סכום חיובי', ruleType: 'min', errorMessage: 'סכום ההזמנה חייב להיות חיובי' },
        { entityId: entityMap['work-order'], fieldSlug: 'quantity', name: 'כמות חיובית', ruleType: 'min', errorMessage: 'כמות חייבת להיות לפחות 1' },
        { entityId: entityMap['work-order'], fieldSlug: 'product_name', name: 'שם מוצר חובה', ruleType: 'required', errorMessage: 'שם המוצר הוא שדה חובה' },
        { entityId: entityMap['purchase-order'], fieldSlug: 'supplier_id', name: 'ספק חובה', ruleType: 'required', errorMessage: 'יש לבחור ספק' },
        { entityId: entityMap['purchase-order'], fieldSlug: 'total', name: 'סכום חיובי', ruleType: 'min', errorMessage: 'סכום ההזמנה חייב להיות חיובי' },
        { entityId: entityMap['invoice'], fieldSlug: 'customer_id', name: 'לקוח חובה', ruleType: 'required', errorMessage: 'יש לבחור לקוח' },
        { entityId: entityMap['invoice'], fieldSlug: 'total', name: 'סכום חיובי', ruleType: 'min', errorMessage: 'סכום החשבונית חייב להיות חיובי' },
        { entityId: entityMap['invoice'], fieldSlug: 'due_date', name: 'תאריך פירעון', ruleType: 'required', errorMessage: 'תאריך פירעון הוא שדה חובה' },
        { entityId: entityMap['delivery-note'], fieldSlug: 'customer_id', name: 'לקוח חובה', ruleType: 'required', errorMessage: 'יש לבחור לקוח לתעודת משלוח' },
        { entityId: entityMap['installation'], fieldSlug: 'address', name: 'כתובת חובה', ruleType: 'required', errorMessage: 'כתובת ההתקנה היא שדה חובה' },
        { entityId: entityMap['product'], fieldSlug: 'name', name: 'שם מוצר חובה', ruleType: 'required', errorMessage: 'שם המוצר הוא שדה חובה' },
        { entityId: entityMap['product'], fieldSlug: 'sku', name: 'מקט חובה', ruleType: 'required', errorMessage: 'מקט המוצר הוא שדה חובה' },
        { entityId: entityMap['supplier'], fieldSlug: 'name', name: 'שם ספק חובה', ruleType: 'required', errorMessage: 'שם הספק הוא שדה חובה' },
        { entityId: entityMap['employee'], fieldSlug: 'first_name', name: 'שם פרטי חובה', ruleType: 'required', errorMessage: 'שם פרטי הוא שדה חובה' },
        { entityId: entityMap['employee'], fieldSlug: 'id_number', name: 'ת.ז. תקינה', ruleType: 'pattern', errorMessage: 'מספר תעודת זהות לא תקין' },
      ];

      let valInserted = 0;
      for (const v of validations) {
        if (v.entityId) {
          const operator = v.ruleType === 'required' ? 'not_empty' : v.ruleType === 'email' ? 'matches_email' : v.ruleType === 'pattern' ? 'matches_pattern' : v.ruleType === 'min' ? 'greater_than' : 'equals';
          await pool.query(
            `INSERT INTO validation_rules (entity_id, field_slug, name, rule_type, operator, error_message, sort_order, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT DO NOTHING`,
            [v.entityId, v.fieldSlug, v.name, v.ruleType, operator, v.errorMessage, valInserted + 1]
          );
          valInserted++;
        }
      }
      results.validations = valInserted;
    } else {
      results.validations_existing = parseInt(valCount.rows[0].count);
    }

    const dpCount = await pool.query(`SELECT COUNT(*) FROM system_detail_pages`);
    if (parseInt(dpCount.rows[0].count) === 0) {
      const detailPages = [
        { entityId: entityMap['leads'], name: 'כרטיס ליד', slug: 'lead-detail', isDefault: true },
        { entityId: entityMap['customer'], name: 'כרטיס לקוח', slug: 'customer-detail', isDefault: true },
        { entityId: entityMap['quote'], name: 'כרטיס הצעת מחיר', slug: 'quote-detail', isDefault: true },
        { entityId: entityMap['sales-order'], name: 'כרטיס הזמנת לקוח', slug: 'sales-order-detail', isDefault: true },
        { entityId: entityMap['work-order'], name: 'כרטיס הזמנת עבודה', slug: 'work-order-detail', isDefault: true },
        { entityId: entityMap['purchase-order'], name: 'כרטיס הזמנת רכש', slug: 'purchase-order-detail', isDefault: true },
        { entityId: entityMap['invoice'], name: 'כרטיס חשבונית', slug: 'invoice-detail', isDefault: true },
        { entityId: entityMap['delivery-note'], name: 'כרטיס תעודת משלוח', slug: 'delivery-note-detail', isDefault: true },
        { entityId: entityMap['installation'], name: 'כרטיס התקנה', slug: 'installation-detail', isDefault: true },
        { entityId: entityMap['project'], name: 'כרטיס פרויקט', slug: 'project-detail', isDefault: true },
        { entityId: entityMap['supplier'], name: 'כרטיס ספק', slug: 'supplier-detail', isDefault: true },
        { entityId: entityMap['product'], name: 'כרטיס מוצר', slug: 'product-detail', isDefault: true },
        { entityId: entityMap['employee'], name: 'כרטיס עובד', slug: 'employee-detail', isDefault: true },
        { entityId: entityMap['equipment'], name: 'כרטיס ציוד', slug: 'equipment-detail', isDefault: true },
        { entityId: entityMap['contract'], name: 'כרטיס חוזה', slug: 'contract-detail', isDefault: true },
        { entityId: entityMap['warehouse'], name: 'כרטיס מחסן', slug: 'warehouse-detail', isDefault: true },
        { entityId: entityMap['payment'], name: 'כרטיס תשלום', slug: 'payment-detail', isDefault: true },
      ];

      let dpInserted = 0;
      for (const dp of detailPages) {
        if (dp.entityId) {
          await pool.query(
            `INSERT INTO system_detail_pages (entity_id, name, slug, is_default) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [dp.entityId, dp.name, dp.slug, dp.isDefault]
          );
          dpInserted++;
        }
      }
      results.detail_pages = dpInserted;
    } else {
      results.detail_pages_existing = parseInt(dpCount.rows[0].count);
    }

    const moduleRows = await pool.query(`SELECT id, slug FROM platform_modules ORDER BY id LIMIT 1`);
    const firstModuleId = moduleRows.rows[0]?.id || null;

    const dashCount = await pool.query(`SELECT COUNT(*) FROM system_dashboard_pages`);
    if (parseInt(dashCount.rows[0].count) === 0) {
      const dashPages = [
        { name: 'דשבורד ראשי', slug: 'main-dashboard', isDefault: true, layout: '{"columns":3}' },
        { name: 'דשבורד מכירות', slug: 'sales-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד ייצור', slug: 'production-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד כספים', slug: 'finance-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד מלאי', slug: 'inventory-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד משאבי אנוש', slug: 'hr-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד התקנות', slug: 'installation-dashboard', isDefault: false, layout: '{"columns":3}' },
        { name: 'דשבורד רכש', slug: 'procurement-dashboard', isDefault: false, layout: '{"columns":2}' },
      ];

      let dashInserted = 0;
      for (const dp of dashPages) {
        await pool.query(
          `INSERT INTO system_dashboard_pages (module_id, name, slug, is_default, layout) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT DO NOTHING`,
          [firstModuleId, dp.name, dp.slug, dp.isDefault, dp.layout]
        );
        dashInserted++;
      }
      results.dashboard_pages = dashInserted;
    } else {
      results.dashboard_pages_existing = parseInt(dashCount.rows[0].count);
    }

    const widgetCount = await pool.query(`SELECT COUNT(*) FROM system_dashboard_widgets`);
    if (parseInt(widgetCount.rows[0].count) === 0) {
      const dashId = await pool.query(`SELECT id FROM system_dashboard_pages WHERE slug = 'main-dashboard' LIMIT 1`);
      if (dashId.rows.length > 0) {
        const mainDashId = dashId.rows[0].id;
        const widgets = [
          { dashboardId: mainDashId, widgetType: 'counter', title: 'לידים חדשים', config: '{"entity":"leads","filter":{"status":"new"},"color":"blue"}', position: 1, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'counter', title: 'הזמנות פתוחות', config: '{"entity":"sales-order","filter":{"status":"confirmed"},"color":"green"}', position: 2, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'counter', title: 'פקודות עבודה', config: '{"entity":"work-order","filter":{"status":"in_progress"},"color":"orange"}', position: 3, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'chart', title: 'מכירות חודשיות', config: '{"chartType":"bar","entity":"sales-order","groupBy":"month","metric":"total"}', position: 4, size: '2x1' },
          { dashboardId: mainDashId, widgetType: 'list', title: 'לידים אחרונים', config: '{"entity":"leads","limit":10,"sort":"created_at desc"}', position: 5, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'counter', title: 'חשבוניות ממתינות', config: '{"entity":"invoice","filter":{"status":"sent"},"color":"yellow"}', position: 6, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'counter', title: 'התקנות בתהליך', config: '{"entity":"installation","filter":{"status":"in_progress"},"color":"purple"}', position: 7, size: '1x1' },
          { dashboardId: mainDashId, widgetType: 'counter', title: 'NCR פתוחים', config: '{"entity":"ncr","filter":{"status":"open"},"color":"red"}', position: 8, size: '1x1' },
        ];

        let widInserted = 0;
        for (const w of widgets) {
          await pool.query(
            `INSERT INTO system_dashboard_widgets (dashboard_id, widget_type, title, config, position, size) VALUES ($1, $2, $3, $4::jsonb, $5, $6) ON CONFLICT DO NOTHING`,
            [w.dashboardId, w.widgetType, w.title, w.config, w.position, w.size]
          );
          widInserted++;
        }
        results.dashboard_widgets = widInserted;
      }
    } else {
      results.dashboard_widgets_existing = parseInt(widgetCount.rows[0].count);
    }

    const menuCount = await pool.query(`SELECT COUNT(*) FROM system_menu_items`);
    if (parseInt(menuCount.rows[0].count) === 0) {
      const menuItems = [
        { label: 'דשבורד', labelHe: 'דשבורד', labelEn: 'Dashboard', path: '/', icon: 'LayoutDashboard', sortOrder: 1, section: 'main' },
        { label: 'CRM ומכירות', labelHe: 'CRM ומכירות', labelEn: 'CRM & Sales', path: '/crm', icon: 'Users', sortOrder: 2, section: 'crm' },
        { label: 'ייצור', labelHe: 'ייצור', labelEn: 'Production', path: '/production', icon: 'Factory', sortOrder: 3, section: 'production' },
        { label: 'רכש ומלאי', labelHe: 'רכש ומלאי', labelEn: 'Procurement', path: '/procurement', icon: 'ShoppingBag', sortOrder: 4, section: 'procurement' },
        { label: 'כספים', labelHe: 'כספים', labelEn: 'Finance', path: '/finance', icon: 'Banknote', sortOrder: 5, section: 'finance' },
        { label: 'משאבי אנוש', labelHe: 'משאבי אנוש', labelEn: 'HR', path: '/hr', icon: 'UserCog', sortOrder: 6, section: 'hr' },
        { label: 'התקנות', labelHe: 'התקנות', labelEn: 'Installations', path: '/installations', icon: 'HardHat', sortOrder: 7, section: 'installations' },
        { label: 'פרויקטים', labelHe: 'פרויקטים', labelEn: 'Projects', path: '/projects', icon: 'FolderKanban', sortOrder: 8, section: 'projects' },
        { label: 'דוחות', labelHe: 'דוחות', labelEn: 'Reports', path: '/reports', icon: 'BarChart3', sortOrder: 9, section: 'reports' },
        { label: 'הגדרות', labelHe: 'הגדרות', labelEn: 'Settings', path: '/settings', icon: 'Settings', sortOrder: 10, section: 'settings' },
      ];

      let menuInserted = 0;
      for (const m of menuItems) {
        await pool.query(
          `INSERT INTO system_menu_items (label, label_he, label_en, path, icon, sort_order, is_active, section) VALUES ($1, $2, $3, $4, $5, $6, true, $7) ON CONFLICT DO NOTHING`,
          [m.label, m.labelHe, m.labelEn, m.path, m.icon, m.sortOrder, m.section]
        );
        menuInserted++;
      }
      results.menu_items = menuInserted;
    } else {
      results.menu_items_existing = parseInt(menuCount.rows[0].count);
    }

    const tmplCount = await pool.query(`SELECT COUNT(*) FROM system_templates`);
    if (parseInt(tmplCount.rows[0].count) === 0) {
      const templates = [
        { name: 'חשבונית מס', slug: 'tax-invoice-template', templateType: 'document', content: JSON.stringify({title:'חשבונית מס',sections:['customer_name','invoice_number','items','total','vat'],format:'pdf'}) },
        { name: 'הצעת מחיר', slug: 'quote-template', templateType: 'document', content: JSON.stringify({title:'הצעת מחיר',sections:['customer_name','quote_number','items','total'],format:'pdf'}) },
        { name: 'תעודת משלוח', slug: 'delivery-note-template', templateType: 'document', content: JSON.stringify({title:'תעודת משלוח',sections:['customer_name','delivery_number','items'],format:'pdf'}) },
        { name: 'הזמנת רכש', slug: 'purchase-order-template', templateType: 'document', content: JSON.stringify({title:'הזמנת רכש',sections:['supplier_name','po_number','items','total'],format:'pdf'}) },
        { name: 'אישור הזמנה', slug: 'order-confirmation-template', templateType: 'email', content: JSON.stringify({subject:'אישור הזמנה',body:'שלום {{customer_name}}, הזמנתך מספר {{order_number}} אושרה.'}) },
        { name: 'תזכורת תשלום', slug: 'payment-reminder-template', templateType: 'email', content: JSON.stringify({subject:'תזכורת תשלום',body:'שלום {{customer_name}}, חשבונית מספר {{invoice_number}} טרם שולמה.'}) },
        { name: 'אישור התקנה', slug: 'installation-confirmation-template', templateType: 'email', content: JSON.stringify({subject:'אישור התקנה',body:'שלום {{customer_name}}, ההתקנה נקבעה לתאריך {{installation_date}}.'}) },
        { name: 'הודעת SMS - תזכורת', slug: 'sms-reminder-template', templateType: 'sms', content: JSON.stringify({body:'שלום {{name}}, תזכורת: {{reminder_text}}. טכנו-כל עוזי'}) },
        { name: 'WhatsApp - עדכון סטטוס', slug: 'whatsapp-status-template', templateType: 'whatsapp', content: JSON.stringify({body:'שלום {{name}}, עדכון לגבי הזמנתך: {{status_text}}'}) },
      ];

      let tmplInserted = 0;
      for (const t of templates) {
        await pool.query(
          `INSERT INTO system_templates (name, slug, template_type, content, is_active) VALUES ($1, $2, $3, $4::jsonb, true) ON CONFLICT DO NOTHING`,
          [t.name, t.slug, t.templateType, t.content]
        );
        tmplInserted++;
      }
      results.templates = tmplInserted;
    } else {
      results.templates_existing = parseInt(tmplCount.rows[0].count);
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error("[builder-seed] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/builder-seed/status", requireSuperAdmin, async (req, res) => {
  try {
    const counts: Record<string, number> = {};
    const tables = ['entity_categories', 'action_definitions', 'system_buttons', 'validation_rules', 'system_detail_pages', 'system_dashboard_pages', 'system_dashboard_widgets', 'system_menu_items', 'system_templates'];
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      counts[t] = parseInt(r.rows[0].count);
    }
    res.json(counts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
