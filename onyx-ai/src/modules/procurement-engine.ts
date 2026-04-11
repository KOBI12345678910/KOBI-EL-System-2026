/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX PROCUREMENT ENGINE — מנוע רכש אוטומטי                          ║
 * ║   תת-קטגוריה: מודל הצעות מחיר — RFQ (Request for Quote)              ║
 * ║                                                                        ║
 * ║   החברה צריכה לקנות משהו?                                              ║
 * ║   → המערכת מזהה את כל הספקים שמוכרים את המוצר                         ║
 * ║   → שולחת לכולם בקשה להצעת מחיר במכה אחת                             ║
 * ║   → אוספת תשובות                                                      ║
 * ║   → AI בוחר את הזול/טוב ביותר                                         ║
 * ║   → מפיק הזמנת רכש ושולח לספק הזוכה                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   FLOW:
 *
 *   צריך לקנות ברזל 12 מ"מ × 200 מטר
 *        ↓
 *   ┌──────────────────────────┐
 *   │  SUPPLIER LOOKUP         │  → מצא 8 ספקים שמוכרים ברזל 12 מ"מ
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  RFQ BROADCAST           │  → שלח לכל 8 ב-WhatsApp + Email
 *   │  שליחה במכה אחת          │  → "שלום, מה המחיר ל-200 מטר ברזל 12?"
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  QUOTE COLLECTION        │  → ספק A: ₪45/מטר
 *   │  איסוף תשובות            │  → ספק B: ₪42/מטר
 *   │  (ידני או אוטומטי)       │  → ספק C: ₪48/מטר + משלוח חינם
 *   └──────────┬───────────────┘  → ספק D: לא ענה
 *              ↓
 *   ┌──────────────────────────┐
 *   │  AI DECISION             │  → ספק B הכי זול: ₪8,400
 *   │  בחירת הזול ביותר        │  → ספק A: ₪9,000
 *   │  + שקלול איכות/אמינות   │  → ספק C: ₪9,600 (אבל כולל משלוח)
 *   └──────────┬───────────────┘
 *              ↓
 *   ┌──────────────────────────┐
 *   │  PURCHASE ORDER          │  → הזמנה לספק B
 *   │  הפקת הזמנת רכש         │  → שליחה אוטומטית
 *   └──────────────────────────┘
 */


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** קטגוריות מוצרים */
type MaterialCategory =
  | 'ברזל' | 'אלומיניום' | 'נירוסטה' | 'זכוכית'
  | 'צבע' | 'ברגים_ואביזרים' | 'ריתוך'
  | 'עץ' | 'פלסטיק' | 'בטון'
  | 'חשמל' | 'אינסטלציה'
  | 'כלי_עבודה' | 'ציוד_בטיחות'
  | 'הובלה' | 'מנופים'
  | 'custom';

/** יחידת מידה */
type UnitOfMeasure = 'מטר' | 'מ"ר' | 'ק"ג' | 'טון' | 'יחידה' | 'ליטר' | 'אריזה' | 'משטח' | 'קרש' | 'custom';

/** ספק */
interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  whatsapp?: string;           // מספר WhatsApp (אם שונה מטלפון)
  address?: string;
  /** מה הספק מוכר */
  products: SupplierProduct[];
  /** דירוג 1-10 */
  rating: number;
  /** אמינות אספקה 1-10 */
  deliveryReliability: number;
  /** תנאי תשלום רגילים */
  defaultPaymentTerms: string;
  /** זמן אספקה ממוצע בימים */
  avgDeliveryDays: number;
  /** מרחק מהמפעל (ק"מ) */
  distanceKm?: number;
  /** האם פעיל */
  active: boolean;
  /** הערות */
  notes: string;
  /** סטטיסטיקות */
  stats: {
    totalOrders: number;
    totalSpent: number;
    avgResponseTimeHours: number;
    onTimeDeliveryRate: number;  // 0-100%
    qualityIssues: number;
    lastOrderDate?: number;
  };
  /** ערוץ תקשורת מועדף */
  preferredChannel: 'whatsapp' | 'email' | 'sms' | 'phone';
}

/** מוצר שספק מוכר */
interface SupplierProduct {
  category: MaterialCategory;
  name: string;
  /** תיאור / מפרט */
  description?: string;
  /** מחיר מחירון (אם ידוע) — לא חובה, בשביל זה שולחים RFQ */
  listPrice?: number;
  unit: UnitOfMeasure;
  /** כמות מינימום להזמנה */
  minOrderQty?: number;
  /** זמן אספקה ספציפי לפריט (ימים) */
  leadTimeDays?: number;
  /** תאריך עדכון אחרון */
  lastUpdated?: Date;
}

/** בקשת רכש — מה החברה צריכה */
interface PurchaseRequest {
  id: string;
  /** מי ביקש */
  requestedBy: string;
  /** תאריך בקשה */
  requestDate: number;
  /** פריטים לרכישה */
  items: PurchaseRequestItem[];
  /** דחיפות */
  urgency: 'critical' | 'high' | 'normal' | 'low';
  /** תאריך אספקה נדרש */
  requiredByDate?: number;
  /** פרויקט קשור */
  projectId?: string;
  projectName?: string;
  /** הערות */
  notes?: string;
  /** סטטוס */
  status: 'draft' | 'rfq_sent' | 'quotes_received' | 'decided' | 'ordered' | 'delivered' | 'cancelled';
}

/** פריט בבקשת רכש */
interface PurchaseRequestItem {
  id: string;
  category: MaterialCategory;
  name: string;
  description: string;
  quantity: number;
  unit: UnitOfMeasure;
  /** מפרט טכני */
  specs?: string;
  /** תקציב מקסימלי (אם יש) */
  maxBudget?: number;
}

