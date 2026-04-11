// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 10
// COMMUNICATION & CONTENT
// DocumentGenerator · LegalDocAI · VoiceAI · ConversationMemory ·
// SocialMediaAutopilot · ReferralProgram · CustomerPortal
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");

["docgen", "legaldocs", "voice", "conversations", "social-auto", "referrals", "portal"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// DOCUMENT GENERATOR — PDF / contracts / quotes / warranties
// ═══════════════════════════════════════

class DocumentGenerator {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "docgen", "state.json");
    this.data = load(this.file, {
      generated: [],
      templates: {
        quote_pdf:    { name: "Quote PDF", fields: ["customer", "items", "subtotal", "vat", "total", "validUntil"] },
        invoice_pdf:  { name: "Invoice PDF", fields: ["number", "customer", "items", "vat", "total", "dueDate", "bankDetails"] },
        contract:     { name: "Service Contract", fields: ["parties", "scope", "price", "timeline", "warranty", "terms"] },
        warranty_cert:{ name: "Warranty Certificate", fields: ["customer", "product", "startDate", "endDate", "coverage"] },
        delivery_note:{ name: "Delivery Note", fields: ["customer", "items", "deliveredAt", "signature"] },
        receipt:      { name: "Receipt", fields: ["customer", "amount", "method", "reference"] },
      },
      stats: { total: 0, byType: {} },
    });
  }
  save() { save(this.file, this.data); }

  generateHTML(type, data) {
    if (type === "quote_pdf") return this.renderQuoteHTML(data);
    if (type === "invoice_pdf") return this.renderInvoiceHTML(data);
    if (type === "warranty_cert") return this.renderWarrantyHTML(data);
    if (type === "contract") return this.renderContractHTML(data);
    return null;
  }

  renderQuoteHTML(d) {
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>הצעת מחיר ${d.number || ""}</title>
<style>body{font-family:Arial;margin:40px;color:#222}h1{color:#0a4a8f}.header{display:flex;justify-content:space-between;border-bottom:3px solid #0a4a8f;padding-bottom:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#0a4a8f;color:white;padding:12px}td{padding:10px;border-bottom:1px solid #ddd}.total{font-size:24px;font-weight:bold;text-align:left}.footer{margin-top:40px;font-size:12px;color:#666}</style>
</head><body>
<div class="header">
  <div><h1>טכנו כל עוזי בע"מ</h1><p>ריבל 37, תל אביב · 03-XXXXXXX · 80 שנה ניסיון</p></div>
  <div><h2>הצעת מחיר</h2><p>${d.number || ""}<br>${d.date || today()}</p></div>
</div>
<h3>לכבוד: ${d.customerName || ""}</h3>
<p>טלפון: ${d.customerPhone || ""}<br>כתובת: ${d.customerAddress || ""}</p>
<table><thead><tr><th>תיאור</th><th>כמות</th><th>מחיר ליחידה</th><th>סה"כ</th></tr></thead><tbody>
${(d.items || []).map(i => `<tr><td>${i.description}</td><td>${i.qty}</td><td>₪${shekel(i.unitPrice)}</td><td>₪${shekel(i.total || i.qty * i.unitPrice)}</td></tr>`).join("")}
</tbody></table>
<p>סכום לפני מע"מ: ₪${shekel(d.subtotal || 0)}</p>
<p>מע"מ 18%: ₪${shekel(d.vat || 0)}</p>
<p class="total">סה"כ לתשלום: ₪${shekel(d.total || 0)}</p>
<div class="footer">
<p><strong>תוקף ההצעה:</strong> ${d.validUntil || "14 ימים"}</p>
<p><strong>תנאי תשלום:</strong> 40% מקדמה, 60% בסיום העבודה</p>
<p><strong>אחריות:</strong> 10 שנות אחריות על שלד, 2 שנות אחריות על צבע וגימור</p>
<p>טכנו כל עוזי בע"מ · ריבל 37, תל אביב · קובי אלקיים, מנכ"ל</p>
</div>
</body></html>`;
  }

  renderInvoiceHTML(d) {
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>חשבונית מס ${d.number}</title>
<style>body{font-family:Arial;margin:40px}.header{border-bottom:3px solid #0a4a8f;padding-bottom:20px}.header h1{color:#0a4a8f}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#0a4a8f;color:white;padding:12px}td{padding:10px;border-bottom:1px solid #ddd}</style>
</head><body>
<div class="header"><h1>חשבונית מס ${d.number}</h1><p>טכנו כל עוזי בע"מ · ע.מ 51-XXXXXXX · ריבל 37, תל אביב</p></div>
<h3>לכבוד: ${d.customerName}</h3>
<p>תאריך: ${d.date || today()} · יעד תשלום: ${d.dueDate}</p>
<table><thead><tr><th>תיאור</th><th>כמות</th><th>סה"כ</th></tr></thead><tbody>
${(d.items || []).map(i => `<tr><td>${i.description}</td><td>${i.qty}</td><td>₪${shekel(i.total || 0)}</td></tr>`).join("")}
</tbody></table>
<p>סכום לפני מע"מ: ₪${shekel(d.subtotal || 0)}</p>
<p>מע"מ 18%: ₪${shekel(d.vat || 0)}</p>
<h2>סה"כ לתשלום: ₪${shekel(d.total || 0)}</h2>
<p><strong>פרטי בנק לתשלום:</strong> ${d.bankDetails || "בנק הפועלים, סניף XXX, חשבון XXX"}</p>
</body></html>`;
  }

  renderWarrantyHTML(d) {
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>תעודת אחריות</title>
<style>body{font-family:Arial;margin:40px;text-align:center;background:#fafafa}.cert{background:white;border:5px solid #0a4a8f;padding:60px;max-width:800px;margin:auto}.cert h1{color:#0a4a8f;font-size:36px}.seal{font-size:80px;margin:20px}</style>
</head><body>
<div class="cert">
<h1>תעודת אחריות</h1>
<div class="seal">🛡️</div>
<h2>טכנו כל עוזי בע"מ</h2>
<p>מעניקה בזאת אחריות ל:</p>
<h2>${d.customerName}</h2>
<p>על: ${d.productType}</p>
<p>החל מתאריך: ${d.startDate}</p>
<p>תוקף: ${d.durationYears || 10} שנים — עד ${d.endDate}</p>
<hr>
<p><strong>כיסוי:</strong> שלד, ריתוכים, יציבות מבנית</p>
<p><strong>תוקף צבע וגימור:</strong> 2 שנים</p>
<p style="margin-top:40px">קובי אלקיים, מנכ"ל · טכנו כל עוזי בע"מ · ריבל 37, תל אביב</p>
</div>
</body></html>`;
  }

  renderContractHTML(d) {
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>חוזה שירות</title></head>
<body style="font-family:Arial;margin:40px;line-height:1.8">
<h1 style="text-align:center">חוזה שירות</h1>
<p>הסכם זה נחתם בין:</p>
<p><strong>טכנו כל עוזי בע"מ</strong> ("הקבלן"), ע.מ 51-XXXXXXX, ריבל 37 תל אביב</p>
<p>לבין:</p>
<p><strong>${d.customerName}</strong> ("הלקוח"), ${d.customerAddress}</p>
<h3>1. תיאור העבודה</h3>
<p>${d.scope || ""}</p>
<h3>2. תמורה</h3>
<p>סכום: ₪${shekel(d.price || 0)} (כולל מע"מ)</p>
<p>תנאי תשלום: ${d.paymentTerms || "40% מקדמה, 60% בסיום"}</p>
<h3>3. לוח זמנים</h3>
<p>תחילת עבודה: ${d.startDate || ""}</p>
<p>סיום משוער: ${d.endDate || ""}</p>
<h3>4. אחריות</h3>
<p>${d.warranty || "10 שנים על שלד, 2 שנים על צבע"}</p>
<h3>5. תנאים כלליים</h3>
<p>${d.terms || "כל מחלוקת תידון בבית משפט בתל אביב."}</p>
<div style="margin-top:60px;display:flex;justify-content:space-between">
<div>חתימת הקבלן: __________________</div>
<div>חתימת הלקוח: __________________</div>
</div>
</body></html>`;
  }

  generate(type, data) {
    const html = this.generateHTML(type, data);
    if (!html) return null;

    const filename = `${type}-${data.number || uid()}.html`;
    const fullPath = path.join(CONFIG.DIR, "docgen", filename);
    try { fs.writeFileSync(fullPath, html); } catch {}

    const record = {
      id: `DOC-${uid()}`,
      type,
      filename,
      path: fullPath,
      relatedTo: data.relatedTo || null,
      createdAt: now(),
    };
    this.data.generated.push(record);
    this.data.generated = this.data.generated.slice(-500);
    this.data.stats.total++;
    this.data.stats.byType[type] = (this.data.stats.byType[type] || 0) + 1;
    this.save();
    log("DOC-GEN", `📄 ${type}: ${filename}`);
    return record;
  }
}

// ═══════════════════════════════════════
// LEGAL DOCUMENT AI — Israeli law-aware contract generator
// ═══════════════════════════════════════

class LegalDocAI {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "legaldocs", "state.json");
    this.data = load(this.file, {
      documents: [],
      templates: ["employment_contract", "service_agreement", "nda", "supplier_agreement", "warranty_terms", "termination_letter", "demand_letter", "settlement_agreement"],
    });
  }
  save() { save(this.file, this.data); }

  async generateLegalDoc(type, data) {
    const doc = await this.brain.thinkJSON(`
אתה Legal AI מותאם לחוק הישראלי. צור מסמך משפטי.

═══ סוג מסמך ═══
${type}

═══ נתונים ═══
${JSON.stringify(data, null, 2)}

חוקים רלוונטיים:
- חוק הגנת הצרכן התשמ"א-1981
- חוק החוזים (חלק כללי) התשל"ג-1973
- חוק עוולות מסחריות התשנ"ט-1999
- תקנות מס ערך מוסף
- חוק שעות עבודה ומנוחה התשי"א-1951 (לחוזי עבודה)
- חוק הודעה לעובד התשס"ב-2002

תחזיר JSON:
{
  "title": "...",
  "preamble": "פסקת פתיחה",
  "parties": [{"role": "מזמין/ספק/עובד/מעסיק", "name": "...", "id": "...", "address": "..."}],
  "sections": [
    {"number": "1", "heading": "...", "content": "...", "subsections": []}
  ],
  "definitions": [{"term": "...", "definition": "..."}],
  "obligations": [{"party": "...", "obligation": "..."}],
  "compensation": {"amount": 0, "currency": "ILS", "terms": "..."},
  "duration": "...",
  "termination": {"causes": ["..."], "noticeRequired": "..."},
  "disputeResolution": "...",
  "warningsToReview": ["סעיף שצריך עו\\"ד אנושי לבדוק"],
  "estimatedRiskLevel": "low/medium/high",
  "recommendedReviewByLawyer": true/false
}`);

    if (doc) {
      const record = {
        id: `LEGAL-${uid()}`,
        type, data, document: doc,
        status: doc.recommendedReviewByLawyer ? "needs_review" : "ready",
        createdAt: now(),
      };
      this.data.documents.push(record);
      this.data.documents = this.data.documents.slice(-200);
      this.save();
      log("LEGAL-AI", `⚖️  ${type}: ${doc.recommendedReviewByLawyer ? "ממתין לעו\"ד" : "מוכן"}`);
    }
    return doc;
  }
}

