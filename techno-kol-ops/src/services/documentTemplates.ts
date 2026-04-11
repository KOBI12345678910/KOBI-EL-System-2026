import { query } from '../db/connection';

// ════════════════════════════════════════════
// תבניות מסמכים
// ════════════════════════════════════════════

export const documentTemplates = {

  // ── חוזה ללקוח
  async buildClientContract(params: {
    clientName: string;
    clientPhone: string;
    clientAddress?: string;
    projectTitle: string;
    projectAddress: string;
    totalPrice: number;
    advancePct: number;
    deliveryDate: string;
    description?: string;
    warrantyMonths?: number;
  }): Promise<string> {
    const date = new Date().toLocaleDateString('he-IL');
    const advance = Math.round(params.totalPrice * (params.advancePct / 100));
    const balance = params.totalPrice - advance;
    const warrantyMonths = params.warrantyMonths || 24;

    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.8; padding: 50px; }
  .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 24px; margin-bottom: 32px; }
  .logo { font-size: 36px; font-weight: 900; letter-spacing: 0.1em; }
  .logo-sub { font-size: 13px; color: #555; margin-top: 4px; }
  h1 { font-size: 24px; font-weight: 900; text-align: center; margin-bottom: 8px; letter-spacing: 0.05em; }
  h2 { font-size: 16px; font-weight: 700; border-bottom: 2px solid #000; padding-bottom: 4px; margin: 28px 0 12px; }
  .parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .party-box { border: 1.5px solid #1a1a1a; padding: 16px; }
  .party-label { font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #555; margin-bottom: 8px; }
  .party-name { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
  .party-detail { font-size: 12px; color: #444; margin-bottom: 2px; }
  p { margin-bottom: 10px; text-align: justify; }
  .highlight { background: #f5f5f5; border-right: 4px solid #000; padding: 12px 16px; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background: #1a1a1a; color: #fff; padding: 10px 14px; font-size: 12px; }
  td { padding: 10px 14px; border-bottom: 1px solid #ddd; }
  .total td { font-weight: 900; font-size: 16px; background: #f9f9f9; }
  .section-num { font-size: 11px; font-weight: 700; color: #888; margin-bottom: 4px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
  .sig-box { }
  .sig-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .sig-line { border-bottom: 1.5px solid #000; height: 60px; margin: 12px 0 6px; }
  .sig-label { font-size: 11px; color: #888; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">TECHNO-KOL</div>
  <div class="logo-sub">טכנו-קול עוזי בע"מ | ח.פ. 515XXXXXXX | רחוב המלאכה 12, תל אביב | 052-XXXXXXX</div>
</div>

<h1>הסכם לביצוע עבודות מסגרות</h1>
<p style="text-align:center;color:#666;margin-bottom:32px">נערך ונחתם ב${date}</p>

<h2>הצדדים להסכם</h2>
<div class="parties-grid">
  <div class="party-box">
    <div class="party-label">הצד הראשון — הקבלן</div>
    <div class="party-name">טכנו-קול עוזי בע"מ</div>
    <div class="party-detail">ח.פ.: 515XXXXXXX</div>
    <div class="party-detail">כתובת: רחוב המלאכה 12, תל אביב</div>
    <div class="party-detail">טלפון: 052-XXXXXXX</div>
    <div class="party-detail">דוא"ל: info@techno-kol.co.il</div>
  </div>
  <div class="party-box">
    <div class="party-label">הצד השני — המזמין</div>
    <div class="party-name">${params.clientName}</div>
    <div class="party-detail">טלפון: ${params.clientPhone}</div>
    ${params.clientAddress ? `<div class="party-detail">כתובת: ${params.clientAddress}</div>` : ''}
  </div>
</div>

<h2>סעיף 1 — מושא ההסכם</h2>
<div class="section-num">1.1</div>
<p>המזמין מזמין מהקבלן, והקבלן מתחייב לייצר, לספק ולהתקין את עבודות המסגרות המפורטות להלן, וזאת בהתאם לכל התנאים המפורטים בהסכם זה.</p>

<div class="section-num">1.2</div>
<p><strong>תיאור העבודה:</strong></p>
<div class="highlight">${params.projectTitle}${params.description ? '<br>' + params.description : ''}</div>

<div class="section-num">1.3</div>
<p><strong>כתובת הביצוע:</strong> ${params.projectAddress}</p>

<h2>סעיף 2 — תמורה ותנאי תשלום</h2>
<div class="section-num">2.1</div>
<p>התמורה הכוללת עבור ביצוע מלוא העבודה נקבעה בסכום של:</p>

<table>
  <thead>
    <tr><th>פירוט</th><th>אחוז</th><th>סכום (לפני מע"מ)</th><th>מע"מ 18%</th><th>סכום כולל מע"מ</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>מקדמה בחתימת הסכם</td>
      <td>${params.advancePct}%</td>
      <td>₪${advance.toLocaleString('he-IL')}</td>
      <td>₪${Math.round(advance * 0.18).toLocaleString('he-IL')}</td>
      <td>₪${Math.round(advance * 1.18).toLocaleString('he-IL')}</td>
    </tr>
    <tr>
      <td>יתרה בסיום ומסירה</td>
      <td>${100 - params.advancePct}%</td>
      <td>₪${balance.toLocaleString('he-IL')}</td>
      <td>₪${Math.round(balance * 0.18).toLocaleString('he-IL')}</td>
      <td>₪${Math.round(balance * 1.18).toLocaleString('he-IL')}</td>
    </tr>
  </tbody>
  <tfoot>
    <tr class="total">
      <td colspan="2">סה"כ</td>
      <td>₪${params.totalPrice.toLocaleString('he-IL')}</td>
      <td>₪${Math.round(params.totalPrice * 0.18).toLocaleString('he-IL')}</td>
      <td>₪${Math.round(params.totalPrice * 1.18).toLocaleString('he-IL')}</td>
    </tr>
  </tfoot>
</table>

<div class="section-num">2.2</div>
<p>התשלומים יבוצעו בהעברה בנקאית לחשבון הבנק של הקבלן:</p>
<div class="highlight">
  בנק לאומי | סניף 800 | חשבון: 12345678<br>
  שם: טכנו-קול עוזי בע"מ
</div>

<h2>סעיף 3 — לוח זמנים</h2>
<div class="section-num">3.1</div>
<p>הקבלן מתחייב להשלים את כלל העבודות ולמסור אותן לידי המזמין עד תאריך: <strong>${params.deliveryDate}</strong></p>

<div class="section-num">3.2</div>
<p>תנאי מוקדם להתחלת ביצוע העבודות הינו קבלת המקדמה המפורטת בסעיף 2 לעיל.</p>

<div class="section-num">3.3</div>
<p>עיכוב שיגרם עקב אי-זמינות של חומרי גלם, כוח עליון, שביתות, מזג אוויר קיצוני, או כל נסיבות שאינן בשליטת הקבלן, לא יחשב כאיחור לצורך הסכם זה.</p>

<h2>סעיף 4 — אחריות ותיקונים</h2>
<div class="section-num">4.1</div>
<p>הקבלן מעניק אחריות מלאה על כל העבודות שבוצעו לתקופה של <strong>${warrantyMonths} חודשים</strong> ממועד המסירה.</p>

<div class="section-num">4.2</div>
<p>האחריות מכסה פגמים הנובעים מליקויי ייצור, חומרי גלם לקויים, או אי-תקינות בביצוע.</p>

<div class="section-num">4.3</div>
<p>האחריות אינה חלה על נזקים הנגרמים כתוצאה מ: שימוש לרעה, רשלנות המזמין, פגעי מזג אוויר חריגים, וונדליזם, או כל גורם חיצוני שאינו בשליטת הקבלן.</p>

<h2>סעיף 5 — שינויים בהיקף העבודה</h2>
<div class="section-num">5.1</div>
<p>כל שינוי בהיקף העבודה, בחומרים, או בלוח הזמנים, יבוצע אך ורק בהסכמה מראש ובכתב בין שני הצדדים.</p>

<div class="section-num">5.2</div>
<p>שינויים עשויים להשפיע על המחיר הכולל ועל לוח הזמנים, בהתאם להסכמה בין הצדדים.</p>

<h2>סעיף 6 — ביטול ההסכם</h2>
<div class="section-num">6.1</div>
<p>ביטול ההסכם על ידי המזמין לאחר תחילת הביצוע יחייב את המזמין בתשלום של 30% מסכום ההסכם כפיצוי.</p>

<div class="section-num">6.2</div>
<p>ביטול על ידי הקבלן טרם תחילת הביצוע יחייב את הקבלן בהשבת המקדמה במלואה.</p>

<h2>סעיף 7 — קניין רוחני ושמירת סודיות</h2>
<p>כל שרטוטים, תכניות, ותכנים שהוכנו על ידי הקבלן לצורך הסכם זה הינם קניינו הרוחני של הקבלן.</p>

<h2>סעיף 8 — ברירת דין וסמכות שיפוט</h2>
<p>על הסכם זה יחול הדין הישראלי בלבד. סמכות השיפוט הבלעדית לכל סכסוך הנוגע להסכם זה תהיה לבתי המשפט המוסמכים בתל אביב.</p>

<h2>סעיף 9 — הצהרות הצדדים</h2>
<p>הצדדים מצהירים כי קראו את ההסכם, הבינו את תוכנו, ומסכימים לכלל תנאיו. כל אחד מהצדדים מצהיר כי הינו מוסמך לחתום על הסכם זה.</p>

<div class="sig-grid">
  <div class="sig-box">
    <div class="sig-name">הקבלן — טכנו-קול עוזי בע"מ</div>
    <div class="sig-line"></div>
    <div class="sig-label">חתימה + חותמת | תאריך: ________________</div>
  </div>
  <div class="sig-box">
    <div class="sig-name">המזמין — ${params.clientName}</div>
    <div class="sig-line"></div>
    <div class="sig-label">חתימה | תאריך: ________________</div>
  </div>
</div>

</body>
</html>`;
  },

  // ── חוזה עובד
  async buildEmployeeContract(params: {
    employeeName: string;
    employeeId?: string;
    role: string;
    department: string;
    salary: number;
    startDate: string;
    employmentType: 'full' | 'part' | 'subcontractor';
    workHours?: string;
    benefits?: string[];
  }): Promise<string> {
    const date = new Date().toLocaleDateString('he-IL');
    const monthlyNetApprox = Math.round(params.salary * 0.75);
    const employerCost = Math.round(params.salary * 1.32);
    const typeLabel = params.employmentType === 'full' ? 'משרה מלאה'
      : params.employmentType === 'part' ? 'משרה חלקית' : 'קבלן משנה';

    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.8; padding: 50px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #000; padding-bottom: 20px; margin-bottom: 28px; }
  .logo-block .logo { font-size: 28px; font-weight: 900; }
  .logo-block .sub { font-size: 11px; color: #666; }
  .doc-info { text-align: left; }
  .doc-title { font-size: 20px; font-weight: 900; }
  .doc-num { font-size: 11px; color: #666; margin-top: 4px; }
  h2 { font-size: 15px; font-weight: 700; background: #1a1a1a; color: #fff; padding: 6px 12px; margin: 24px 0 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
  .info-item { border: 1px solid #ddd; padding: 8px 12px; }
  .info-label { font-size: 10px; color: #888; font-weight: 700; letter-spacing: 0.1em; }
  .info-value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .clause { margin-bottom: 12px; }
  .clause-num { font-size: 11px; color: #888; font-weight: 700; }
  .highlight { background: #fffbf0; border: 1px solid #f59e0b; padding: 12px; margin: 10px 0; }
  .benefit-list { list-style: none; margin: 8px 0; }
  .benefit-list li::before { content: '✓ '; color: #2d9a4e; font-weight: 700; }
  .benefit-list li { margin-bottom: 4px; font-size: 13px; }
  .sig-section { margin-top: 60px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
  .sig-line { border-bottom: 1.5px solid #000; height: 60px; margin: 12px 0 6px; }
  .sig-label { font-size: 11px; color: #888; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #333; color: #fff; padding: 8px 12px; font-size: 11px; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
</style>
</head>
<body>

<div class="header">
  <div class="logo-block">
    <div class="logo">TECHNO-KOL</div>
    <div class="sub">טכנו-קול עוזי בע"מ</div>
    <div class="sub">ח.פ. 515XXXXXXX | רחוב המלאכה 12, תל אביב</div>
    <div class="sub">052-XXXXXXX</div>
  </div>
  <div class="doc-info">
    <div class="doc-title">חוזה העסקה</div>
    <div class="doc-num">תאריך: ${date}</div>
    <div class="doc-num">סוג: ${typeLabel}</div>
  </div>
</div>

<h2>פרטי העובד</h2>
<div class="info-grid">
  <div class="info-item">
    <div class="info-label">שם מלא</div>
    <div class="info-value">${params.employeeName}</div>
  </div>
  <div class="info-item">
    <div class="info-label">תפקיד</div>
    <div class="info-value">${params.role}</div>
  </div>
  <div class="info-item">
    <div class="info-label">מחלקה</div>
    <div class="info-value">${params.department}</div>
  </div>
  <div class="info-item">
    <div class="info-label">תאריך תחילת עבודה</div>
    <div class="info-value">${params.startDate}</div>
  </div>
  <div class="info-item">
    <div class="info-label">סוג העסקה</div>
    <div class="info-value">${typeLabel}</div>
  </div>
  <div class="info-item">
    <div class="info-label">שעות עבודה</div>
    <div class="info-value">${params.workHours || 'א׳-ה׳ 07:00-16:00, ו׳ 07:00-13:00'}</div>
  </div>
</div>

<h2>תנאי שכר ותגמול</h2>
<table>
  <thead>
    <tr><th>פירוט</th><th>סכום חודשי ₪</th><th>הערות</th></tr>
  </thead>
  <tbody>
    <tr><td>שכר ברוטו</td><td>₪${params.salary.toLocaleString('he-IL')}</td><td>שכר בסיס</td></tr>
    <tr><td>ניכויי חובה (ביטוח לאומי + מס הכנסה + פנסיה)</td><td>₪${(params.salary - monthlyNetApprox).toLocaleString('he-IL')}</td><td>משתנה בהתאם להכנסה</td></tr>
    <tr><td><strong>נטו לתשלום (משוער)</strong></td><td><strong>₪${monthlyNetApprox.toLocaleString('he-IL')}</strong></td><td>בהתאם לנקודות זיכוי</td></tr>
  </tbody>
</table>

<div class="highlight">
  <strong>תנאים סוציאליים:</strong><br>
  פנסיה: 6% עובד + 6.5% מעסיק | פיצויים: 8.33% | קרן השתלמות: 7.5% (לאחר שנה)
</div>

<h2>היקף התפקיד ותחומי אחריות</h2>
<div class="clause">
  <div class="clause-num">סעיף 3.1</div>
  <p>העובד יבצע את תפקידו בהתאם להנחיות הממונה עליו ובהתאם לנהלי החברה, ויהיה אחראי לביצוע עבודות ${params.role} באיכות גבוהה ובהתאם לתקנים המקצועיים.</p>
</div>
<div class="clause">
  <div class="clause-num">סעיף 3.2</div>
  <p>העובד מתחייב לשמור על ציוד החברה, לנהוג בבטיחות, ולעמוד בכל תקני הבטיחות הנדרשים בעבודה עם ברזל, אלומיניום וכלי עבודה.</p>
</div>

${params.benefits && params.benefits.length > 0 ? `
<h2>הטבות נוספות</h2>
<ul class="benefit-list">
  ${params.benefits.map(b => `<li>${b}</li>`).join('')}
</ul>
` : ''}

<h2>סודיות ואי-תחרות</h2>
<div class="clause">
  <div class="clause-num">סעיף 5.1</div>
  <p>העובד מתחייב לשמור בסוד מוחלט את כל המידע העסקי, רשימות לקוחות, מחירים, ונהלים שנחשף אליהם במסגרת עבודתו, הן במהלך תקופת העבודה והן לאחריה.</p>
</div>
<div class="clause">
  <div class="clause-num">סעיף 5.2</div>
  <p>בתקופה של 12 חודשים לאחר סיום העסקה, לא יעבוד העובד אצל מתחרה ישיר ולא יגייס לקוחות מרשימת לקוחות החברה.</p>
</div>

<h2>סיום העסקה</h2>
<div class="clause">
  <div class="clause-num">סעיף 6.1</div>
  <p>כל צד רשאי לסיים את ההסכם בהודעה מוקדמת של 30 יום. בתקופת הניסיון (3 חודשים ראשונים) תקופת ההודעה המוקדמת הינה 14 יום.</p>
</div>
<div class="clause">
  <div class="clause-num">סעיף 6.2</div>
  <p>פיטורין בעילה מוצדקת (גניבה, אלימות, הפרה בוטה) יכולים להיות מיידיים ללא הודעה מוקדמת.</p>
</div>

<h2>הצהרות</h2>
<p>הצדדים מצהירים כי קראו הסכם זה, הבינו את תוכנו ומסכימים לכלל תנאיו.</p>
<p>העובד מצהיר כי אינו קשור בהסכמים המונעים ממנו לחתום על הסכם זה ולבצע את תפקידו.</p>

<div class="sig-section">
  <div class="sig-grid">
    <div>
      <div style="font-size:14px;font-weight:700">המעסיק — טכנו-קול עוזי בע"מ</div>
      <div class="sig-line"></div>
      <div class="sig-label">חתימה + חותמת | תאריך: ________________</div>
    </div>
    <div>
      <div style="font-size:14px;font-weight:700">העובד — ${params.employeeName}</div>
      <div class="sig-line"></div>
      <div class="sig-label">חתימה | ת.ז.: ________________ | תאריך: ________________</div>
    </div>
  </div>
</div>

</body>
</html>`;
  },

  // ── NDA — הסכם סודיות
  async buildNDA(params: {
    partyName: string;
    partyType: 'client' | 'supplier' | 'employee' | 'partner';
    projectDescription?: string;
  }): Promise<string> {
    const date = new Date().toLocaleDateString('he-IL');
    const partyLabel = { client: 'לקוח', supplier: 'ספק', employee: 'עובד', partner: 'שותף עסקי' }[params.partyType];

    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.8; padding: 50px; color: #1a1a1a; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #666; margin-bottom: 32px; }
  h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; border-right: 4px solid #000; padding-right: 10px; }
  p { margin-bottom: 10px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
  .sig-line { border-bottom: 1.5px solid #000; height: 60px; margin: 12px 0 6px; }
</style>
</head>
<body>

<h1>הסכם סודיות ואי-גילוי (NDA)</h1>
<div class="subtitle">Non-Disclosure Agreement | תאריך: ${date}</div>

<p>הסכם זה נערך בין <strong>טכנו-קול עוזי בע"מ</strong> לבין <strong>${params.partyName}</strong> (${partyLabel}).</p>

<h2>1. מידע סודי</h2>
<p>המידע הסודי כולל: רשימות לקוחות, מחירי עבודה, שיטות ייצור, נהלים פנימיים, תוכניות עסקיות, וכל מידע עסקי שאינו ידוע לציבור.${params.projectDescription ? ' בפרט בנוגע ל: ' + params.projectDescription : ''}</p>

<h2>2. התחייבויות</h2>
<p>הצד המקבל מתחייב: לא לגלות, לא להשתמש, לא להעתיק, ולא להעביר לאחרים את המידע הסודי ללא אישור מפורש בכתב.</p>

<h2>3. תקופת ההגבלה</h2>
<p>התחייבויות הסודיות יחולו לתקופה של 5 שנים ממועד חתימת הסכם זה.</p>

<h2>4. פיצויים</h2>
<p>הפרת הסכם זה תזכה את הצד הנפגע בפיצוי מוסכם של ₪50,000 וכן בכל נזק נוסף שיוכיח.</p>

<div class="sig-grid">
  <div>
    <strong>טכנו-קול עוזי בע"מ</strong>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888">חתימה + חותמת | תאריך</div>
  </div>
  <div>
    <strong>${params.partyName} (${partyLabel})</strong>
    <div class="sig-line"></div>
    <div style="font-size:11px;color:#888">חתימה | תאריך</div>
  </div>
</div>

</body>
</html>`;
  }
};