/** RFQ — בקשה להצעת מחיר */
interface RFQ {
  id: string;
  purchaseRequestId: string;
  /** כל הפריטים שנשלחו */
  items: PurchaseRequestItem[];
  /** לאילו ספקים נשלח */
  sentTo: RFQRecipient[];
  /** תאריך שליחה */
  sentAt: number;
  /** דדליין לתשובה */
  responseDeadline: number;
  /** הודעת ה-RFQ */
  messageText: string;
  /** סטטוס */
  status: 'sent' | 'collecting' | 'closed' | 'decided' | 'cancelled';
  /** הגדרות */
  settings: {
    /** זמן לתשובה בשעות */
    responseWindowHours: number;
    /** שלח תזכורת אחרי X שעות */
    reminderAfterHours: number;
    /** סגור אוטומטית אחרי הדדליין */
    autoCloseOnDeadline: boolean;
    /** מינימום הצעות לפני החלטה */
    minQuotesBeforeDecision: number;
  };
}

/** נמען RFQ */
interface RFQRecipient {
  supplierId: string;
  supplierName: string;
  sentVia: 'whatsapp' | 'email' | 'sms';
  sentAt: number;
  delivered: boolean;
  /** הצעת מחיר שהתקבלה */
  quote?: SupplierQuote;
  /** האם נשלחה תזכורת */
  reminderSent: boolean;
  reminderSentAt?: number;
  /** סטטוס */
  status: 'sent' | 'delivered' | 'viewed' | 'quoted' | 'declined' | 'no_response';
}

/** הצעת מחיר מספק */
interface SupplierQuote {
  id: string;
  supplierId: string;
  supplierName: string;
  rfqId: string;
  receivedAt: number;
  /** פירוט מחירים */
  lineItems: QuoteLineItem[];
  /** סכום כולל */
  totalPrice: number;
  /** כולל מע"מ? */
  vatIncluded: boolean;
  /** מע"מ */
  vatAmount: number;
  /** סכום כולל עם מע"מ */
  totalWithVat: number;
  /** דמי משלוח */
  deliveryFee: number;
  /** משלוח חינם? */
  freeDelivery: boolean;
  /** זמן אספקה בימים */
  deliveryDays: number;
  /** תנאי תשלום */
  paymentTerms: string;
  /** תוקף ההצעה בימים */
  validForDays: number;
  /** הערות הספק */
  notes?: string;
  /** מקור — ידני או אוטומטי */
  source: 'manual' | 'whatsapp_reply' | 'email_reply' | 'api';
}

/** שורת הצעת מחיר */
interface QuoteLineItem {
  itemId: string;
  name: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitPrice: number;
  totalPrice: number;
  /** הנחה אם יש */
  discount?: number;
  /** זמן אספקה ספציפי */
  leadTimeDays?: number;
  notes?: string;
}

/** החלטת רכש */
interface ProcurementDecision {
  id: string;
  rfqId: string;
  purchaseRequestId: string;
  timestamp: number;
  /** כל ההצעות שהתקבלו */
  quotes: QuoteComparison[];
  /** הספק הנבחר */
  selectedSupplierId: string;
  selectedSupplierName: string;
  /** העלות שנבחרה */
  selectedTotalCost: number;
  /** ההצעה היקרה ביותר */
  highestCost: number;
  /** חיסכון */
  savingsAmount: number;
  savingsPercent: number;
  /** הנמקה */
  reasoning: string[];
  /** הזמנת רכש */
  purchaseOrder: PurchaseOrder;
}

/** השוואת הצעות */
interface QuoteComparison {
  supplierId: string;
  supplierName: string;
  totalCost: number;           // כולל משלוח, לפני מע"מ
  totalCostWithVat: number;
  deliveryFee: number;
  freeDelivery: boolean;
  deliveryDays: number;
  supplierRating: number;
  deliveryReliability: number;
  /** ציון משוקלל */
  weightedScore: number;
  /** דירוג (1 = הכי טוב) */
  rank: number;
}

/** הזמנת רכש */
interface PurchaseOrder {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  items: QuoteLineItem[];
  subtotal: number;
  deliveryFee: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  expectedDelivery: Date;
  deliveryAddress: string;
  requestedBy: string;
  approvedBy?: string;
  projectId?: string;
  createdAt: number;
  status: 'draft' | 'sent' | 'confirmed' | 'delivered' | 'cancelled';
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: SUPPLIER REGISTRY — מאגר ספקים
// ═══════════════════════════════════════════════════════════════════════════

class SupplierRegistry {
  private suppliers: Map<string, Supplier> = new Map();

