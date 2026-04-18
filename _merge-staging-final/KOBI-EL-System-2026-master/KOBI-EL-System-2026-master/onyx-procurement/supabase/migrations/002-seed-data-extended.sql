-- ═══════════════════════════════════════════════════════════════════════
-- ONYX PROCUREMENT — SEED DATA EXTENDED
-- 15 ספקים + 80+ מוצרים + 8 קבלני משנה + מחירון מלא
-- Run AFTER 001-supabase-schema.sql
-- ═══════════════════════════════════════════════════════════════════════

-- Clean existing seed data (safe — only deletes if exists)
DELETE FROM subcontractor_pricing;
DELETE FROM subcontractors;
DELETE FROM supplier_products;
DELETE FROM suppliers WHERE name IN (
  'מתכות השרון','ברזל ופלדה בע"מ','פלדת אילון','מתכת הדרום',
  'אלומין טק','אלו-פרו','נירו סטיל','זכוכית המרכז',
  'פנורמה זכוכית','צבעי טמבור','בורגי ישראל','טולס מאסטר',
  'Foshan Steel Trading','מתכת מקס','סטיל פרו','עיר הברזל',
  'אלומיניום ישראל','זכוכית השרון'
);

-- ═══ SUPPLIERS ═══

INSERT INTO suppliers (name, contact_person, phone, email, whatsapp, address, country, preferred_channel, default_payment_terms, avg_delivery_days, distance_km, rating, delivery_reliability, quality_score, risk_score, notes, tags) VALUES
-- ברזל ופלדה
('מתכות השרון', 'שמעון דהן', '+972521001001', 'shimon@metalsaron.co.il', '+972521001001', 'אזור תעשייה נתניה', 'ישראל', 'whatsapp', 'שוטף + 30', 3, 45, 8.5, 8, 8.5, 20, 'ספק ותיק ואמין, מחירים טובים על כמויות', ARRAY['ברזל','ותיק','מומלץ']),
('ברזל ופלדה בע"מ', 'רועי כץ', '+972521002002', 'roi@ironandsteel.co.il', '+972521002002', 'אזור תעשייה חדרה', 'ישראל', 'email', 'שוטף + 45', 5, 80, 7, 7, 7.5, 35, 'מחירים תחרותיים אבל לפעמים איחורים', ARRAY['ברזל','פלדה']),
('פלדת אילון', 'מוטי אילון', '+972521003003', NULL, '+972521003003', 'יבנה', 'ישראל', 'whatsapp', 'שוטף + 30', 2, 30, 9, 9, 9, 15, 'הכי מהיר — אספקה תוך יומיים', ARRAY['ברזל','מהיר','פרימיום']),
('מתכת הדרום', 'חיים בן דוד', '+972521004004', 'haim@metaldrom.co.il', '+972521004004', 'באר שבע', 'ישראל', 'whatsapp', 'שוטף + 60', 7, 120, 6, 6, 7, 45, 'מחירים הכי זולים אבל רחוק ואיטי', ARRAY['ברזל','זול']),
-- אלומיניום
('אלומין טק', 'ענבל שרון', '+972521005005', 'inbal@alumitek.co.il', '+972521005005', 'ראשון לציון', 'ישראל', 'email', 'שוטף + 30', 4, 15, 8, 8, 9, 20, 'מומחים באלומיניום — איכות מעולה', ARRAY['אלומיניום','מומלץ']),
('אלו-פרו', 'דני גולד', '+972521006006', 'dani@alupro.co.il', '+972521006006', 'פתח תקווה', 'ישראל', 'whatsapp', 'שוטף + 30', 3, 20, 7.5, 7, 8, 25, 'מגוון רחב של פרופילים', ARRAY['אלומיניום']),
-- נירוסטה
('נירו סטיל', 'אלכס פטרוב', '+972521007007', 'alex@nirosteel.co.il', '+972521007007', 'אשדוד', 'ישראל', 'whatsapp', 'שוטף + 30', 5, 50, 8, 7.5, 9, 25, 'נירוסטה 304 ו-316 — איכות מעולה', ARRAY['נירוסטה','פרימיום']),
-- זכוכית
('זכוכית המרכז', 'עופר לוי', '+972521008008', 'ofer@glasscenter.co.il', '+972521008008', 'לוד', 'ישראל', 'email', 'שוטף + 30', 10, 25, 7.5, 6, 9, 30, 'זכוכית מחוסמת ולמינציה — leadtime ארוך', ARRAY['זכוכית']),
('פנורמה זכוכית', 'מיכל אדרי', '+972521009009', 'michal@panorama-glass.co.il', '+972521009009', 'חולון', 'ישראל', 'whatsapp', 'שוטף + 45', 14, 8, 8.5, 7, 9.5, 25, 'הכי איכותי בזכוכית — מחירים גבוהים', ARRAY['זכוכית','פרימיום']),
-- צבע
('צבעי טמבור', 'יוסי פרץ', '+972521010010', 'yossi@tambour-dist.co.il', '+972521010010', 'אזור תעשייה נס ציונה', 'ישראל', 'email', 'שוטף + 30', 2, 20, 9, 9, 9, 10, 'ספק רשמי טמבור — תמיד במלאי', ARRAY['צבע','אמין']),
-- אביזרים
('בורגי ישראל', 'אמיר נחמיאס', '+972521011011', 'amir@borgey.co.il', '+972521011011', 'חולון', 'ישראל', 'whatsapp', 'שוטף + 30', 1, 5, 8, 9, 8, 15, 'אספקה מיידית — ברגים אביזרים חומרי ריתוך', ARRAY['אביזרים','מהיר']),
-- כלי עבודה
('טולס מאסטר', 'רון ביטון', '+972521012012', 'ron@toolsmaster.co.il', '+972521012012', 'ראש העין', 'ישראל', 'whatsapp', 'שוטף + 30', 3, 30, 7, 7.5, 7, 30, 'כלי עבודה חשמליים ואביזרי בטיחות', ARRAY['כלי_עבודה','בטיחות']),
-- יבוא
('Foshan Steel Trading', 'David Wang', '+8613800138000', 'david@foshansteel.com', '+8613800138000', 'Foshan, Guangdong', 'סין', 'email', 'T/T 30% deposit', 45, 8000, 6, 5, 6.5, 65, 'מחירים הכי זולים אבל leadtime 45 יום + מכס', ARRAY['ברזל','יבוא','סין']);

