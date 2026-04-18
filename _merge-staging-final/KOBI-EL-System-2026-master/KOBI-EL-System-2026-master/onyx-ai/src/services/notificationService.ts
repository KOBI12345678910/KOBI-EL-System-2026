/**
 * notificationService.ts
 * WhatsApp Business API integration for ERP notifications.
 * Env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
 */

import * as https from 'https';

export interface NotificationPayload {
  to: string;            // phone number with country code e.g. 9725XXXXXXXX
  type: 'text' | 'template';
  message?: string;
  templateName?: string;
  templateParams?: string[];
}

function httpsPost(url: string, body: object, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: responseBody }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export async function sendWhatsApp(payload: NotificationPayload): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.warn('[notificationService] WHATSAPP_TOKEN or WHATSAPP_PHONE_ID not set — skipping WhatsApp send');
    return;
  }

  let requestBody: object;

  if (payload.type === 'template' && payload.templateName) {
    requestBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'template',
      template: {
        name: payload.templateName,
        language: { code: 'he' },
        components: payload.templateParams && payload.templateParams.length > 0
          ? [{
              type: 'body',
              parameters: payload.templateParams.map((p) => ({ type: 'text', text: p })),
            }]
          : [],
      },
    };
  } else {
    requestBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'text',
      text: { body: payload.message ?? '' },
    };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const result = await httpsPost(url, requestBody, { Authorization: `Bearer ${token}` });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`[notificationService] WhatsApp API error ${result.statusCode}: ${result.body}`);
  }

  console.log(`[notificationService] WhatsApp sent to ${payload.to} (status ${result.statusCode})`);
}

export async function sendPayslipNotification(employee: any, wageSlip: any): Promise<void> {
  const name: string = employee.name || employee.full_name || 'עובד';
  const month: string = wageSlip.month || wageSlip.period || '';
  const net: string | number = wageSlip.net || wageSlip.net_salary || 0;
  const id: string = wageSlip.id || wageSlip.payslip_id || '';
  const phone: string = employee.phone || employee.mobile || '';

  if (!phone) {
    console.warn(`[notificationService] sendPayslipNotification: no phone for employee ${employee.id}`);
    return;
  }

  const message = `שלום ${name}, תלוש שכר לחודש ${month} מוכן. נטו: ₪${net}. https://app.techno-kol.com/payslip/${id}`;
  await sendWhatsApp({ to: phone, type: 'text', message });
}

export async function sendWorkOrderAssignment(employee: any, workOrder: any): Promise<void> {
  const name: string = employee.name || employee.full_name || 'עובד';
  const id: string = workOrder.id || workOrder.work_order_id || '';
  const description: string = workOrder.description || workOrder.title || '';
  const date: string = workOrder.date || workOrder.scheduled_date || '';
  const phone: string = employee.phone || employee.mobile || '';

  if (!phone) {
    console.warn(`[notificationService] sendWorkOrderAssignment: no phone for employee ${employee.id}`);
    return;
  }

  const message = `שלום ${name}, הוקצתה לך הזמנת עבודה #${id}: ${description}. תאריך: ${date}`;
  await sendWhatsApp({ to: phone, type: 'text', message });
}

export async function sendAlertNotification(manager: any, alert: any): Promise<void> {
  const title: string = alert.title || '';
  const alertMessage: string = alert.message || alert.body || '';
  const phone: string = manager.phone || manager.mobile || '';

  if (!phone) {
    console.warn(`[notificationService] sendAlertNotification: no phone for manager ${manager.id}`);
    return;
  }

  const message = `⚠️ התראה: ${title}. ${alertMessage}. מערכת ERP טכנו כל עוזי`;
  await sendWhatsApp({ to: phone, type: 'text', message });
}

export async function sendInvoiceReminder(customer: any, invoice: any): Promise<void> {
  const name: string = customer.name || customer.full_name || 'לקוח';
  const id: string = invoice.id || invoice.invoice_number || '';
  const amount: string | number = invoice.amount || invoice.total || 0;
  const dueDate: string = invoice.due_date || invoice.dueDate || '';
  const phone: string = customer.phone || customer.mobile || '';

  if (!phone) {
    console.warn(`[notificationService] sendInvoiceReminder: no phone for customer ${customer.id}`);
    return;
  }

  const message = `שלום ${name}, תזכורת: חשבונית #${id} על סך ₪${amount} ממתינה לתשלום עד ${dueDate}`;
  await sendWhatsApp({ to: phone, type: 'text', message });
}