// ═══════════════════════════════════════
// VOICE AI — Phone call handler (stub for Twilio integration)
// ═══════════════════════════════════════

class VoiceAI {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "voice", "state.json");
    this.data = load(this.file, {
      calls: [],
      greetings: {
        he: "שלום, הגעת לטכנו כל עוזי, מסגריה משפחתית כבר 80 שנה. במה אוכל לעזור?",
        en: "Hello, you've reached Kobi Elkayam Real Estate. How can I help you today?",
        fr: "Bonjour, vous avez joint Kobi Elkayam Immobilier. Comment puis-je vous aider?",
      },
      stats: { total: 0, qualified: 0, transferred: 0, dropped: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async handleIncomingCall(callerNumber, transcript = "", language = "he") {
    const result = await this.brain.thinkJSON(`
אתה Voice AI של טכנו כל עוזי. ניהלת שיחת טלפון נכנסת.
שפה: ${language}
מספר המתקשר: ${callerNumber}
תמלול השיחה (חלקי): ${transcript}

תפקידך:
1. לזהות את מטרת השיחה
2. לאסוף פרטים בסיסיים (שם, כתובת, סוג פרויקט, גודל)
3. להחליט אם להעביר לאדם או להמשיך אוטומטית
4. אם זה ליד — לקבוע מועד מדידה אוטומטית

תחזיר JSON:
{
  "callPurpose": "lead/quote/complaint/payment/info/wrong_number",
  "customerName": "...",
  "extractedDetails": {
    "projectType": "...",
    "address": "...",
    "estimatedSize": "...",
    "urgency": "..."
  },
  "leadScore": 0-100,
  "shouldTransfer": true/false,
  "transferTo": "קובי/דימה/עוזי/קורין",
  "transferReason": "...",
  "scheduledMeasurement": null,
  "responseScript": "מה ה-AI אמר ללקוח",
  "summary": "תקציר קצר של השיחה",
  "sentiment": "positive/neutral/negative",
  "followUpAction": "..."
}`);

    if (result) {
      const call = {
        id: `CALL-${uid()}`,
        callerNumber, language,
        transcript: transcript.substring(0, 500),
        result, t: now(),
      };
      this.data.calls.push(call);
      this.data.calls = this.data.calls.slice(-500);
      this.data.stats.total++;
      if (result.callPurpose === "lead") this.data.stats.qualified++;
      if (result.shouldTransfer) this.data.stats.transferred++;
      this.save();
      log("VOICE-AI", `📞 ${callerNumber}: ${result.callPurpose} (${result.sentiment})`);
    }
    return result;
  }
}

// ═══════════════════════════════════════
// CONVERSATION MEMORY — Long-term customer relationship memory
// ═══════════════════════════════════════

class ConversationMemory {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "conversations", "state.json");
    this.data = load(this.file, {
      customers: {},     // phone/email → conversation history
      sentiments: {},
    });
  }
  save() { save(this.file, this.data); }

  recordInteraction(customerKey, interaction) {
    if (!this.data.customers[customerKey]) {
      this.data.customers[customerKey] = {
        firstSeen: now(),
        lastSeen: now(),
        totalInteractions: 0,
        interactions: [],
        topics: {},
        knownDetails: {},
      };
    }
    const c = this.data.customers[customerKey];
    c.lastSeen = now();
    c.totalInteractions++;
    c.interactions.push({
      type: interaction.type, // call, whatsapp, email, sms, meeting, visit
      summary: interaction.summary || "",
      sentiment: interaction.sentiment || "neutral",
      topics: interaction.topics || [],
      employee: interaction.employee || "system",
      t: now(),
    });
    c.interactions = c.interactions.slice(-50);

    // Update topic frequency
    for (const topic of interaction.topics || []) {
      c.topics[topic] = (c.topics[topic] || 0) + 1;
    }

    // Merge known details
    if (interaction.details) {
      Object.assign(c.knownDetails, interaction.details);
    }

    // Sentiment tracking
    if (!this.data.sentiments[customerKey]) this.data.sentiments[customerKey] = [];
    this.data.sentiments[customerKey].push({ s: interaction.sentiment, t: now() });
    this.data.sentiments[customerKey] = this.data.sentiments[customerKey].slice(-30);

    this.save();
    return c;
  }

  async generatePersonalizedGreeting(customerKey) {
    const c = this.data.customers[customerKey];
    if (!c || c.totalInteractions === 0) return null;

    return await this.brain.thinkJSON(`
אתה יוצר ברכה אישית מבוססת זיכרון לקוח של טכנו כל עוזי.

═══ היסטוריה ═══
מספר אינטראקציות: ${c.totalInteractions}
פגישה ראשונה: ${daysAgo(c.firstSeen)} ימים אחורה
פגישה אחרונה: ${daysAgo(c.lastSeen)} ימים אחורה
פרטים ידועים: ${JSON.stringify(c.knownDetails)}
נושאים נפוצים: ${JSON.stringify(c.topics)}
אינטראקציות אחרונות: ${JSON.stringify(c.interactions.slice(-3).map(i => ({ type: i.type, summary: i.summary })))}

תחזיר JSON:
{
  "personalizedGreeting": "ברכה אישית בעברית",
  "contextReference": "התייחסות למשהו שדוברנו בעבר",
  "suggestedTopic": "נושא לדבר עליו",
  "emotionalTone": "warm/professional/casual"
}`);
  }

  getSentimentTrend(customerKey) {
    const sentiments = this.data.sentiments[customerKey] || [];
    if (sentiments.length === 0) return "unknown";
    const recent = sentiments.slice(-5);
    const score = recent.reduce((s, x) => s + (x.s === "positive" ? 1 : x.s === "negative" ? -1 : 0), 0);
    return score > 1 ? "improving" : score < -1 ? "declining" : "stable";
  }
}

