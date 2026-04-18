/**
 * ONYX — Seed Firestore with initial data
 * Run: node seed-firestore.js
 */

const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

async function seed() {
  console.log('🌱 Loading seed data into Firestore...\n');

  // ═══ SUPPLIERS ═══
  const suppliers = [
    { name: 'מתכות השרון', contact_person: 'שמעון דהן', phone: '+972521001001', email: 'shimon@metalsaron.co.il', whatsapp: '+972521001001', address: 'נתניה', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 3, rating: 8.5, delivery_reliability: 8, quality_score: 8.5, overall_score: 82, risk_score: 20, active: true, total_orders: 0, total_spent: 0, tags: ['ברזל','ותיק'] },
    { name: 'ברזל ופלדה בע"מ', contact_person: 'רועי כץ', phone: '+972521002002', email: 'roi@ironandsteel.co.il', whatsapp: '+972521002002', address: 'חדרה', country: 'ישראל', preferred_channel: 'email', default_payment_terms: 'שוטף + 45', avg_delivery_days: 5, rating: 7, delivery_reliability: 7, quality_score: 7.5, overall_score: 70, risk_score: 35, active: true, total_orders: 0, total_spent: 0, tags: ['ברזל'] },
    { name: 'פלדת אילון', contact_person: 'מוטי אילון', phone: '+972521003003', whatsapp: '+972521003003', address: 'יבנה', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 2, rating: 9, delivery_reliability: 9, quality_score: 9, overall_score: 90, risk_score: 15, active: true, total_orders: 0, total_spent: 0, tags: ['ברזל','מהיר'] },
    { name: 'מתכת הדרום', contact_person: 'חיים בן דוד', phone: '+972521004004', whatsapp: '+972521004004', address: 'באר שבע', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 60', avg_delivery_days: 7, rating: 6, delivery_reliability: 6, quality_score: 7, overall_score: 58, risk_score: 45, active: true, total_orders: 0, total_spent: 0, tags: ['ברזל','זול'] },
    { name: 'אלומין טק', contact_person: 'ענבל שרון', phone: '+972521005005', email: 'inbal@alumitek.co.il', whatsapp: '+972521005005', address: 'ראשון לציון', country: 'ישראל', preferred_channel: 'email', default_payment_terms: 'שוטף + 30', avg_delivery_days: 4, rating: 8, delivery_reliability: 8, quality_score: 9, overall_score: 83, risk_score: 20, active: true, total_orders: 0, total_spent: 0, tags: ['אלומיניום'] },
    { name: 'אלו-פרו', contact_person: 'דני גולד', phone: '+972521006006', whatsapp: '+972521006006', address: 'פתח תקווה', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 3, rating: 7.5, delivery_reliability: 7, quality_score: 8, overall_score: 73, risk_score: 25, active: true, total_orders: 0, total_spent: 0, tags: ['אלומיניום'] },
    { name: 'נירו סטיל', contact_person: 'אלכס פטרוב', phone: '+972521007007', whatsapp: '+972521007007', address: 'אשדוד', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 5, rating: 8, delivery_reliability: 7.5, quality_score: 9, overall_score: 80, risk_score: 25, active: true, total_orders: 0, total_spent: 0, tags: ['נירוסטה'] },
    { name: 'זכוכית המרכז', contact_person: 'עופר לוי', phone: '+972521008008', email: 'ofer@glasscenter.co.il', whatsapp: '+972521008008', address: 'לוד', country: 'ישראל', preferred_channel: 'email', default_payment_terms: 'שוטף + 30', avg_delivery_days: 10, rating: 7.5, delivery_reliability: 6, quality_score: 9, overall_score: 72, risk_score: 30, active: true, total_orders: 0, total_spent: 0, tags: ['זכוכית'] },
    { name: 'פנורמה זכוכית', contact_person: 'מיכל אדרי', phone: '+972521009009', whatsapp: '+972521009009', address: 'חולון', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 45', avg_delivery_days: 14, rating: 8.5, delivery_reliability: 7, quality_score: 9.5, overall_score: 80, risk_score: 25, active: true, total_orders: 0, total_spent: 0, tags: ['זכוכית','פרימיום'] },
    { name: 'צבעי טמבור', contact_person: 'יוסי פרץ', phone: '+972521010010', email: 'yossi@tambour.co.il', whatsapp: '+972521010010', address: 'נס ציונה', country: 'ישראל', preferred_channel: 'email', default_payment_terms: 'שוטף + 30', avg_delivery_days: 2, rating: 9, delivery_reliability: 9, quality_score: 9, overall_score: 90, risk_score: 10, active: true, total_orders: 0, total_spent: 0, tags: ['צבע','אמין'] },
    { name: 'בורגי ישראל', contact_person: 'אמיר נחמיאס', phone: '+972521011011', whatsapp: '+972521011011', address: 'חולון', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 1, rating: 8, delivery_reliability: 9, quality_score: 8, overall_score: 84, risk_score: 15, active: true, total_orders: 0, total_spent: 0, tags: ['אביזרים','מהיר'] },
    { name: 'טולס מאסטר', contact_person: 'רון ביטון', phone: '+972521012012', whatsapp: '+972521012012', address: 'ראש העין', country: 'ישראל', preferred_channel: 'whatsapp', default_payment_terms: 'שוטף + 30', avg_delivery_days: 3, rating: 7, delivery_reliability: 7.5, quality_score: 7, overall_score: 70, risk_score: 30, active: true, total_orders: 0, total_spent: 0, tags: ['כלי_עבודה','בטיחות'] },
  ];

  const supplierIds = {};
  for (const s of suppliers) {
    const ref = await db.collection('suppliers').add({ ...s, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    supplierIds[s.name] = ref.id;
    console.log(`  ✅ ספק: ${s.name}`);
  }

  // ═══ PRODUCTS ═══
  const products = [
    // מתכות השרון
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'ברזל עגול 12 מ"מ', unit: 'מטר', price: 43, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'ברזל עגול 16 מ"מ', unit: 'מטר', price: 52, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'פרופיל מרובע 40×40', unit: 'מטר', price: 58, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'פרופיל מרובע 50×50', unit: 'מטר', price: 78, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'פח ברזל 2 מ"מ', unit: 'מ"ר', price: 72, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'צינור עגול 42 מ"מ', unit: 'מטר', price: 48, lead: 3 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'IPE 100', unit: 'מטר', price: 95, lead: 5 },
    { sup: 'מתכות השרון', cat: 'ברזל', name: 'IPE 200', unit: 'מטר', price: 195, lead: 7 },
    // פלדת אילון
    { sup: 'פלדת אילון', cat: 'ברזל', name: 'ברזל עגול 12 מ"מ', unit: 'מטר', price: 46, lead: 2 },
    { sup: 'פלדת אילון', cat: 'ברזל', name: 'פרופיל מרובע 40×40', unit: 'מטר', price: 62, lead: 2 },
    { sup: 'פלדת אילון', cat: 'ברזל', name: 'פח ברזל 2 מ"מ', unit: 'מ"ר', price: 78, lead: 1 },
    // ברזל ופלדה
    { sup: 'ברזל ופלדה בע"מ', cat: 'ברזל', name: 'ברזל עגול 12 מ"מ', unit: 'מטר', price: 40, lead: 5 },
    { sup: 'ברזל ופלדה בע"מ', cat: 'ברזל', name: 'פרופיל מרובע 40×40', unit: 'מטר', price: 55, lead: 5 },
    { sup: 'ברזל ופלדה בע"מ', cat: 'ברזל', name: 'IPE 200', unit: 'מטר', price: 180, lead: 7 },
    // מתכת הדרום
    { sup: 'מתכת הדרום', cat: 'ברזל', name: 'ברזל עגול 12 מ"מ', unit: 'מטר', price: 36, lead: 7 },
    { sup: 'מתכת הדרום', cat: 'ברזל', name: 'פרופיל מרובע 40×40', unit: 'מטר', price: 50, lead: 7 },
    // אלומין טק
    { sup: 'אלומין טק', cat: 'אלומיניום', name: 'פרופיל אלומיניום 50×30', unit: 'מטר', price: 72, lead: 4 },
    { sup: 'אלומין טק', cat: 'אלומיניום', name: 'פרופיל אלומיניום 40×40', unit: 'מטר', price: 65, lead: 4 },
    { sup: 'אלומין טק', cat: 'אלומיניום', name: 'פח אלומיניום 1.5 מ"מ', unit: 'מ"ר', price: 92, lead: 4 },
    // אלו-פרו
    { sup: 'אלו-פרו', cat: 'אלומיניום', name: 'פרופיל אלומיניום 50×30', unit: 'מטר', price: 68, lead: 3 },
    { sup: 'אלו-פרו', cat: 'אלומיניום', name: 'פרופיל אלומיניום 40×40', unit: 'מטר', price: 60, lead: 3 },
    // נירו סטיל
    { sup: 'נירו סטיל', cat: 'נירוסטה', name: 'צינור נירוסטה 42 מ"מ', unit: 'מטר', price: 95, lead: 5 },
    { sup: 'נירו סטיל', cat: 'נירוסטה', name: 'צינור נירוסטה 50 מ"מ', unit: 'מטר', price: 115, lead: 5 },
    { sup: 'נירו סטיל', cat: 'נירוסטה', name: 'פח נירוסטה 2 מ"מ', unit: 'מ"ר', price: 220, lead: 7 },
    { sup: 'נירו סטיל', cat: 'נירוסטה', name: 'מעקה נירוסטה מוכן', unit: 'מטר', price: 450, lead: 14 },
    // זכוכית המרכז
    { sup: 'זכוכית המרכז', cat: 'זכוכית', name: 'זכוכית מחוסמת 10 מ"מ', unit: 'מ"ר', price: 270, lead: 10 },
    { sup: 'זכוכית המרכז', cat: 'זכוכית', name: 'זכוכית מחוסמת 12 מ"מ', unit: 'מ"ר', price: 340, lead: 14 },
    { sup: 'זכוכית המרכז', cat: 'זכוכית', name: 'זכוכית למינציה 8+8', unit: 'מ"ר', price: 410, lead: 14 },
    // פנורמה
    { sup: 'פנורמה זכוכית', cat: 'זכוכית', name: 'זכוכית מחוסמת 10 מ"מ', unit: 'מ"ר', price: 290, lead: 12 },
    { sup: 'פנורמה זכוכית', cat: 'זכוכית', name: 'זכוכית למינציה 8+8', unit: 'מ"ר', price: 440, lead: 14 },
    // טמבור
    { sup: 'צבעי טמבור', cat: 'צבע', name: 'אפוקסי יסוד אפור', unit: 'ליטר', price: 85, lead: 1 },
    { sup: 'צבעי טמבור', cat: 'צבע', name: 'אפוקסי גמר שחור', unit: 'ליטר', price: 95, lead: 1 },
    { sup: 'צבעי טמבור', cat: 'צבע', name: 'צבע חלודה', unit: 'ליטר', price: 45, lead: 1 },
    // בורגי ישראל
    { sup: 'בורגי ישראל', cat: 'ברגים_ואביזרים', name: 'בורג M10×40', unit: 'אריזה', price: 55, lead: 1 },
    { sup: 'בורגי ישראל', cat: 'ברגים_ואביזרים', name: 'עוגן כימי', unit: 'יחידה', price: 85, lead: 1 },
    { sup: 'בורגי ישראל', cat: 'ברגים_ואביזרים', name: 'אלקטרודות ריתוך 3.2', unit: 'אריזה', price: 75, lead: 1 },
    { sup: 'בורגי ישראל', cat: 'ברגים_ואביזרים', name: 'דיסק חיתוך 125', unit: 'יחידה', price: 8, lead: 1 },
    { sup: 'בורגי ישראל', cat: 'ברגים_ואביזרים', name: 'חוט ריתוך MIG 0.8', unit: 'יחידה', price: 180, lead: 1 },
    // טולס מאסטר
    { sup: 'טולס מאסטר', cat: 'כלי_עבודה', name: 'משחזת זווית 125', unit: 'יחידה', price: 350, lead: 3 },
    { sup: 'טולס מאסטר', cat: 'ציוד_בטיחות', name: 'נעלי בטיחות', unit: 'יחידה', price: 220, lead: 3 },
    { sup: 'טולס מאסטר', cat: 'ציוד_בטיחות', name: 'מסכת ריתוך אוטומטית', unit: 'יחידה', price: 280, lead: 3 },
    { sup: 'טולס מאסטר', cat: 'ציוד_בטיחות', name: 'רתמת בטיחות', unit: 'יחידה', price: 350, lead: 3 },
  ];

  for (const p of products) {
    if (!supplierIds[p.sup]) continue;
    await db.collection('supplier_products').add({ supplier_id: supplierIds[p.sup], category: p.cat, name: p.name, unit: p.unit, current_price: p.price, currency: 'ILS', lead_time_days: p.lead, created_at: new Date().toISOString() });
  }
  console.log(`  ✅ ${products.length} מוצרים`);

  // ═══ SUBCONTRACTORS ═══
  const subs = [
    { name: 'משה מעקות', phone: '+972541001001', specialties: ['מעקות_ברזל','מעקות_אלומיניום'], quality_rating: 8, reliability_rating: 9, available: true },
    { name: 'דוד מסגריה', phone: '+972541002002', specialties: ['מעקות_ברזל','שערים','גדרות'], quality_rating: 7, reliability_rating: 7, available: true },
    { name: 'יוסי התקנות', phone: '+972541003003', specialties: ['התקנה','מעקות_ברזל'], quality_rating: 9, reliability_rating: 6, available: true },
    { name: 'אמיר פרגולות', phone: '+972541004004', specialties: ['פרגולות','גדרות'], quality_rating: 8, reliability_rating: 8, available: true },
    { name: 'אבו חסן', phone: '+972541005005', specialties: ['מעקות_ברזל','גדרות'], quality_rating: 7, reliability_rating: 8, available: true },
    { name: 'יגאל ריתוך', phone: '+972541006006', specialties: ['מעקות_ברזל','שערים'], quality_rating: 9, reliability_rating: 7, available: true },
    { name: 'סרגיי מסגר', phone: '+972541007007', specialties: ['שערים','גדרות','פרגולות'], quality_rating: 8, reliability_rating: 9, available: true },
    { name: 'ברוך צביעה', phone: '+972541008008', specialties: ['צביעה'], quality_rating: 9, reliability_rating: 9, available: true },
  ];

  const subIds = {};
  for (const s of subs) {
    const ref = await db.collection('subcontractors').add({ ...s, created_at: new Date().toISOString() });
    subIds[s.name] = ref.id;
    console.log(`  ✅ קבלן: ${s.name}`);
  }

  // ═══ PRICING ═══
  const pricing = [
    { sub: 'משה מעקות', work_type: 'מעקות_ברזל', percentage_rate: 15, price_per_sqm: 350, minimum_price: 5000 },
    { sub: 'משה מעקות', work_type: 'מעקות_אלומיניום', percentage_rate: 12, price_per_sqm: 400, minimum_price: 5000 },
    { sub: 'דוד מסגריה', work_type: 'מעקות_ברזל', percentage_rate: 18, price_per_sqm: 300, minimum_price: 4000 },
    { sub: 'דוד מסגריה', work_type: 'שערים', percentage_rate: 20, price_per_sqm: 500, minimum_price: 6000 },
    { sub: 'דוד מסגריה', work_type: 'גדרות', percentage_rate: 15, price_per_sqm: 280, minimum_price: 3000 },
    { sub: 'יוסי התקנות', work_type: 'התקנה', percentage_rate: 10, price_per_sqm: 200, minimum_price: 3000 },
    { sub: 'יוסי התקנות', work_type: 'מעקות_ברזל', percentage_rate: 14, price_per_sqm: 380, minimum_price: 5000 },
    { sub: 'אמיר פרגולות', work_type: 'פרגולות', percentage_rate: 22, price_per_sqm: 600, minimum_price: 8000 },
    { sub: 'אמיר פרגולות', work_type: 'גדרות', percentage_rate: 16, price_per_sqm: 300, minimum_price: 4000 },
    { sub: 'אבו חסן', work_type: 'מעקות_ברזל', percentage_rate: 16, price_per_sqm: 320, minimum_price: 4000 },
    { sub: 'אבו חסן', work_type: 'גדרות', percentage_rate: 14, price_per_sqm: 250, minimum_price: 3000 },
    { sub: 'יגאל ריתוך', work_type: 'מעקות_ברזל', percentage_rate: 18, price_per_sqm: 380, minimum_price: 5000 },
    { sub: 'יגאל ריתוך', work_type: 'שערים', percentage_rate: 20, price_per_sqm: 550, minimum_price: 7000 },
    { sub: 'סרגיי מסגר', work_type: 'שערים', percentage_rate: 17, price_per_sqm: 480, minimum_price: 5000 },
    { sub: 'סרגיי מסגר', work_type: 'גדרות', percentage_rate: 13, price_per_sqm: 230, minimum_price: 3000 },
    { sub: 'סרגיי מסגר', work_type: 'פרגולות', percentage_rate: 20, price_per_sqm: 550, minimum_price: 8000 },
    { sub: 'ברוך צביעה', work_type: 'צביעה', percentage_rate: 8, price_per_sqm: 120, minimum_price: 2000 },
  ];

  for (const p of pricing) {
    if (!subIds[p.sub]) continue;
    await db.collection('subcontractor_pricing').add({ subcontractor_id: subIds[p.sub], work_type: p.work_type, percentage_rate: p.percentage_rate, price_per_sqm: p.price_per_sqm, minimum_price: p.minimum_price });
  }
  console.log(`  ✅ ${pricing.length} כללי מחירון`);

  console.log('\n🎉 Seed data loaded successfully!');
  console.log(`   ${suppliers.length} suppliers`);
  console.log(`   ${products.length} products`);
  console.log(`   ${subs.length} subcontractors`);
  console.log(`   ${pricing.length} pricing rules`);
}

seed().catch(console.error);
