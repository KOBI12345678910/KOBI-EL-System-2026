/**
 * emailService.ts
 * Nodemailer-based email service for ERP notifications.
 * Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
 */

import * as nodemailer from 'nodemailer';

function createTransporter(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[emailService] SMTP_USER or SMTP_PASS not set — skipping email send');
    return;
  }

  const transporter = createTransporter();
  const from = process.env.FROM_EMAIL || `"טכנו כל עוזי ERP" <noreply@techno-kol.com>`;

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.htmlBody,
    text: options.textBody,
  });

  console.log(`[emailService] Email sent to ${options.to}: "${options.subject}"`);
}

export async function sendWageSlipEmail(employee: any, wageSlip: any): Promise<void> {
  const name: string = employee.name || employee.full_name || 'עובד';
  const month: string = wageSlip.month || wageSlip.period || '';
  const gross: string | number = wageSlip.gross || wageSlip.gross_salary || 0;
  const net: string | number = wageSlip.net || wageSlip.net_salary || 0;
  const deductions: string | number = wageSlip.deductions || 0;
  const id: string = wageSlip.id || wageSlip.payslip_id || '';
  const email: string = employee.email || '';

  if (!email) {
    console.warn(`[emailService] sendWageSlipEmail: no email for employee ${employee.id}`);
    return;
  }

  const subject = `תלוש שכר - ${month} - טכנו כל עוזי`;
  const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1a237e; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; opacity: 0.8; font-size: 14px; }
    .body { padding: 32px; }
    .greeting { font-size: 16px; margin-bottom: 24px; color: #333; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .table th { background: #e8eaf6; color: #1a237e; padding: 10px 14px; text-align: right; font-size: 14px; }
    .table td { padding: 10px 14px; border-bottom: 1px solid #eee; color: #444; font-size: 14px; }
    .net-row td { font-weight: bold; color: #1a237e; font-size: 16px; background: #f3f4ff; }
    .footer { background: #f5f5f5; padding: 16px 32px; text-align: center; font-size: 12px; color: #888; }
    .btn { display: inline-block; background: #1a237e; color: #fff; padding: 12px 28px; border-radius: 4px; text-decoration: none; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>טכנו כל עוזי — תלוש שכר</h1>
      <p>${month}</p>
    </div>
    <div class="body">
      <p class="greeting">שלום ${name},</p>
      <p>תלוש השכר שלך לחודש <strong>${month}</strong> מוכן לצפייה.</p>
      <table class="table">
        <thead><tr><th>פרטי שכר</th><th>סכום (₪)</th></tr></thead>
        <tbody>
          <tr><td>שכר ברוטו</td><td>₪${gross}</td></tr>
          <tr><td>ניכויים</td><td>₪${deductions}</td></tr>
          <tr class="net-row"><td>שכר נטו</td><td>₪${net}</td></tr>
        </tbody>
      </table>
      <a href="https://app.techno-kol.com/payslip/${id}" class="btn">צפה בתלוש המלא</a>
    </div>
    <div class="footer">מערכת ERP טכנו כל עוזי | noreply@techno-kol.com</div>
  </div>
</body>
</html>`;

  const textBody = `שלום ${name},\nתלוש שכר לחודש ${month}: ברוטו ₪${gross} | ניכויים ₪${deductions} | נטו ₪${net}\nצפה בתלוש: https://app.techno-kol.com/payslip/${id}`;

  await sendEmail({ to: email, subject, htmlBody, textBody });
}

export async function sendInvoiceEmail(customer: any, invoice: any): Promise<void> {
  const name: string = customer.name || customer.full_name || 'לקוח';
  const invoiceNumber: string = invoice.invoice_number || invoice.id || '';
  const amount: string | number = invoice.amount || invoice.total || 0;
  const dueDate: string = invoice.due_date || invoice.dueDate || '';
  const email: string = customer.email || '';

  if (!email) {
    console.warn(`[emailService] sendInvoiceEmail: no email for customer ${customer.id}`);
    return;
  }

  const subject = `חשבונית מס #${invoiceNumber} - טכנו כל עוזי`;
  const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #004d40; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; }
    .body { padding: 32px; color: #333; }
    .detail { margin: 8px 0; font-size: 15px; }
    .total { font-size: 22px; font-weight: bold; color: #004d40; margin: 24px 0 16px; }
    .btn { display: inline-block; background: #004d40; color: #fff; padding: 12px 28px; border-radius: 4px; text-decoration: none; font-size: 14px; }
    .footer { background: #f5f5f5; padding: 16px 32px; text-align: center; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>חשבונית מס #${invoiceNumber}</h1></div>
    <div class="body">
      <p>שלום ${name},</p>
      <p>מצורפת חשבונית מס מטכנו כל עוזי.</p>
      <div class="detail"><strong>מספר חשבונית:</strong> ${invoiceNumber}</div>
      <div class="detail"><strong>תאריך לתשלום:</strong> ${dueDate}</div>
      <div class="total">סה"כ לתשלום: ₪${amount}</div>
      <a href="https://app.techno-kol.com/invoice/${invoiceNumber}" class="btn">צפה בחשבונית</a>
    </div>
    <div class="footer">מערכת ERP טכנו כל עוזי | noreply@techno-kol.com</div>
  </div>
</body>
</html>`;

  await sendEmail({ to: email, subject, htmlBody });
}

export async function sendAlertEmail(to: string, alert: any): Promise<void> {
  const title: string = alert.title || 'התראה';
  const alertMessage: string = alert.message || alert.body || '';
  const severity: string = alert.severity || alert.level || 'info';

  const subject = `⚠️ התראה: ${title}`;
  const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #b71c1c; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { padding: 32px; color: #333; font-size: 15px; line-height: 1.6; }
    .severity { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: bold; background: #fce4ec; color: #b71c1c; margin-bottom: 16px; }
    .footer { background: #f5f5f5; padding: 16px 32px; text-align: center; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>⚠️ ${title}</h1></div>
    <div class="body">
      <span class="severity">חומרה: ${severity}</span>
      <p>${alertMessage}</p>
    </div>
    <div class="footer">מערכת ERP טכנו כל עוזי | noreply@techno-kol.com</div>
  </div>
</body>
</html>`;

  await sendEmail({ to, subject, htmlBody, textBody: `⚠️ התראה: ${title}\n${alertMessage}` });
}