// ═══════════════════════════════════════
// SOCIAL MEDIA AUTOPILOT — Auto-publish completed projects
// ═══════════════════════════════════════

class SocialMediaAutopilot {
  constructor(brain, memory, modules) {
    this.brain = brain;
    this.memory = memory;
    this.modules = modules; // { ops, integrations }
    this.file = path.join(CONFIG.DIR, "social-auto", "state.json");
    this.data = load(this.file, {
      posted: [],
      schedule: [],
      platforms: ["facebook", "instagram", "linkedin"],
      stats: { total: 0, byPlatform: {} },
    });
  }
  save() { save(this.file, this.data); }

  async publishCompletedProject(installationId) {
    const inst = this.modules.ops?.data?.installations?.find(i => i.id === installationId);
    if (!inst || inst.status !== "completed") return null;
    if (this.data.posted.some(p => p.installationId === installationId)) return null;

    const post = await this.brain.thinkJSON(`
אתה Social Media AI של טכנו כל עוזי. צור פוסט אוטומטי על התקנה שהושלמה.

═══ ההתקנה ═══
לקוח: ${inst.customerName}
מיקום: ${inst.city}
סוג: ${inst.projectType}
תאריך: ${inst.completedAt}

תחזיר JSON:
{
  "facebookPost": {"text": "...", "hashtags": ["..."], "callToAction": "..."},
  "instagramPost": {"text": "...", "hashtags": ["..."], "imagePrompt": "..."},
  "linkedinPost": {"text": "...", "hashtags": ["..."], "professionalAngle": "..."},
  "expectedReach": 0,
  "expectedEngagement": 0
}`);

    if (post) {
      const record = {
        id: uid(),
        installationId,
        customer: inst.customerName,
        post,
        publishedAt: now(),
        platforms: this.data.platforms,
      };
      this.data.posted.push(record);
      this.data.posted = this.data.posted.slice(-200);
      this.data.stats.total++;
      for (const platform of this.data.platforms) {
        this.data.stats.byPlatform[platform] = (this.data.stats.byPlatform[platform] || 0) + 1;
      }
      this.save();
      log("SOCIAL-AUTO", `📱 פורסם: ${inst.customerName} ב-${this.data.platforms.join(", ")}`);
    }
    return post;
  }
}