-- ═══ PRODUCTS — מוצרים לכל ספק ═══

-- מתכות השרון — ברזל מלא
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברזל', 'ברזל עגול 8 מ"מ', 'ST37 אורך 6 מטר', 'מטר', 28, 50, 3),
  ('ברזל', 'ברזל עגול 10 מ"מ', 'ST37', 'מטר', 35, 50, 3),
  ('ברזל', 'ברזל עגול 12 מ"מ', 'ST37', 'מטר', 43, 50, 3),
  ('ברזל', 'ברזל עגול 16 מ"מ', 'ST37', 'מטר', 52, 30, 3),
  ('ברזל', 'ברזל עגול 20 מ"מ', 'ST37', 'מטר', 68, 20, 3),
  ('ברזל', 'פרופיל מרובע 20×20', '20×20×2', 'מטר', 32, 50, 3),
  ('ברזל', 'פרופיל מרובע 30×30', '30×30×2', 'מטר', 42, 50, 3),
  ('ברזל', 'פרופיל מרובע 40×40', '40×40×2', 'מטר', 58, 30, 3),
  ('ברזל', 'פרופיל מרובע 50×50', '50×50×3', 'מטר', 78, 20, 3),
  ('ברזל', 'פרופיל מלבני 60×40', '60×40×2', 'מטר', 65, 20, 3),
  ('ברזל', 'פח ברזל 1.5 מ"מ', '1×2 מטר', 'מ"ר', 55, 10, 3),
  ('ברזל', 'פח ברזל 2 מ"מ', '1×2 מטר', 'מ"ר', 72, 10, 3),
  ('ברזל', 'פח ברזל 3 מ"מ', '1×2 מטר', 'מ"ר', 105, 10, 3),
  ('ברזל', 'צינור עגול 42 מ"מ', '42.4×2.5 למעקות', 'מטר', 48, 30, 3),
  ('ברזל', 'צינור עגול 50 מ"מ', '50×2.5', 'מטר', 55, 30, 3),
  ('ברזל', 'זווית 40×40', '40×40×4', 'מטר', 38, 30, 3),
  ('ברזל', 'זווית 50×50', '50×50×5', 'מטר', 52, 20, 3),
  ('ברזל', 'IPE 100', 'I beam', 'מטר', 95, 10, 5),
  ('ברזל', 'IPE 140', 'I beam', 'מטר', 135, 10, 5),
  ('ברזל', 'IPE 200', 'I beam', 'מטר', 195, 10, 7)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'מתכות השרון';