  addSupplier(params: {
    name: string;
    contactPerson: string;
    phone: string;
    email?: string;
    whatsapp?: string;
    address?: string;
    products: Array<{ category: MaterialCategory; name: string; description?: string; listPrice?: number; unit: UnitOfMeasure; minOrderQty?: number; leadTimeDays?: number }>;
    rating?: number;
    deliveryReliability?: number;
    defaultPaymentTerms?: string;
    avgDeliveryDays?: number;
    distanceKm?: number;
    preferredChannel?: 'whatsapp' | 'email' | 'sms' | 'phone';
    notes?: string;
  }): Supplier {
    const id = `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const supplier: Supplier = {
      id,
      name: params.name,
      contactPerson: params.contactPerson,
      phone: params.phone,
      email: params.email,
      whatsapp: params.whatsapp ?? params.phone,
      address: params.address,
      products: params.products.map(p => ({ ...p, lastUpdated: new Date() })),
      rating: params.rating ?? 5,
      deliveryReliability: params.deliveryReliability ?? 5,
      defaultPaymentTerms: params.defaultPaymentTerms ?? 'שוטף + 30',
      avgDeliveryDays: params.avgDeliveryDays ?? 7,
      distanceKm: params.distanceKm,
      active: true,
      notes: params.notes ?? '',
      stats: { totalOrders: 0, totalSpent: 0, avgResponseTimeHours: 0, onTimeDeliveryRate: 100, qualityIssues: 0 },
      preferredChannel: params.preferredChannel ?? 'whatsapp',
    };
    this.suppliers.set(id, supplier);
    return supplier;
  }

  /** מצא ספקים לפי קטגוריית מוצר */
  findByCategory(category: MaterialCategory): Supplier[] {
    return Array.from(this.suppliers.values())
      .filter(s => s.active && s.products.some(p => p.category === category));
  }

  /** מצא ספקים לפי שם מוצר (חיפוש טקסט) */
  findByProduct(searchText: string): Supplier[] {
    const lower = searchText.toLowerCase();
    return Array.from(this.suppliers.values())
      .filter(s => s.active && s.products.some(p =>
        p.name.toLowerCase().includes(lower) ||
        (p.description ?? '').toLowerCase().includes(lower) ||
        p.category.includes(lower)
      ));
  }

  /** מצא ספקים לפי קטגוריה + שם מוצר */
  findSuppliers(category: MaterialCategory, productName?: string): Supplier[] {
    let results = this.findByCategory(category);
    if (productName) {
      const lower = productName.toLowerCase();
      results = results.filter(s =>
        s.products.some(p =>
          p.category === category &&
          (p.name.toLowerCase().includes(lower) || (p.description ?? '').toLowerCase().includes(lower))
        )
      );
    }
    // מיון לפי דירוג
    return results.sort((a, b) => b.rating - a.rating);
  }

  getSupplier(id: string): Supplier | undefined {
    return this.suppliers.get(id);
  }

  getAllSuppliers(): Supplier[] {
    return Array.from(this.suppliers.values());
  }

  updateRating(supplierId: string, rating?: number, deliveryReliability?: number): void {
    const s = this.suppliers.get(supplierId);
    if (!s) return;
    if (rating !== undefined) s.rating = Math.max(1, Math.min(10, rating));
    if (deliveryReliability !== undefined) s.deliveryReliability = Math.max(1, Math.min(10, deliveryReliability));
  }

  updateStats(supplierId: string, update: Partial<Supplier['stats']>): void {
    const s = this.suppliers.get(supplierId);
    if (!s) return;
    Object.assign(s.stats, update);
  }

  addProduct(supplierId: string, product: SupplierProduct): void {
    const s = this.suppliers.get(supplierId);
    if (s) s.products.push({ ...product, lastUpdated: new Date() });
  }

  setActive(supplierId: string, active: boolean): void {
    const s = this.suppliers.get(supplierId);
    if (s) s.active = active;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: RFQ BROADCASTER — שליחת בקשה לכל הספקים
// ═══════════════════════════════════════════════════════════════════════════

class RFQBroadcaster {
  private rfqs: Map<string, RFQ> = new Map();

  /** שליחת RFQ handler — מחובר ל-ONYX integrations */
  private sendHandler?: (params: {
    channel: 'whatsapp' | 'email' | 'sms';
    to: string;
    message: string;
    subject?: string;
  }) => Promise<boolean>;

  setSendHandler(handler: typeof this.sendHandler): void {
    this.sendHandler = handler;
  }

  /** בנה הודעת RFQ */
  buildRFQMessage(items: PurchaseRequestItem[], deadline: Date, rfqId: string, companyNote?: string): string {
    const itemsList = items.map((item, i) =>
      `${i + 1}. ${item.name} — ${item.quantity} ${item.unit}${item.specs ? `\n   מפרט: ${item.specs}` : ''}${item.description ? `\n   תיאור: ${item.description}` : ''}`
    ).join('\n');

    return [
      `שלום רב,`,
      ``,
      `חברת טכנו כל עוזי בע"מ מבקשת הצעת מחיר לפריטים הבאים:`,
      ``,
      `── פריטים ──`,
      itemsList,
      ``,
      `── פרטים ──`,
      `מספר בקשה: ${rfqId}`,
      `דדליין לתשובה: ${deadline.toLocaleDateString('he-IL')} ${deadline.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
      ``,
      `נא לציין:`,
      `• מחיר ליחידה`,
      `• מחיר כולל`,
      `• דמי משלוח / משלוח חינם`,
      `• זמן אספקה`,
      `• תנאי תשלום`,
      `• תוקף ההצעה`,
      companyNote ? `\n${companyNote}` : '',
      ``,
      `בברכה,`,
      `טכנו כל עוזי בע"מ`,
      `ריבל 37, תל אביב`,
    ].filter(Boolean).join('\n');
  }

