import { db } from "@workspace/db";
import { documentSendHistoryTable } from "@workspace/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";

export async function recordDocumentSend(data: {
  documentType: string;
  documentId?: number;
  documentTitle?: string;
  recipientType: string;
  recipientId?: number;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: "email" | "whatsapp";
  status?: string;
  messageContent?: string;
  sentBy: number;
  errorMessage?: string;
}): Promise<any> {
  const [record] = await db.insert(documentSendHistoryTable).values({
    documentType: data.documentType,
    documentId: data.documentId || null,
    documentTitle: data.documentTitle || null,
    recipientType: data.recipientType,
    recipientId: data.recipientId || null,
    recipientName: data.recipientName || null,
    recipientEmail: data.recipientEmail || null,
    recipientPhone: data.recipientPhone || null,
    channel: data.channel,
    status: data.status || "sent",
    messageContent: data.messageContent || null,
    sentBy: data.sentBy,
    errorMessage: data.errorMessage || null,
  }).returning();
  return record;
}

export async function getSendHistory(filters?: {
  documentType?: string;
  recipientType?: string;
  channel?: string;
  limit?: number;
  offset?: number;
}): Promise<{ history: any[]; total: number }> {
  const conditions: any[] = [];
  if (filters?.documentType) {
    conditions.push(eq(documentSendHistoryTable.documentType, filters.documentType));
  }
  if (filters?.recipientType) {
    conditions.push(eq(documentSendHistoryTable.recipientType, filters.recipientType));
  }
  if (filters?.channel) {
    conditions.push(eq(documentSendHistoryTable.channel, filters.channel));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const [history, countResult] = await Promise.all([
    db.select().from(documentSendHistoryTable)
      .where(whereClause)
      .orderBy(desc(documentSendHistoryTable.sentAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(documentSendHistoryTable)
      .where(whereClause),
  ]);

  return { history, total: countResult[0]?.count || 0 };
}