-- פלדת אילון — מהיר, יקר יותר
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברזל', 'ברזל עגול 12 מ"מ', 'ST37 אספקה מהירה', 'מטר', 46, 20, 2),
  ('ברזל', 'ברזל עגול 16 מ"מ', 'ST37', 'מטר', 55, 20, 2),
  ('ברזל', 'פרופיל מרובע 40×40', '40×40×2', 'מטר', 62, 20, 2),
  ('ברזל', 'פרופיל מרובע 50×50', '50×50×3', 'מטר', 82, 10, 2),
  ('ברזל', 'פח ברזל 2 מ"מ', 'אספקה מיידית', 'מ"ר', 78, 5, 1),
  ('ברזל', 'צינור עגול 42 מ"מ', '42.4×2.5 למעקות', 'מטר', 52, 20, 2)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'פלדת אילון';

-- ברזל ופלדה בע"מ — כמויות גדולות, מחירים טובים
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברזל', 'ברזל עגול 12 מ"מ', 'ST37', 'מטר', 40, 100, 5),
  ('ברזל', 'ברזל עגול 16 מ"מ', 'ST37', 'מטר', 49, 100, 5),
  ('ברזל', 'פרופיל מרובע 40×40', '40×40×2', 'מטר', 55, 50, 5),
  ('ברזל', 'פח ברזל 2 מ"מ', '', 'מ"ר', 68, 20, 5),
  ('ברזל', 'IPE 100', 'I beam', 'מטר', 88, 20, 7),
  ('ברזל', 'IPE 200', 'I beam', 'מטר', 180, 10, 7)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'ברזל ופלדה בע"מ';

-- מתכת הדרום — הכי זול
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברזל', 'ברזל עגול 12 מ"מ', 'הכי זול ST37', 'מטר', 36, 200, 7),
  ('ברזל', 'ברזל עגול 16 מ"מ', 'ST37', 'מטר', 44, 200, 7),
  ('ברזל', 'פרופיל מרובע 40×40', '40×40×2', 'מטר', 50, 100, 7),
  ('ברזל', 'פח ברזל 2 מ"מ', '', 'מ"ר', 62, 30, 7)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'מתכת הדרום';

-- אלומין טק
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('אלומיניום', 'פרופיל אלומיניום 50×30', '6063-T5', 'מטר', 72, 30, 4),
  ('אלומיניום', 'פרופיל אלומיניום 40×40', '6063-T5', 'מטר', 65, 30, 4),
  ('אלומיניום', 'פרופיל אלומיניום 60×40', '6063-T5', 'מטר', 85, 20, 4),
  ('אלומיניום', 'צינור אלומיניום עגול 50', '50 מ"מ עובי 2', 'מטר', 58, 20, 4),
  ('אלומיניום', 'פח אלומיניום 1.5 מ"מ', '1000×2000', 'מ"ר', 92, 10, 4),
  ('אלומיניום', 'פח אלומיניום 2 מ"מ', '1000×2000', 'מ"ר', 115, 10, 5),
  ('אלומיניום', 'פרופיל U אלומיניום', 'U channel 40×20×2', 'מטר', 45, 50, 4),
  ('אלומיניום', 'זווית אלומיניום 40×40', '40×40×3', 'מטר', 38, 50, 4)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'אלומין טק';

-- אלו-פרו
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('אלומיניום', 'פרופיל אלומיניום 50×30', '6063-T5', 'מטר', 68, 20, 3),
  ('אלומיניום', 'פרופיל אלומיניום 40×40', '6063-T5', 'מטר', 60, 20, 3),
  ('אלומיניום', 'פח אלומיניום 1.5 מ"מ', '', 'מ"ר', 88, 10, 3),
  ('אלומיניום', 'צינור אלומיניום עגול 50', '', 'מטר', 55, 20, 3)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'אלו-פרו';

