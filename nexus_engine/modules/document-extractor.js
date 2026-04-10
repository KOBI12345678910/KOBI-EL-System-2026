// ══════════════════════════════════════════════════════════════════
// MODULE: Document Extractor
// מודול ש"קורא" מסמכים + מפיק שדות מובנים (בסיס ל-OCR/RAG בפרודקשן)
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מקבל תיאור של מסמך (בפרודקשן: טקסט מ-OCR / PDF parser)
//   2. מבקש מה-Brain לחלץ שדות מובנים (שם, סכום, תאריך, מספר זיהוי)
//   3. מוודא validity של הנתונים שחולצו
//   4. שומר במאגר מרכזי שזמין לשאר המודולים
//   5. מסמן אי-התאמות / חוסרים לבדיקת בן-אדם

const DocumentExtractorModule = {
  name: "document_extractor",
  description: "Extracts structured fields from unstructured documents",

  _pendingDocs: [
    {
      id: "doc_001",
      business: "techno_kol_uzi",
      type: "customer_quote_request",
      source: "email",
      raw_text: "שלום, אני דני כהן 050-1234567. צריך הצעת מחיר לשער חשמלי כפול 4 מטר לבית פרטי ברמת גן. דחוף — הקיים שלי נשבר אתמול. תודה.",
      received_at: new Date().toISOString(),
      status: "pending",
    },
    {
      id: "doc_002",
      business: "elkayam_real_estate",
      type: "buyer_intake_form",
      source: "website",
      raw_text: "Name: Michael Friedman. Email: mfriedman@example.com. Budget: $2.5M-$3.5M. Target: 4-bedroom penthouse Tel Aviv city center. Timeline: ready to buy Q1 2025. Notes: cash buyer, existing LLC in Delaware, looking for pre-construction preferred.",
      received_at: new Date().toISOString(),
      status: "pending",
    },
    {
      id: "doc_003",
      business: "techno_kol_uzi",
      type: "supplier_invoice",
      source: "email_attachment",
      raw_text: "חשבונית 30215 — אלומיניום נווה ים בע\"מ. מסמך מס: 30215. תאריך: 15.01.2025. פרופיל אלומיניום 6060-T5 — 500 מטר × 185 ₪ = 92,500 ₪. מע\"מ 17% = 15,725 ₪. סה\"כ לתשלום: 108,225 ₪. תאריך פירעון: 15.02.2025.",
      received_at: new Date().toISOString(),
      status: "pending",
    },
  ],

  async run(state, brain, alerts) {
    const extracted = [];

    for (const doc of this._pendingDocs.filter(d => d.status === "pending").slice(0, 3)) {
      const prompt = `
Extract structured fields from the following ${doc.type} document.

RAW TEXT:
"""
${doc.raw_text}
"""

Return JSON with keys appropriate to the document type. Examples:
- customer_quote_request: { name, phone, product, location, urgency, notes }
- buyer_intake_form: { name, email, budget_min, budget_max, target_property, timeline, notes }
- supplier_invoice: { supplier_name, invoice_number, date_issued, line_items (array), subtotal_ils, vat_ils, total_ils, due_date }

Also include a "confidence" field (0-1) and "missing_fields" array if anything is unclear.
`;

      const response = await brain.think(prompt);
      const { extractJSON } = require("../nexus-engine.js");
      const fields = extractJSON(response);

      if (fields) {
        doc.status = "extracted";
        doc.extracted_fields = fields;
        doc.extracted_at = new Date().toISOString();
        extracted.push({
          doc_id: doc.id,
          business: doc.business,
          type: doc.type,
          fields,
        });

        state.addMemory("longTerm", {
          type: "document_extracted",
          doc_id: doc.id,
          business: doc.business,
          doc_type: doc.type,
          confidence: fields.confidence,
        });

        if (fields.missing_fields && fields.missing_fields.length > 0) {
          alerts.addAlert(
            "warning",
            `Incomplete ${doc.type}`,
            `Doc ${doc.id}: missing ${fields.missing_fields.join(", ")}`,
            { doc_id: doc.id }
          );
        }
      }
    }

    if (extracted.length > 0) {
      state.update("modules.document_extractor.last_extracted", extracted);
    }
  },
};

module.exports = DocumentExtractorModule;