// ═══════════════════════════════════════
// REFERRAL PROGRAM — Track referrals and rewards
// ═══════════════════════════════════════

class ReferralProgram {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "referrals", "state.json");
    this.data = load(this.file, {
      referrals: [],
      rewards: {
        firstReferralCompleted: { type: "discount", value: 5, unit: "percent" },     // 5% discount on next project
        threeReferrals:         { type: "discount", value: 10, unit: "percent" },    // 10% discount
        fiveReferrals:          { type: "gift", value: agorot(50000), name: "מתנה ₪500" },
        bigDealReferral:        { type: "cash", value: agorot(100000), name: "₪1000 קאש על עסקה גדולה" },
      },
      stats: { totalReferrals: 0, converted: 0, totalRewardsPaid: 0 },
    });
  }
  save() { save(this.file, this.data); }

  registerReferral(data) {
    const ref = {
      id: `REF-${uid()}`,
      referrerName: data.referrerName,
      referrerPhone: data.referrerPhone || "",
      referredName: data.referredName,
      referredPhone: data.referredPhone,
      referredProjectType: data.referredProjectType,
      status: "pending", // pending, contacted, qualified, converted, lost
      conversionValue: 0,
      rewardEarned: null,
      rewardPaid: false,
      createdAt: now(),
    };
    this.data.referrals.push(ref);
    this.data.stats.totalReferrals++;
    this.save();
    log("REFERRAL", `🤝 הפניה: ${ref.referrerName} → ${ref.referredName}`);
    return ref;
  }

  markConverted(referralId, dealValue) {
    const ref = this.data.referrals.find(r => r.id === referralId);
    if (!ref) return null;
    ref.status = "converted";
    ref.conversionValue = dealValue;
    ref.convertedAt = now();
    this.data.stats.converted++;

    // Compute reward
    const referrerCount = this.data.referrals.filter(r => r.referrerName === ref.referrerName && r.status === "converted").length;

    if (dealValue >= agorot(2000000)) {
      ref.rewardEarned = this.data.rewards.bigDealReferral;
    } else if (referrerCount >= 5) {
      ref.rewardEarned = this.data.rewards.fiveReferrals;
    } else if (referrerCount >= 3) {
      ref.rewardEarned = this.data.rewards.threeReferrals;
    } else {
      ref.rewardEarned = this.data.rewards.firstReferralCompleted;
    }

    log("REFERRAL", `🏆 הפניה הומרה: ${ref.referrerName} → ₪${shekel(dealValue)} (תגמול: ${ref.rewardEarned.name || ref.rewardEarned.value + ref.rewardEarned.unit})`, "SUCCESS");
    this.memory.add("successes", { type: "referral_converted", referrer: ref.referrerName, value: dealValue });
    this.save();
    return ref;
  }

  payReward(referralId) {
    const ref = this.data.referrals.find(r => r.id === referralId);
    if (!ref || !ref.rewardEarned || ref.rewardPaid) return null;
    ref.rewardPaid = true;
    ref.rewardPaidAt = now();
    if (ref.rewardEarned.unit === undefined) {
      this.data.stats.totalRewardsPaid += ref.rewardEarned.value || 0;
    }
    this.save();
    return ref;
  }

  getReferrerLeaderboard(limit = 10) {
    const counts = {};
    for (const r of this.data.referrals) {
      if (r.status !== "converted") continue;
      if (!counts[r.referrerName]) counts[r.referrerName] = { name: r.referrerName, count: 0, totalValue: 0 };
      counts[r.referrerName].count++;
      counts[r.referrerName].totalValue += r.conversionValue || 0;
    }
    return Object.values(counts).sort((a, b) => b.totalValue - a.totalValue).slice(0, limit);
  }
}