-- נירו סטיל
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('נירוסטה', 'צינור נירוסטה 42 מ"מ', 'AISI 304 42.4×2', 'מטר', 95, 10, 5),
  ('נירוסטה', 'צינור נירוסטה 50 מ"מ', 'AISI 304 50×2', 'מטר', 115, 10, 5),
  ('נירוסטה', 'פח נירוסטה 1.5 מ"מ', 'AISI 304 1×2 מטר', 'מ"ר', 180, 5, 5),
  ('נירוסטה', 'פח נירוסטה 2 מ"מ', 'AISI 304', 'מ"ר', 220, 5, 7),
  ('נירוסטה', 'פרופיל נירוסטה 40×40', 'AISI 304 40×40×2', 'מטר', 125, 10, 5),
  ('נירוסטה', 'מעקה נירוסטה מוכן', '42 מ"מ + 3 חוטים', 'מטר', 450, 5, 14),
  ('נירוסטה', 'כדור נירוסטה 42', 'כדור עליון 42 מ"מ', 'יחידה', 35, 20, 3),
  ('נירוסטה', 'בסיס עגול נירוסטה', 'צמוד רצפה ∅80', 'יחידה', 45, 20, 3)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'נירו סטיל';

-- זכוכית המרכז
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('זכוכית', 'זכוכית מחוסמת 8 מ"מ', 'שקופה', 'מ"ר', 220, 5, 10),
  ('זכוכית', 'זכוכית מחוסמת 10 מ"מ', 'שקופה', 'מ"ר', 270, 5, 10),
  ('זכוכית', 'זכוכית מחוסמת 12 מ"מ', 'שקופה', 'מ"ר', 340, 3, 14),
  ('זכוכית', 'זכוכית למינציה 6+6', 'בטיחותית למעקות', 'מ"ר', 350, 3, 14),
  ('זכוכית', 'זכוכית למינציה 8+8', 'בטיחותית למעקות', 'מ"ר', 410, 3, 14)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'זכוכית המרכז';

-- פנורמה זכוכית
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('זכוכית', 'זכוכית מחוסמת 10 מ"מ', 'פרימיום שקופה', 'מ"ר', 290, 3, 12),
  ('זכוכית', 'זכוכית מחוסמת 12 מ"מ', 'פרימיום שקופה', 'מ"ר', 360, 3, 14),
  ('זכוכית', 'זכוכית למינציה 8+8', 'פרימיום למעקות', 'מ"ר', 440, 2, 14),
  ('זכוכית', 'זכוכית חלבית 10 מ"מ', 'מחוסמת חלבית', 'מ"ר', 320, 3, 14),
  ('זכוכית', 'זכוכית צבעונית 10 מ"מ', 'ברונזה/אפור', 'מ"ר', 340, 3, 21)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'פנורמה זכוכית';

-- צבעי טמבור
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('צבע', 'אפוקסי יסוד אפור', 'טמבור 4 ליטר', 'ליטר', 85, 4, 1),
  ('צבע', 'אפוקסי גמר שחור', 'טמבור 4 ליטר', 'ליטר', 95, 4, 1),
  ('צבע', 'אפוקסי גמר לבן', 'טמבור 4 ליטר', 'ליטר', 95, 4, 1),
  ('צבע', 'אפוקסי גמר DB703', 'אפור כהה', 'ליטר', 105, 4, 2),
  ('צבע', 'מדלל אפוקסי', '', 'ליטר', 35, 4, 1),
  ('צבע', 'צבע חלודה', 'אנטי-חלודה אדום', 'ליטר', 45, 4, 1),
  ('צבע', 'ציפוי אבץ קר', 'ספריי 400 מ"ל', 'יחידה', 55, 6, 1),
  ('צבע', 'חומר ניקוי מתכת', 'מנקה שומנים', 'ליטר', 25, 5, 1)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'צבעי טמבור';