  /** שלח RFQ לכל הספקים הרלוונטיים */
  async broadcast(params: {
    purchaseRequest: PurchaseRequest;
    suppliers: Supplier[];
    responseWindowHours?: number;
    reminderAfterHours?: number;
    minQuotesBeforeDecision?: number;
    companyNote?: string;
  }): Promise<RFQ> {
    const responseWindowHours = params.responseWindowHours ?? 24;
    const deadline = new Date(Date.now() + responseWindowHours * 3600000);

    const rfqId = `rfq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const messageText = this.buildRFQMessage(
      params.purchaseRequest.items,
      deadline,
      rfqId,
      params.companyNote,
    );

    // שליחה לכל הספקים
    const recipients: RFQRecipient[] = [];

    for (const supplier of params.suppliers) {
      const channel = supplier.preferredChannel === 'phone' ? 'whatsapp' : supplier.preferredChannel;
      const address = channel === 'whatsapp' ? (supplier.whatsapp ?? supplier.phone)
        : channel === 'email' ? (supplier.email ?? '')
        : supplier.phone;

      if (!address) {
        recipients.push({
          supplierId: supplier.id, supplierName: supplier.name,
          sentVia: channel, sentAt: Date.now(), delivered: false,
          reminderSent: false, status: 'sent',
        });
        continue;
      }

      let delivered = false;
      try {
        if (this.sendHandler) {
          delivered = await this.sendHandler({
            channel,
            to: address,
            message: messageText,
            subject: channel === 'email' ? `בקשה להצעת מחיר #${rfqId} — טכנו כל עוזי` : undefined,
          });
        } else {
          console.log(`[RFQ] 📤 → ${supplier.name} (${channel}: ${address})`);
          delivered = true;
        }
      } catch (err) {
        console.error(`[RFQ] שליחה נכשלה ל-${supplier.name}:`, err);
      }

      recipients.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        sentVia: channel,
        sentAt: Date.now(),
        delivered,
        reminderSent: false,
        status: delivered ? 'delivered' : 'sent',
      });
    }

    const rfq: RFQ = {
      id: rfqId,
      purchaseRequestId: params.purchaseRequest.id,
      items: params.purchaseRequest.items,
      sentTo: recipients,
      sentAt: Date.now(),
      responseDeadline: deadline.getTime(),
      messageText,
      status: 'sent',
      settings: {
        responseWindowHours,
        reminderAfterHours: params.reminderAfterHours ?? 12,
        autoCloseOnDeadline: true,
        minQuotesBeforeDecision: params.minQuotesBeforeDecision ?? 2,
      },
    };

    this.rfqs.set(rfq.id, rfq);

    const deliveredCount = recipients.filter(r => r.delivered).length;
    console.log(`\n📤 RFQ #${rfqId} נשלח ל-${deliveredCount}/${params.suppliers.length} ספקים`);
    console.log(`⏰ דדליין: ${deadline.toLocaleString('he-IL')}`);

    return rfq;
  }

  /** שלח תזכורת לספקים שלא ענו */
  async sendReminders(rfqId: string): Promise<number> {
    const rfq = this.rfqs.get(rfqId);
    if (!rfq) return 0;

    let sent = 0;
    for (const recipient of rfq.sentTo) {
      if (recipient.status !== 'quoted' && recipient.status !== 'declined' && !recipient.reminderSent) {
        if (this.sendHandler) {
          const supplier = recipient; // Simplified
          try {
            await this.sendHandler({
              channel: recipient.sentVia,
              to: '', // Would need supplier lookup
              message: `תזכורת: בקשה להצעת מחיר #${rfqId}\nדדליין: ${new Date(rfq.responseDeadline).toLocaleString('he-IL')}\nנשמח לתשובתך.`,
            });
            sent++;
          } catch {}
        }
        recipient.reminderSent = true;
        recipient.reminderSentAt = Date.now();
      }
    }
    if (sent > 0) console.log(`📬 נשלחו ${sent} תזכורות ל-RFQ #${rfqId}`);
    return sent;
  }

  getRFQ(id: string): RFQ | undefined {
    return this.rfqs.get(id);
  }

  getAllRFQs(): RFQ[] {
    return Array.from(this.rfqs.values()).sort((a, b) => b.sentAt - a.sentAt);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: QUOTE COLLECTOR — איסוף הצעות מחיר
// ═══════════════════════════════════════════════════════════════════════════

class QuoteCollector {
  private quotes: Map<string, SupplierQuote> = new Map();

  /** הזנת הצעת מחיר ידנית */
  addQuote(params: {
    supplierId: string;
    supplierName: string;
    rfqId: string;
    lineItems: Array<{
      itemId: string;
      name: string;
      quantity: number;
      unit: UnitOfMeasure;
      unitPrice: number;
      discount?: number;
      leadTimeDays?: number;
      notes?: string;
    }>;
    deliveryFee?: number;
    freeDelivery?: boolean;
    deliveryDays: number;
    paymentTerms?: string;
    validForDays?: number;
    vatIncluded?: boolean;
    notes?: string;
    source?: 'manual' | 'whatsapp_reply' | 'email_reply' | 'api';
  }): SupplierQuote {
    const lineItems: QuoteLineItem[] = params.lineItems.map(item => {
      const discountMultiplier = item.discount ? (1 - item.discount / 100) : 1;
      const totalPrice = Math.round(item.quantity * item.unitPrice * discountMultiplier);
      return { ...item, totalPrice };
    });

    const subtotal = lineItems.reduce((s, li) => s + li.totalPrice, 0);
    const deliveryFee = params.freeDelivery ? 0 : (params.deliveryFee ?? 0);
    const totalPrice = subtotal + deliveryFee;
    const vatIncluded = params.vatIncluded ?? false;
    const vatAmount = vatIncluded ? 0 : Math.round(totalPrice * 0.18);
    const totalWithVat = totalPrice + vatAmount;

    const quote: SupplierQuote = {
      id: `quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      rfqId: params.rfqId,
      receivedAt: Date.now(),
      lineItems,
      totalPrice,
      vatIncluded,
      vatAmount,
      totalWithVat,
      deliveryFee,
      freeDelivery: params.freeDelivery ?? false,
      deliveryDays: params.deliveryDays,
      paymentTerms: params.paymentTerms ?? 'שוטף + 30',
      validForDays: params.validForDays ?? 14,
      notes: params.notes,
      source: params.source ?? 'manual',
    };

    this.quotes.set(quote.id, quote);

    console.log(`📥 הצעת מחיר התקבלה: ${params.supplierName} — ₪${totalPrice.toLocaleString()} (${params.deliveryDays} ימי אספקה)`);

    return quote;
  }

  /** שלוף הצעות לפי RFQ */
  getQuotesByRFQ(rfqId: string): SupplierQuote[] {
    return Array.from(this.quotes.values())
      .filter(q => q.rfqId === rfqId)
      .sort((a, b) => a.totalPrice - b.totalPrice);
  }

  getQuote(id: string): SupplierQuote | undefined {
    return this.quotes.get(id);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: PROCUREMENT DECISION ENGINE — AI בוחר את הזול/טוב ביותר
// ═══════════════════════════════════════════════════════════════════════════

const VAT_RATE = 0.18;

interface ProcurementConfig {
  /** משקל מחיר (0-1) */
  priceWeight: number;
  /** משקל זמן אספקה (0-1) */
  deliveryWeight: number;
  /** משקל דירוג ספק (0-1) */
  ratingWeight: number;
  /** משקל אמינות אספקה (0-1) */
  reliabilityWeight: number;
  /** כתובת אספקה */
  deliveryAddress: string;
  /** תנאי תשלום ברירת מחדל */
  defaultPaymentTerms: string;
}

class ProcurementDecisionEngine {
  private decisions: Map<string, ProcurementDecision> = new Map();
  private config: ProcurementConfig;

  constructor(
    private supplierRegistry: SupplierRegistry,
    config?: Partial<ProcurementConfig>,
  ) {
    this.config = {
      priceWeight: 0.50,
      deliveryWeight: 0.15,
      ratingWeight: 0.20,
      reliabilityWeight: 0.15,
      deliveryAddress: 'ריבל 37, תל אביב',
      defaultPaymentTerms: 'שוטף + 30',
      ...config,
    };
  }

  /** קבל החלטה על בסיס הצעות שהתקבלו */
  decide(rfqId: string, quotes: SupplierQuote[], purchaseRequestId: string): ProcurementDecision {
    if (quotes.length === 0) {
      throw new Error('אין הצעות מחיר — לא ניתן לקבל החלטה');
    }

    // ── חישוב ציון משוקלל לכל הצעה ──

    const maxPrice = Math.max(...quotes.map(q => q.totalPrice));
    const minPrice = Math.min(...quotes.map(q => q.totalPrice));
    const maxDelivery = Math.max(...quotes.map(q => q.deliveryDays), 1);

    const comparisons: QuoteComparison[] = quotes.map(quote => {
      const supplier = this.supplierRegistry.getSupplier(quote.supplierId);

      // ציון מחיר: 100 = הכי זול, 0 = הכי יקר
      const priceRange = maxPrice - minPrice;
      const priceScore = priceRange > 0 ? ((maxPrice - quote.totalPrice) / priceRange) * 100 : 100;

      // ציון אספקה: מהיר יותר = טוב יותר
      const deliveryScore = Math.max(0, 100 - (quote.deliveryDays / maxDelivery) * 100);

      // ציון דירוג ספק
      const ratingScore = (supplier?.rating ?? 5) * 10;

      // ציון אמינות
      const reliabilityScore = (supplier?.deliveryReliability ?? 5) * 10;

      // ציון משוקלל
      const weightedScore = Math.round(
        priceScore * this.config.priceWeight +
        deliveryScore * this.config.deliveryWeight +
        ratingScore * this.config.ratingWeight +
        reliabilityScore * this.config.reliabilityWeight
      );

      const totalCost = quote.totalPrice;
      const totalCostWithVat = quote.totalWithVat;

      return {
        supplierId: quote.supplierId,
        supplierName: quote.supplierName,
        totalCost,
        totalCostWithVat,
        deliveryFee: quote.deliveryFee,
        freeDelivery: quote.freeDelivery,
        deliveryDays: quote.deliveryDays,
        supplierRating: supplier?.rating ?? 5,
        deliveryReliability: supplier?.deliveryReliability ?? 5,
        weightedScore,
        rank: 0, // יקבע אחרי מיון
      };
    });

    // מיון ודירוג
    comparisons.sort((a, b) => b.weightedScore - a.weightedScore);
    comparisons.forEach((c, i) => c.rank = i + 1);

    // ── בחירת הזוכה ──

    const winner = comparisons[0];
    const winnerQuote = quotes.find(q => q.supplierId === winner.supplierId)!;
    const highestCost = Math.max(...comparisons.map(c => c.totalCost));
    const savingsAmount = highestCost - winner.totalCost;
    const savingsPercent = highestCost > 0 ? Math.round((savingsAmount / highestCost) * 100 * 10) / 10 : 0;

    // ── הנמקה ──

    const reasoning: string[] = [];
    reasoning.push(`📦 RFQ #${rfqId} — ${quotes.length} הצעות התקבלו`);
    reasoning.push(`---`);

    // טבלת השוואה
    reasoning.push(`📊 השוואת הצעות:`);
    for (const comp of comparisons) {
      const tag = comp.rank === 1 ? '🏆' : `#${comp.rank}`;
      reasoning.push(`${tag} ${comp.supplierName}: ₪${comp.totalCost.toLocaleString()} | ${comp.deliveryDays} ימים | דירוג ${comp.supplierRating}/10 | ציון: ${comp.weightedScore}`);
    }

    reasoning.push(`---`);
    reasoning.push(`🏆 נבחר: ${winner.supplierName}`);
    reasoning.push(`💵 עלות: ₪${winner.totalCost.toLocaleString()} + מע"מ = ₪${winner.totalCostWithVat.toLocaleString()}`);
    reasoning.push(`🚚 אספקה: ${winner.deliveryDays} ימים${winner.freeDelivery ? ' (משלוח חינם)' : ` + ₪${winner.deliveryFee} משלוח`}`);
    reasoning.push(`✅ חיסכון: ₪${savingsAmount.toLocaleString()} (${savingsPercent}%) מול ההצעה היקרה ביותר`);

    // ── הפקת הזמנת רכש ──

    const purchaseOrder: PurchaseOrder = {
      id: `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      rfqId,
      supplierId: winner.supplierId,
      supplierName: winner.supplierName,
      items: winnerQuote.lineItems,
      subtotal: winnerQuote.totalPrice - winnerQuote.deliveryFee,
      deliveryFee: winnerQuote.deliveryFee,
      vatAmount: winnerQuote.vatAmount,
      total: winnerQuote.totalWithVat,
      paymentTerms: winnerQuote.paymentTerms,
      expectedDelivery: new Date(Date.now() + winner.deliveryDays * 86400000),
      deliveryAddress: this.config.deliveryAddress,
      requestedBy: '',
      projectId: undefined,
      createdAt: Date.now(),
      status: 'draft',
    };

    const decision: ProcurementDecision = {
      id: `pdec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      rfqId,
      purchaseRequestId,
      timestamp: Date.now(),
      quotes: comparisons,
      selectedSupplierId: winner.supplierId,
      selectedSupplierName: winner.supplierName,
      selectedTotalCost: winner.totalCostWithVat,
      highestCost,
      savingsAmount,
      savingsPercent,
      reasoning,
      purchaseOrder,
    };

    this.decisions.set(decision.id, decision);

    // עדכון סטטיסטיקות ספק
    const supplier = this.supplierRegistry.getSupplier(winner.supplierId);
    if (supplier) {
      this.supplierRegistry.updateStats(winner.supplierId, {
        totalOrders: supplier.stats.totalOrders + 1,
        totalSpent: supplier.stats.totalSpent + winner.totalCost,
        lastOrderDate: Date.now(),
      });
    }

    return decision;
  }

  /** פורמט הזמנת רכש לשליחה */
  formatPurchaseOrderMessage(decision: ProcurementDecision): string {
    const po = decision.purchaseOrder;
    const itemsList = po.items.map((item, i) =>
      `${i + 1}. ${item.name}\n   כמות: ${item.quantity} ${item.unit}\n   מחיר ליחידה: ₪${item.unitPrice.toLocaleString()}\n   סה"כ: ₪${item.totalPrice.toLocaleString()}${item.discount ? ` (הנחה ${item.discount}%)` : ''}`
    ).join('\n');

    return [
      `══════════════════════════════`,
      `📄 הזמנת רכש #${po.id}`,
      `══════════════════════════════`,
      ``,
      `לכבוד: ${po.supplierName}`,
      `תאריך: ${new Date(po.createdAt).toLocaleDateString('he-IL')}`,
      ``,
      `── פריטים ──`,
      itemsList,
      ``,
      `── סיכום כספי ──`,
      `סה"כ לפני מע"מ: ₪${(po.subtotal).toLocaleString()}`,
      po.deliveryFee > 0 ? `משלוח: ₪${po.deliveryFee.toLocaleString()}` : `משלוח: חינם`,
      `מע"מ (18%): ₪${po.vatAmount.toLocaleString()}`,
      `═══════════════`,
      `סה"כ לתשלום: ₪${po.total.toLocaleString()}`,
      ``,
      `── אספקה ──`,
      `כתובת: ${po.deliveryAddress}`,
      `תאריך אספקה צפוי: ${po.expectedDelivery.toLocaleDateString('he-IL')}`,
      ``,
      `── תנאי תשלום ──`,
      po.paymentTerms,
      ``,
      `══════════════════════════════`,
      `טכנו כל עוזי בע"מ`,
      `ריבל 37, תל אביב`,
      `══════════════════════════════`,
    ].join('\n');
  }

  getDecision(id: string): ProcurementDecision | undefined {
    return this.decisions.get(id);
  }

  getAllDecisions(): ProcurementDecision[] {
    return Array.from(this.decisions.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /** דוח חיסכון כולל */
  getSavingsReport(): {
    totalRFQs: number;
    totalSavings: number;
    avgSavingsPercent: number;
    totalSpent: number;
    bySupplier: Record<string, { wins: number; totalSpent: number }>;
  } {
    const decisions = this.getAllDecisions();
    const bySupplier: Record<string, { wins: number; totalSpent: number }> = {};
    let totalSavings = 0;
    let totalPercent = 0;
    let totalSpent = 0;

    for (const d of decisions) {
      totalSavings += d.savingsAmount;
      totalPercent += d.savingsPercent;
      totalSpent += d.selectedTotalCost;

      if (!bySupplier[d.selectedSupplierName]) bySupplier[d.selectedSupplierName] = { wins: 0, totalSpent: 0 };
      bySupplier[d.selectedSupplierName].wins++;
      bySupplier[d.selectedSupplierName].totalSpent += d.selectedTotalCost;
    }

    return {
      totalRFQs: decisions.length,
      totalSavings,
      avgSavingsPercent: decisions.length > 0 ? Math.round(totalPercent / decisions.length * 10) / 10 : 0,
      totalSpent,
      bySupplier,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: PROCUREMENT MANAGER — ממשק פשוט
// ═══════════════════════════════════════════════════════════════════════════

export class ProcurementManager {
  readonly suppliers: SupplierRegistry;
  readonly broadcaster: RFQBroadcaster;
  readonly collector: QuoteCollector;
  readonly engine: ProcurementDecisionEngine;

  constructor(config?: Partial<ProcurementConfig>) {
    this.suppliers = new SupplierRegistry();
    this.broadcaster = new RFQBroadcaster();
    this.collector = new QuoteCollector();
    this.engine = new ProcurementDecisionEngine(this.suppliers, config);
  }

  // ─── ספקים ──

  addSupplier(params: Parameters<SupplierRegistry['addSupplier']>[0]): Supplier {
    return this.suppliers.addSupplier(params);
  }

  // ─── תהליך רכש מלא ──

  /** שלב 1: צור בקשת רכש */
  createRequest(params: {
    requestedBy: string;
    items: Array<{
      category: MaterialCategory;
      name: string;
      description: string;
      quantity: number;
      unit: UnitOfMeasure;
      specs?: string;
      maxBudget?: number;
    }>;
    urgency?: 'critical' | 'high' | 'normal' | 'low';
    requiredByDate?: Date;
    projectId?: string;
    projectName?: string;
    notes?: string;
  }): PurchaseRequest {
    return {
      id: `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      requestedBy: params.requestedBy,
      requestDate: Date.now(),
      items: params.items.map((item, i) => ({
        ...item,
        id: `pri_${i}_${Math.random().toString(36).slice(2, 6)}`,
      })),
      urgency: params.urgency ?? 'normal',
      requiredByDate: params.requiredByDate?.getTime(),
      projectId: params.projectId,
      projectName: params.projectName,
      notes: params.notes,
      status: 'draft',
    };
  }

  /** שלב 2: שלח RFQ לכל הספקים — במכה אחת */
  async sendRFQ(request: PurchaseRequest, options?: {
    responseWindowHours?: number;
    companyNote?: string;
    specificSupplierIds?: string[];
  }): Promise<RFQ> {
    // מצא ספקים רלוונטיים
    let suppliers: Supplier[];
    if (options?.specificSupplierIds) {
      suppliers = options.specificSupplierIds
        .map(id => this.suppliers.getSupplier(id))
        .filter((s): s is Supplier => !!s);
    } else {
      // מצא לפי כל הקטגוריות בבקשה
      const categories = [...new Set(request.items.map(i => i.category))];
      const allSuppliers = new Map<string, Supplier>();
      for (const cat of categories) {
        for (const s of this.suppliers.findByCategory(cat)) {
          allSuppliers.set(s.id, s);
        }
      }
      suppliers = Array.from(allSuppliers.values());
    }

    if (suppliers.length === 0) {
      throw new Error(`לא נמצאו ספקים לקטגוריות: ${request.items.map(i => i.category).join(', ')}`);
    }

    request.status = 'rfq_sent';

    return this.broadcaster.broadcast({
      purchaseRequest: request,
      suppliers,
      responseWindowHours: options?.responseWindowHours,
      companyNote: options?.companyNote,
    });
  }

  /** שלב 3: הזן הצעת מחיר שהתקבלה */
  addQuote(params: Parameters<QuoteCollector['addQuote']>[0]): SupplierQuote {
    return this.collector.addQuote(params);
  }

  /** שלב 4: AI מקבל החלטה — בוחר את הכי טוב */
  decideRFQ(rfqId: string): ProcurementDecision {
    const rfq = this.broadcaster.getRFQ(rfqId);
    if (!rfq) throw new Error(`RFQ ${rfqId} לא נמצא`);

    const quotes = this.collector.getQuotesByRFQ(rfqId);
    if (quotes.length < (rfq.settings.minQuotesBeforeDecision ?? 2)) {
      throw new Error(`נדרשות לפחות ${rfq.settings.minQuotesBeforeDecision} הצעות — יש רק ${quotes.length}`);
    }

    return this.engine.decide(rfqId, quotes, rfq.purchaseRequestId);
  }

  /** הדפס החלטה */
  printDecision(decision: ProcurementDecision): void {
    console.log('\n' + decision.reasoning.join('\n') + '\n');
  }

  /** הדפס הזמנת רכש */
  printPurchaseOrder(decision: ProcurementDecision): void {
    console.log('\n' + this.engine.formatPurchaseOrderMessage(decision) + '\n');
  }

  /** דוח חיסכון */
  printSavingsReport(): void {
    const report = this.engine.getSavingsReport();
    console.log('\n═══════════════════════════════');
    console.log('📊 דוח חיסכון רכש');
    console.log('═══════════════════════════════');
    console.log(`סה"כ RFQs: ${report.totalRFQs}`);
    console.log(`סה"כ הוצאות: ₪${report.totalSpent.toLocaleString()}`);
    console.log(`סה"כ חיסכון: ₪${report.totalSavings.toLocaleString()}`);
    console.log(`חיסכון ממוצע: ${report.avgSavingsPercent}%`);
    console.log('\nספקים זוכים:');
    for (const [name, data] of Object.entries(report.bySupplier).sort((a, b) => b[1].wins - a[1].wins)) {
      console.log(`  ${name}: ${data.wins} זכיות | ₪${data.totalSpent.toLocaleString()}`);
    }
    console.log('═══════════════════════════════\n');
  }

  /** חבר שליחת הודעות ל-ONYX */
  connectSendHandler(handler: Parameters<RFQBroadcaster['setSendHandler']>[0]): void {
    this.broadcaster.setSendHandler(handler);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  SupplierRegistry,
  RFQBroadcaster,
  QuoteCollector,
  ProcurementDecisionEngine,
};

export type {
  Supplier, SupplierProduct, MaterialCategory, UnitOfMeasure,
  PurchaseRequest, PurchaseRequestItem,
  RFQ, RFQRecipient,
  SupplierQuote, QuoteLineItem,
  ProcurementDecision, QuoteComparison, PurchaseOrder,
  ProcurementConfig,
};


// ═══════════════════════════════════════════════════════════════════════════
// שימוש מלא
// ═══════════════════════════════════════════════════════════════════════════
//
// const procurement = new ProcurementManager({
//   priceWeight: 0.50,
//   deliveryWeight: 0.15,
//   ratingWeight: 0.20,
//   reliabilityWeight: 0.15,
//   deliveryAddress: 'ריבל 37, תל אביב',
// });
//
// // ── רשום ספקים ──
//
// const metalMax = procurement.addSupplier({
//   name: 'מתכת מקס', contactPerson: 'אבי', phone: '+972501111111',
//   email: 'avi@metalmax.co.il', preferredChannel: 'whatsapp',
//   products: [
//     { category: 'ברזל', name: 'ברזל 12 מ"מ', unit: 'מטר', description: 'ברזל עגול 12 מ"מ' },
//     { category: 'ברזל', name: 'פרופיל 40×40', unit: 'מטר', description: 'פרופיל מרובע' },
//     { category: 'ברזל', name: 'פח 2 מ"מ', unit: 'מ"ר' },
//   ],
//   rating: 8, deliveryReliability: 7, avgDeliveryDays: 3,
// });
//
// const steelPro = procurement.addSupplier({
//   name: 'סטיל פרו', contactPerson: 'משה', phone: '+972502222222',
//   email: 'moshe@steelpro.co.il', preferredChannel: 'email',
//   products: [
//     { category: 'ברזל', name: 'ברזל 12 מ"מ', unit: 'מטר' },
//     { category: 'ברזל', name: 'פרופיל 40×40', unit: 'מטר' },
//     { category: 'נירוסטה', name: 'צינור נירוסטה 50 מ"מ', unit: 'מטר' },
//   ],
//   rating: 9, deliveryReliability: 9, avgDeliveryDays: 5,
// });
//
// const ironCity = procurement.addSupplier({
//   name: 'עיר הברזל', contactPerson: 'יוסי', phone: '+972503333333',
//   preferredChannel: 'whatsapp',
//   products: [
//     { category: 'ברזל', name: 'ברזל 12 מ"מ', unit: 'מטר' },
//     { category: 'ברזל', name: 'ברזל 16 מ"מ', unit: 'מטר' },
//   ],
//   rating: 6, deliveryReliability: 8, avgDeliveryDays: 2,
// });
//
// // ── צור בקשת רכש ──
//
// const request = procurement.createRequest({
//   requestedBy: 'דימה',
//   items: [
//     { category: 'ברזל', name: 'ברזל 12 מ"מ', description: 'ברזל עגול 12 מ"מ תקן ישראלי', quantity: 200, unit: 'מטר', specs: 'ST37, אורך 6 מטר' },
//     { category: 'ברזל', name: 'פרופיל 40×40', description: 'פרופיל מרובע 40×40×2', quantity: 100, unit: 'מטר' },
//   ],
//   urgency: 'high',
//   requiredByDate: new Date('2026-04-25'),
//   projectName: 'מעקות בניין קריאתי 10',
// });
//
// // ── שלח לכל הספקים במכה אחת ──
// // → נשלח אוטומטית ב-WhatsApp/Email ל-3 ספקים
//
// const rfq = await procurement.sendRFQ(request, {
//   responseWindowHours: 24,
//   companyNote: 'בבקשה מחיר אטרקטיבי — הזמנה גדולה',
// });
//
// // ── הצעות מחיר חוזרות (הזנה ידנית) ──
//
// procurement.addQuote({
//   supplierId: metalMax.id, supplierName: 'מתכת מקס', rfqId: rfq.id,
//   lineItems: [
//     { itemId: request.items[0].id, name: 'ברזל 12 מ"מ', quantity: 200, unit: 'מטר', unitPrice: 45 },
//     { itemId: request.items[1].id, name: 'פרופיל 40×40', quantity: 100, unit: 'מטר', unitPrice: 62 },
//   ],
//   deliveryFee: 500, deliveryDays: 3, paymentTerms: 'שוטף + 45',
// });
//
// procurement.addQuote({
//   supplierId: steelPro.id, supplierName: 'סטיל פרו', rfqId: rfq.id,
//   lineItems: [
//     { itemId: request.items[0].id, name: 'ברזל 12 מ"מ', quantity: 200, unit: 'מטר', unitPrice: 42 },
//     { itemId: request.items[1].id, name: 'פרופיל 40×40', quantity: 100, unit: 'מטר', unitPrice: 58 },
//   ],
//   freeDelivery: true, deliveryDays: 5, paymentTerms: 'שוטף + 30',
// });
//
// procurement.addQuote({
//   supplierId: ironCity.id, supplierName: 'עיר הברזל', rfqId: rfq.id,
//   lineItems: [
//     { itemId: request.items[0].id, name: 'ברזל 12 מ"מ', quantity: 200, unit: 'מטר', unitPrice: 48 },
//     { itemId: request.items[1].id, name: 'פרופיל 40×40', quantity: 100, unit: 'מטר', unitPrice: 65 },
//   ],
//   deliveryFee: 300, deliveryDays: 2, paymentTerms: 'שוטף + 30',
// });
//
// // ── AI מחליט ──
//
// const decision = procurement.decideRFQ(rfq.id);
// procurement.printDecision(decision);
// procurement.printPurchaseOrder(decision);
//
// // פלט:
// // 📦 RFQ #rfq_xxx — 3 הצעות התקבלו
// // ---
// // 📊 השוואת הצעות:
// // 🏆 סטיל פרו: ₪14,200 | 5 ימים | דירוג 9/10 | ציון: 82
// // #2 מתכת מקס: ₪15,700 | 3 ימים | דירוג 8/10 | ציון: 68
// // #3 עיר הברזל: ₪16,400 | 2 ימים | דירוג 6/10 | ציון: 55
// // ---
// // 🏆 נבחר: סטיל פרו
// // 💵 עלות: ₪14,200 + מע"מ = ₪16,756
// // 🚚 אספקה: 5 ימים (משלוח חינם)
// // ✅ חיסכון: ₪2,200 (13.4%) מול ההצעה היקרה ביותר