// ═══════════════════════════════════════
// CUSTOMER PORTAL — Self-service web portal data layer
// ═══════════════════════════════════════

class CustomerPortal {
  constructor(memory, modules) {
    this.memory = memory;
    this.modules = modules; // { erp, finance, ops, quality }
    this.file = path.join(CONFIG.DIR, "portal", "state.json");
    this.data = load(this.file, {
      sessions: [],
      portalUsers: {},
    });
  }
  save() { save(this.file, this.data); }

  getCustomerDashboard(customerName) {
    const projects = this.modules.erp?.data?.projects?.filter(p => p.customer?.name === customerName) || [];
    const invoices = this.modules.finance?.data?.invoices?.filter(i => i.customerName === customerName) || [];
    const installations = this.modules.ops?.data?.installations?.filter(i => i.customerName === customerName) || [];
    const warranties = this.modules.quality?.data?.warranties?.filter(w => w.customerName === customerName) || [];

    return {
      customer: customerName,
      summary: {
        projectsCount: projects.length,
        activeProjects: projects.filter(p => !["completed", "cancelled", "lost"].includes(p.status)).length,
        unpaidInvoices: invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").length,
        activeWarranties: warranties.filter(w => w.status === "active").length,
      },
      projects: projects.map(p => ({
        id: p.id, name: p.name, type: p.type, status: p.status,
        estimatedDays: p.timeline?.estimatedDays, actualDays: p.timeline?.actualDays,
        currentStage: p.status,
      })),
      invoices: invoices.map(i => ({
        number: i.number, total: i.total, status: i.status, dueDate: i.dueDate, paid: i.status === "paid",
      })),
      installations: installations.map(i => ({
        id: i.id, date: i.date, status: i.status, address: i.address,
      })),
      warranties: warranties.map(w => ({
        id: w.id, productType: w.productType,
        startDate: w.structuralWarranty?.start, endDate: w.structuralWarranty?.end,
        years: w.structuralWarranty?.years,
      })),
    };
  }