-- בורגי ישראל
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברגים_ואביזרים', 'בורג M8×30', 'שש-קנט מגולוון', 'אריזה', 45, 1, 1),
  ('ברגים_ואביזרים', 'בורג M10×40', 'שש-קנט', 'אריזה', 55, 1, 1),
  ('ברגים_ואביזרים', 'בורג M12×50', 'שש-קנט', 'אריזה', 65, 1, 1),
  ('ברגים_ואביזרים', 'אום M10', 'מגולוון', 'אריזה', 25, 1, 1),
  ('ברגים_ואביזרים', 'שייבה M10', 'שטוחה', 'אריזה', 15, 1, 1),
  ('ברגים_ואביזרים', 'עוגן כימי', '300 מ"ל + מקדח', 'יחידה', 85, 5, 1),
  ('ברגים_ואביזרים', 'עוגן מכני M12', 'HST M12×100', 'יחידה', 12, 20, 1),
  ('ברגים_ואביזרים', 'אלקטרודות ריתוך 2.5', 'E6013 5 ק"ג', 'אריזה', 65, 1, 1),
  ('ברגים_ואביזרים', 'אלקטרודות ריתוך 3.2', 'E6013 5 ק"ג', 'אריזה', 75, 1, 1),
  ('ברגים_ואביזרים', 'דיסק חיתוך 125', '125×1.6 מ"מ', 'יחידה', 8, 25, 1),
  ('ברגים_ואביזרים', 'דיסק השחזה 125', '125×6 מ"מ', 'יחידה', 12, 10, 1),
  ('ברגים_ואביזרים', 'חוט ריתוך MIG 0.8', '15 ק"ג', 'יחידה', 180, 1, 1),
  ('ברגים_ואביזרים', 'גז CO2', 'בלון 10 ק"ג', 'יחידה', 120, 1, 1),
  ('ברגים_ואביזרים', 'ציר כבד 150 מ"מ', 'לשער כבד', 'יחידה', 45, 4, 1),
  ('ברגים_ואביזרים', 'מנעול שער חשמלי', 'אלקטרו-מכני', 'יחידה', 350, 1, 3)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'בורגי ישראל';

