import { db } from "@workspace/db";
import { integrationMessagesTable, integrationConnectionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

interface SendSmsParams {
  connectionId: number;
  to: string;
  message: string;
  entityType?: string;
  entityId?: number;
  entityName?: string;
}

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function getConnectionConfig(connectionId: number) {
  const [conn] = await db
    .select()
    .from(integrationConnectionsTable)
    .where(eq(integrationConnectionsTable.id, connectionId));
  if (!conn) throw new Error("SMS connection not found");
  return conn;
}

export async function sendSmsMessage(params: SendSmsParams): Promise<SmsResult> {
  try {
    const conn = await getConnectionConfig(params.connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const provider = authConfig.provider || "twilio";

    let result: SmsResult;

    if (provider === "twilio") {
      result = await sendViaTwilio(authConfig, params);
    } else if (provider === "nexmo" || provider === "vonage") {
      result = await sendViaNexmo(authConfig, params);
    } else if (provider === "019sms" || provider === "019") {
      result = await sendVia019(authConfig, params);
    } else if (provider === "inforu" || provider === "inforumobile") {
      result = await sendViaInforUMobile(authConfig, params);
    } else {
      result = { success: false, error: `ספק SMS לא נתמך: ${provider}` };
    }

    await db.insert(integrationMessagesTable).values({
      connectionId: params.connectionId,
      channel: "sms",
      direction: "outgoing",
      fromAddress: authConfig.fromNumber || authConfig.senderId || "SYSTEM",
      toAddress: params.to,
      subject: null,
      body: params.message,
      status: result.success ? "sent" : "failed",
      externalId: result.messageId || null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      entityName: params.entityName || null,
      sentAt: result.success ? new Date() : null,
      metadata: { provider, error: result.error || null },
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown SMS error";
    return { success: false, error };
  }
}

async function sendViaTwilio(
  config: Record<string, string>,
  params: SendSmsParams
): Promise<SmsResult> {
  const accountSid = config.accountSid || config.account_sid;
  const authToken = config.authToken || config.auth_token;
  const fromNumber = config.fromNumber || config.from_number;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      error: "חסרים פרטי חיבור Twilio (accountSid, authToken, fromNumber)",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: params.to,
    From: fromNumber,
    Body: params.message,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (response.ok) {
    return { success: true, messageId: data.sid as string };
  }
  return {
    success: false,
    error: (data.message as string) || `Twilio error: ${response.status}`,
  };
}

async function sendViaNexmo(
  config: Record<string, string>,
  params: SendSmsParams
): Promise<SmsResult> {
  const apiKey = config.apiKey || config.api_key;
  const apiSecret = config.apiSecret || config.api_secret;
  const from = config.from || config.senderId || "TechnoKol";

  if (!apiKey || !apiSecret) {
    return {
      success: false,
      error: "חסרים פרטי חיבור Vonage/Nexmo (apiKey, apiSecret)",
    };
  }

  const response = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret: apiSecret,
      to: params.to,
      from,
      text: params.message,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  const messages = (data.messages as Array<Record<string, string>>) || [];
  const first = messages[0];

  if (first && first.status === "0") {
    return { success: true, messageId: first["message-id"] };
  }
  return {
    success: false,
    error: first?.["error-text"] || "Nexmo error",
  };
}

async function sendVia019(
  config: Record<string, string>,
  params: SendSmsParams
): Promise<SmsResult> {
  const username = config.username;
  const password = config.password;
  const source = config.source || config.senderId || "TechnoKol";

  if (!username || !password) {
    return {
      success: false,
      error: "חסרים פרטי חיבור 019SMS (username, password)",
    };
  }

  const url = `https://019sms.co.il/api?user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&from=${encodeURIComponent(source)}&to=${encodeURIComponent(params.to)}&message=${encodeURIComponent(params.message)}`;

  const response = await fetch(url);
  const text = await response.text();

  if (response.ok && text.includes("OK")) {
    return { success: true, messageId: `019-${Date.now()}` };
  }
  return { success: false, error: `019SMS error: ${text}` };
}

async function sendViaInforUMobile(
  config: Record<string, string>,
  params: SendSmsParams
): Promise<SmsResult> {
  const username = config.username;
  const password = config.password;
  const source = config.source || config.senderId || config.sender || "ERP";

  if (!username || !password) {
    return {
      success: false,
      error: "חסרים פרטי חיבור InforUMobile (username, password)",
    };
  }

  const phone = params.to.replace(/[^0-9+]/g, "");
  const israeliPhone = phone.startsWith("0")
    ? "972" + phone.slice(1)
    : phone.startsWith("+972")
    ? phone.slice(1)
    : phone;

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <SendSms xmlns="https://www.inforu.co.il/">
      <Username>${username}</Username>
      <Password>${password}</Password>
      <Message>${params.message}</Message>
      <InforuException>
        <Recipients>
          <PhoneNumber>${israeliPhone}</PhoneNumber>
        </Recipients>
        <Settings>
          <Sender>${source}</Sender>
          <CustomerMessageID>erp-${Date.now()}</CustomerMessageID>
        </Settings>
      </InforuException>
    </SendSms>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await fetch("https://api.inforu.co.il/SendMessageXml.ashx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=UTF-8",
        "SOAPAction": "https://www.inforu.co.il/SendSms",
      },
      body: xmlBody,
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await response.text();

    if (response.ok && responseText.includes("<SendSmsResult>1</SendSmsResult>")) {
      const idMatch = responseText.match(/<BulkID>(\d+)<\/BulkID>/);
      return {
        success: true,
        messageId: idMatch ? `inforu-${idMatch[1]}` : `inforu-${Date.now()}`,
      };
    }

    const errorMatch = responseText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
    const errMsg = errorMatch ? errorMatch[1] : responseText.slice(0, 200);
    return { success: false, error: `InforUMobile error: ${errMsg}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `InforUMobile exception: ${msg}` };
  }
}

export async function testSmsConnection(connectionId: number): Promise<{ success: boolean; message: string }> {
  try {
    const conn = await getConnectionConfig(connectionId);
    const authConfig = conn.authConfig as Record<string, string>;
    const provider = authConfig.provider || "twilio";

    if (provider === "twilio") {
      const accountSid = authConfig.accountSid || authConfig.account_sid;
      const authToken = authConfig.authToken || authConfig.auth_token;
      if (!accountSid || !authToken) {
        return { success: false, message: "חסרים פרטי חיבור Twilio" };
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
      });
      return {
        success: response.ok,
        message: response.ok ? "חיבור Twilio תקין" : `שגיאת Twilio: ${response.status}`,
      };
    }

    return { success: true, message: `ספק ${provider} מוגדר` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "שגיאה" };
  }
}