  renderPortalHTML(customerName) {
    const data = this.getCustomerDashboard(customerName);
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>פורטל לקוח — ${customerName}</title>
<style>body{font-family:Arial;margin:0;background:#f5f7fa;color:#222}.header{background:#0a4a8f;color:white;padding:30px}.container{max-width:1100px;margin:auto;padding:20px}.card{background:white;border-radius:8px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.05)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.metric{font-size:32px;font-weight:bold;color:#0a4a8f}.label{color:#888;font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f0f4f8;padding:10px;text-align:right}td{padding:10px;border-bottom:1px solid #eee}</style>
</head><body>
<div class="header"><h1>פורטל לקוח — ${customerName}</h1><p>טכנו כל עוזי בע"מ · 80 שנה ניסיון</p></div>
<div class="container">
<div class="grid">
<div class="card"><div class="metric">${data.summary.projectsCount}</div><div class="label">פרויקטים סה"כ</div></div>
<div class="card"><div class="metric">${data.summary.activeProjects}</div><div class="label">פרויקטים פעילים</div></div>
<div class="card"><div class="metric">${data.summary.unpaidInvoices}</div><div class="label">חשבוניות ממתינות</div></div>
<div class="card"><div class="metric">${data.summary.activeWarranties}</div><div class="label">אחריות פעילה</div></div>
</div>
<div class="card"><h3>פרויקטים</h3><table><thead><tr><th>שם</th><th>סוג</th><th>סטטוס</th></tr></thead><tbody>
${data.projects.map(p => `<tr><td>${p.name}</td><td>${p.type}</td><td>${p.status}</td></tr>`).join("") || "<tr><td colspan='3'>אין פרויקטים</td></tr>"}
</tbody></table></div>
<div class="card"><h3>חשבוניות</h3><table><thead><tr><th>מספר</th><th>סכום</th><th>סטטוס</th><th>יעד תשלום</th></tr></thead><tbody>
${data.invoices.map(i => `<tr><td>${i.number}</td><td>₪${shekel(i.total)}</td><td>${i.status}</td><td>${i.dueDate || ""}</td></tr>`).join("") || "<tr><td colspan='4'>אין חשבוניות</td></tr>"}
</tbody></table></div>
<div class="card"><h3>אחריות</h3><table><thead><tr><th>סוג</th><th>תחילה</th><th>סיום</th><th>שנים</th></tr></thead><tbody>
${data.warranties.map(w => `<tr><td>${w.productType}</td><td>${w.startDate}</td><td>${w.endDate}</td><td>${w.years}</td></tr>`).join("") || "<tr><td colspan='4'>אין אחריות פעילה</td></tr>"}
</tbody></table></div>
</div></body></html>`;
  }
}

// ═══════════════════════════════════════
// EXPORT PART 10
// ═══════════════════════════════════════

module.exports = {
  DocumentGenerator,
  LegalDocAI,
  VoiceAI,
  ConversationMemory,
  SocialMediaAutopilot,
  ReferralProgram,
  CustomerPortal,
};