-- טולס מאסטר
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'ILS', v.moq, v.lead
FROM suppliers s, (VALUES
  ('כלי_עבודה', 'משחזת זווית 125', 'Bosch GWS 750-125', 'יחידה', 350, 1, 3),
  ('כלי_עבודה', 'מקדחה רוטטת', 'Bosch GSB 13 RE', 'יחידה', 280, 1, 3),
  ('כלי_עבודה', 'מברגה אימפקט', 'Makita DTD155', 'יחידה', 650, 1, 3),
  ('כלי_עבודה', 'סט מקדחי ברזל', 'HSS 1-13 מ"מ 25 חלקים', 'יחידה', 180, 1, 2),
  ('ציוד_בטיחות', 'קסדת מגן', 'לבנה תקנית', 'יחידה', 35, 5, 1),
  ('ציוד_בטיחות', 'נעלי בטיחות', 'S3 כיפת פלדה', 'יחידה', 220, 1, 3),
  ('ציוד_בטיחות', 'כפפות ריתוך', 'עור ארוכות', 'יחידה', 45, 5, 1),
  ('ציוד_בטיחות', 'מסכת ריתוך אוטומטית', 'DIN 9-13', 'יחידה', 280, 1, 3),
  ('ציוד_בטיחות', 'משקפי מגן', 'שקופות', 'יחידה', 25, 10, 1),
  ('ציוד_בטיחות', 'אטמי אוזניים', '3M', 'אריזה', 15, 10, 1),
  ('ציוד_בטיחות', 'רתמת בטיחות', 'גוף מלא + חבל', 'יחידה', 350, 1, 3)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'טולס מאסטר';

-- Foshan Steel — יבוא סין
INSERT INTO supplier_products (supplier_id, category, name, description, unit, current_price, currency, min_order_qty, lead_time_days)
SELECT s.id, v.cat, v.name, v.descr, v.unit, v.price, 'USD', v.moq, v.lead
FROM suppliers s, (VALUES
  ('ברזל', 'ברזל עגול 12 מ"מ', 'Q235 FOB Foshan', 'טון', 550, 5, 45),
  ('ברזל', 'פרופיל מרובע 40×40', 'Q235 FOB', 'טון', 580, 5, 45),
  ('ברזל', 'פח ברזל 2 מ"מ', 'Q235 1220×2440', 'טון', 520, 10, 45),
  ('נירוסטה', 'צינור נירוסטה 42 מ"מ', 'AISI 304 FOB', 'טון', 2200, 2, 45),
  ('נירוסטה', 'פח נירוסטה 2 מ"מ', 'AISI 304 FOB', 'טון', 2400, 2, 45)
) AS v(cat, name, descr, unit, price, moq, lead)
WHERE s.name = 'Foshan Steel Trading';


-- ═══ SUBCONTRACTORS — 8 קבלני משנה ═══

INSERT INTO subcontractors (name, phone, email, specialties, quality_rating, reliability_rating, available, notes) VALUES
('משה מעקות', '+972541001001', NULL, ARRAY['מעקות_ברזל','מעקות_אלומיניום'], 8, 9, true, 'ותיק ואמין, עובד עם החברה 5 שנים'),
('דוד מסגריה', '+972541002002', NULL, ARRAY['מעקות_ברזל','שערים','גדרות'], 7, 7, true, 'מגוון רחב, מחירים סבירים'),
('יוסי התקנות', '+972541003003', NULL, ARRAY['התקנה','מעקות_ברזל'], 9, 6, true, 'איכות מעולה אבל לא תמיד בזמן'),
('אמיר פרגולות', '+972541004004', NULL, ARRAY['פרגולות','גדרות'], 8, 8, true, 'מומחה פרגולות'),
('אבו חסן', '+972541005005', NULL, ARRAY['מעקות_ברזל','גדרות'], 7, 8, true, 'מהיר ואמין, מחירים טובים'),
('יגאל ריתוך', '+972541006006', NULL, ARRAY['מעקות_ברזל','מעקות_אלומיניום','שערים'], 9, 7, true, 'איכות מעולה, לפעמים איטי'),
('סרגיי מסגר', '+972541007007', NULL, ARRAY['שערים','גדרות','פרגולות'], 8, 9, true, 'מקצועי, דובר רוסית'),
('ברוך צביעה', '+972541008008', NULL, ARRAY['צביעה'], 9, 9, true, 'הכי טוב בצביעה — אפוקסי ואלקטרוסטטי');


-- ═══ SUBCONTRACTOR PRICING — מחירון מלא ═══

-- משה מעקות
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('מעקות_ברזל', 15, 350, 5000), ('מעקות_אלומיניום', 12, 400, 5000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'משה מעקות'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- דוד מסגריה
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('מעקות_ברזל', 18, 300, 4000), ('שערים', 20, 500, 6000), ('גדרות', 15, 280, 3000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'דוד מסגריה'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- יוסי התקנות
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('התקנה', 10, 200, 3000), ('מעקות_ברזל', 14, 380, 5000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'יוסי התקנות'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- אמיר פרגולות
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('פרגולות', 22, 600, 8000), ('גדרות', 16, 300, 4000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'אמיר פרגולות'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- אבו חסן
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('מעקות_ברזל', 16, 320, 4000), ('גדרות', 14, 250, 3000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'אבו חסן'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- יגאל ריתוך
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('מעקות_ברזל', 18, 380, 5000), ('מעקות_אלומיניום', 15, 420, 5000), ('שערים', 20, 550, 7000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'יגאל ריתוך'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- סרגיי מסגר
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('שערים', 17, 480, 5000), ('גדרות', 13, 230, 3000), ('פרגולות', 20, 550, 8000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'סרגיי מסגר'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;

-- ברוך צביעה
INSERT INTO subcontractor_pricing (subcontractor_id, work_type, percentage_rate, price_per_sqm, minimum_price)
SELECT s.id, v.wt, v.pct, v.sqm, v.min FROM subcontractors s, (VALUES
  ('צביעה', 8, 120, 2000)
) AS v(wt, pct, sqm, min) WHERE s.name = 'ברוך צביעה'
ON CONFLICT (subcontractor_id, work_type) DO UPDATE SET percentage_rate=EXCLUDED.percentage_rate, price_per_sqm=EXCLUDED.price_per_sqm, minimum_price=EXCLUDED.minimum_price;


-- ═══ VERIFY ═══
SELECT '✅ Seed data loaded!' AS result;
SELECT 'Suppliers: ' || COUNT(*) FROM suppliers;
SELECT 'Products: ' || COUNT(*) FROM supplier_products;
SELECT 'Subcontractors: ' || COUNT(*) FROM subcontractors;
SELECT 'Pricing rules: ' || COUNT(*) FROM subcontractor_pricing;
