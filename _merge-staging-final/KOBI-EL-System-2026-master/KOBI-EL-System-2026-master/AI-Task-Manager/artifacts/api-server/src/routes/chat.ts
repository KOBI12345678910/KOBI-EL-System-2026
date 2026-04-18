import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import {
  chatChannelsTable,
  chatChannelMembersTable,
  chatMessagesTable,
  chatDirectConversationsTable,
  chatReadReceiptsTable,
  supportTicketsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, or, desc, sql, gt, inArray, isNull } from "drizzle-orm";

const uploadsDir = path.join(process.cwd(), "uploads", "chat");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv|zip)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

const router: IRouter = Router();

function getUserId(req: Request): number | null {
  const uid = req.userId;
  if (!uid) return null;
  const num = Number(uid);
  return isNaN(num) || num === 0 ? null : num;
}

async function isChannelMember(userId: number, channelId: number): Promise<boolean> {
  const rows = await db
    .select({ id: chatChannelMembersTable.id })
    .from(chatChannelMembersTable)
    .where(
      and(
        eq(chatChannelMembersTable.channelId, channelId),
        eq(chatChannelMembersTable.userId, userId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

const sseClients = new Map<number, Set<Response>>();

function broadcastToUser(userId: number, event: string, data: unknown) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  for (const res of clients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

router.get("/chat/stream", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":\n\n");

  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);

  broadcastOnlineStatus(userId, true);

  const heartbeat = setInterval(() => res.write(":\n\n"), 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) {
      sseClients.delete(userId);
      broadcastOnlineStatus(userId, false);
    }
  });
});

function broadcastOnlineStatus(userId: number, online: boolean) {
  for (const [uid, clients] of sseClients) {
    if (uid === userId) continue;
    for (const res of clients) {
      res.write(`event: presence\ndata: ${JSON.stringify({ userId, online })}\n\n`);
    }
  }
}

router.get("/chat/online-users", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  const onlineIds = Array.from(sseClients.keys());
  res.json(onlineIds);
});

async function ensureUserChannelMemberships(userId: number) {
  const [user] = await db
    .select({ department: usersTable.department })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const defaultChannels = await db
    .select()
    .from(chatChannelsTable)
    .where(eq(chatChannelsTable.isDefault, true));

  for (const channel of defaultChannels) {
    if (channel.department && channel.department !== user?.department && channel.type !== "support") {
      continue;
    }

    const existing = await db
      .select({ id: chatChannelMembersTable.id })
      .from(chatChannelMembersTable)
      .where(
        and(
          eq(chatChannelMembersTable.channelId, channel.id),
          eq(chatChannelMembersTable.userId, userId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(chatChannelMembersTable).values({
        channelId: channel.id,
        userId,
        role: "member",
      }).onConflictDoNothing();
    }
  }
}

router.get("/chat/channels", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    await ensureUserChannelMemberships(userId);

    const memberships = await db
      .select({ channelId: chatChannelMembersTable.channelId })
      .from(chatChannelMembersTable)
      .where(eq(chatChannelMembersTable.userId, userId));

    const channelIds = memberships.map((m) => m.channelId);

    if (channelIds.length === 0) {
      return res.json([]);
    }

    const channels = await db
      .select()
      .from(chatChannelsTable)
      .where(inArray(chatChannelsTable.id, channelIds))
      .orderBy(desc(chatChannelsTable.updatedAt));

    res.json(channels);
  } catch (err) {
    console.error("Error fetching channels:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/channels/unread", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const memberships = await db
      .select({ channelId: chatChannelMembersTable.channelId })
      .from(chatChannelMembersTable)
      .where(eq(chatChannelMembersTable.userId, userId));

    const channelIds = memberships.map((m) => m.channelId);
    const unreadMap: Record<number, number> = {};

    for (const channelId of channelIds) {
      const receipt = await db
        .select()
        .from(chatReadReceiptsTable)
        .where(
          and(
            eq(chatReadReceiptsTable.userId, userId),
            eq(chatReadReceiptsTable.channelId, channelId)
          )
        );

      const lastReadId = receipt[0]?.lastReadMessageId || 0;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.channelId, channelId),
            eq(chatMessagesTable.isDeleted, false),
            eq(chatMessagesTable.isInternal, false),
            gt(chatMessagesTable.id, lastReadId),
            sql`${chatMessagesTable.senderId} != ${userId}`
          )
        );

      if (Number(count) > 0) {
        unreadMap[channelId] = Number(count);
      }
    }

    res.json(unreadMap);
  } catch (err) {
    console.error("Error fetching channel unread:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/channels", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const isManagerRole = await checkIsManagerOrAdmin(userId);
  if (!isManagerRole) {
    return res.status(403).json({ message: "Only managers or admins can create channels" });
  }

  const { name, description, type, department, memberIds } = req.body;
  if (!name) return res.status(400).json({ message: "Channel name required" });

  if (type === "support" || type === "department") {
    return res.status(403).json({ message: "Cannot create system channels" });
  }

  try {
    let validMemberIds: number[] = [];
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      const validUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(inArray(usersTable.id, memberIds.map(Number).filter(Boolean)));
      validMemberIds = validUsers.map((u) => u.id);
    }

    const [channel] = await db
      .insert(chatChannelsTable)
      .values({
        name,
        description: description || null,
        type: "group",
        department: department || null,
        createdBy: userId,
      })
      .returning();

    const allMembers = new Set<number>([userId, ...validMemberIds]);
    for (const memberId of allMembers) {
      await db.insert(chatChannelMembersTable).values({
        channelId: channel.id,
        userId: memberId,
        role: memberId === userId ? "admin" : "member",
      });
    }

    res.json(channel);
  } catch (err) {
    console.error("Error creating channel:", err);
    res.status(500).json({ message: "Server error" });
  }
});

async function checkIsManagerOrAdmin(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ isSuperAdmin: usersTable.isSuperAdmin, jobTitle: usersTable.jobTitle })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const title = (user.jobTitle || "").toLowerCase();
  return title.includes("manager") || title.includes("מנהל") || title.includes("director") || title.includes("head") || title.includes("ראש");
}

async function isChannelAdmin(userId: number, channelId: number): Promise<boolean> {
  const rows = await db
    .select({ role: chatChannelMembersTable.role })
    .from(chatChannelMembersTable)
    .where(
      and(
        eq(chatChannelMembersTable.channelId, channelId),
        eq(chatChannelMembersTable.userId, userId)
      )
    )
    .limit(1);
  return rows.length > 0 && rows[0].role === "admin";
}

router.patch("/chat/channels/:channelId", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);
  const { name, description, icon } = req.body;

  try {
    const isAdmin = await isChannelAdmin(userId, channelId);
    const isManagerRole = await checkIsManagerOrAdmin(userId);
    if (!isAdmin && !isManagerRole) {
      return res.status(403).json({ message: "Only channel admins or managers can edit channels" });
    }

    const [channel] = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.id, channelId)).limit(1);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    if (channel.type === "support" || channel.type === "department") {
      if (!isManagerRole) {
        return res.status(403).json({ message: "Only managers can edit system channels" });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;

    const [updated] = await db
      .update(chatChannelsTable)
      .set(updates)
      .where(eq(chatChannelsTable.id, channelId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("Error updating channel:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/channels/:channelId/members", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: "userIds array required" });
  }

  try {
    const isAdmin = await isChannelAdmin(userId, channelId);
    const isManagerRole = await checkIsManagerOrAdmin(userId);
    if (!isAdmin && !isManagerRole) {
      return res.status(403).json({ message: "Only channel admins or managers can add members" });
    }

    const added: number[] = [];
    for (const uid of userIds) {
      const numUid = Number(uid);
      if (!numUid) continue;
      const existing = await db
        .select({ id: chatChannelMembersTable.id })
        .from(chatChannelMembersTable)
        .where(and(eq(chatChannelMembersTable.channelId, channelId), eq(chatChannelMembersTable.userId, numUid)))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(chatChannelMembersTable).values({ channelId, userId: numUid, role: "member" });
        added.push(numUid);
      }
    }

    res.json({ added, channelId });
  } catch (err) {
    console.error("Error adding members:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/chat/channels/:channelId/members/:targetUserId", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);
  const targetUserId = Number(req.params.targetUserId);

  try {
    const isAdmin = await isChannelAdmin(userId, channelId);
    const isManagerRole = await checkIsManagerOrAdmin(userId);
    if (!isAdmin && !isManagerRole) {
      return res.status(403).json({ message: "Only channel admins or managers can remove members" });
    }

    await db
      .delete(chatChannelMembersTable)
      .where(and(eq(chatChannelMembersTable.channelId, channelId), eq(chatChannelMembersTable.userId, targetUserId)));

    res.json({ removed: targetUserId, channelId });
  } catch (err) {
    console.error("Error removing member:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/chat/channels/:channelId", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  try {
    const isManagerRole = await checkIsManagerOrAdmin(userId);
    if (!isManagerRole) {
      return res.status(403).json({ message: "Only managers can delete channels" });
    }

    const [channel] = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.id, channelId)).limit(1);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    if (channel.type === "support") {
      return res.status(403).json({ message: "Cannot delete system support channel" });
    }

    await db.delete(chatChannelsTable).where(eq(chatChannelsTable.id, channelId));

    res.json({ deleted: channelId });
  } catch (err) {
    console.error("Error deleting channel:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/me/role", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const [user] = await db
      .select({
        isSuperAdmin: usersTable.isSuperAdmin,
        jobTitle: usersTable.jobTitle,
        department: usersTable.department,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) return res.status(404).json({ message: "User not found" });

    const isManager = await checkIsManagerOrAdmin(userId);
    const isSupportAgent = await checkIsSupportAgent(userId);

    res.json({
      isSuperAdmin: user.isSuperAdmin,
      isManager,
      isSupportAgent,
    });
  } catch (err) {
    console.error("Error fetching role:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/channels/:channelId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  const before = req.query.before ? Number(req.query.before) : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const messageType = req.query.type ? String(req.query.type) : undefined;

  try {
    const conditions: ReturnType<typeof eq>[] = [
      eq(chatMessagesTable.channelId, channelId),
      eq(chatMessagesTable.isDeleted, false),
    ];

    const [channel] = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.id, channelId)).limit(1);
    const isSupport = channel?.type === "support";
    const isSupportAgent = await checkIsSupportAgent(userId);

    if (isSupport && !isSupportAgent) {
      conditions.push(eq(chatMessagesTable.isInternal, false));
    }

    if (before) {
      conditions.push(sql`${chatMessagesTable.id} < ${before}`);
    }
    if (messageType) {
      conditions.push(eq(chatMessagesTable.messageType, messageType));
    }

    const messages = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        senderId: chatMessagesTable.senderId,
        content: chatMessagesTable.content,
        messageType: chatMessagesTable.messageType,
        attachments: chatMessagesTable.attachments,
        metadata: chatMessagesTable.metadata,
        isPinned: chatMessagesTable.isPinned,
        isInternal: chatMessagesTable.isInternal,
        isEdited: chatMessagesTable.isEdited,
        createdAt: chatMessagesTable.createdAt,
        senderName: usersTable.fullName,
        senderNameHe: usersTable.fullNameHe,
        senderAvatar: usersTable.avatarUrl,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(chatMessagesTable.id))
      .limit(limit);

    res.json(messages.reverse());
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/channels/:channelId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { content, messageType, attachments, metadata, isInternal } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

  const [channel] = await db.select({ type: chatChannelsTable.type }).from(chatChannelsTable).where(eq(chatChannelsTable.id, channelId)).limit(1);
  const isChannelSupport = channel?.type === "support";
  const isSupportAgent = await checkIsSupportAgent(userId);
  const canSendInternal = isSupportAgent && isInternal && isChannelSupport;

  try {
    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        channelId,
        senderId: userId,
        content: content.trim(),
        messageType: messageType || "text",
        attachments: attachments || null,
        metadata: metadata || null,
        isInternal: canSendInternal ? true : false,
      })
      .returning();

    await db
      .update(chatChannelsTable)
      .set({ updatedAt: new Date() })
      .where(eq(chatChannelsTable.id, channelId));

    const [sender] = await db
      .select({
        fullName: usersTable.fullName,
        fullNameHe: usersTable.fullNameHe,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const fullMessage = {
      ...message,
      senderName: sender?.fullName,
      senderNameHe: sender?.fullNameHe,
      senderAvatar: sender?.avatarUrl,
    };

    const members = await db
      .select({ userId: chatChannelMembersTable.userId })
      .from(chatChannelMembersTable)
      .where(eq(chatChannelMembersTable.channelId, channelId));

    for (const member of members) {
      if (canSendInternal) {
        const memberIsSupportAgent = await checkIsSupportAgent(member.userId);
        if (!memberIsSupportAgent) continue;
      }
      broadcastToUser(member.userId, "new_message", fullMessage);
    }

    res.json(fullMessage);
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/channels/:channelId/messages/:messageId/pin", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const [msg] = await db
      .select({ isPinned: chatMessagesTable.isPinned })
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.id, messageId), eq(chatMessagesTable.channelId, channelId)))
      .limit(1);

    if (!msg) return res.status(404).json({ message: "Message not found" });

    await db
      .update(chatMessagesTable)
      .set({ isPinned: !msg.isPinned })
      .where(eq(chatMessagesTable.id, messageId));

    res.json({ ok: true, isPinned: !msg.isPinned });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/channels/:channelId/pinned", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const messages = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        senderId: chatMessagesTable.senderId,
        content: chatMessagesTable.content,
        messageType: chatMessagesTable.messageType,
        metadata: chatMessagesTable.metadata,
        isPinned: chatMessagesTable.isPinned,
        createdAt: chatMessagesTable.createdAt,
        senderName: usersTable.fullName,
        senderNameHe: usersTable.fullNameHe,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(
        and(
          eq(chatMessagesTable.channelId, channelId),
          eq(chatMessagesTable.isPinned, true),
          eq(chatMessagesTable.isDeleted, false)
        )
      )
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(10);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/dm", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const conversations = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(
        or(
          eq(chatDirectConversationsTable.user1Id, userId),
          eq(chatDirectConversationsTable.user2Id, userId)
        )
      )
      .orderBy(desc(chatDirectConversationsTable.lastMessageAt));

    const otherUserIds = conversations.map((c) =>
      c.user1Id === userId ? c.user2Id : c.user1Id
    );

    let users: { id: number; fullName: string; fullNameHe: string | null; avatarUrl: string | null; department: string | null }[] = [];
    if (otherUserIds.length > 0) {
      users = await db
        .select({
          id: usersTable.id,
          fullName: usersTable.fullName,
          fullNameHe: usersTable.fullNameHe,
          avatarUrl: usersTable.avatarUrl,
          department: usersTable.department,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, otherUserIds));
    }

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = conversations.map((c) => {
      const otherId = c.user1Id === userId ? c.user2Id : c.user1Id;
      const otherUser = userMap.get(otherId);
      return {
        ...c,
        otherUser: otherUser || null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching DMs:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/dm/unread", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const dmConversations = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(
        or(
          eq(chatDirectConversationsTable.user1Id, userId),
          eq(chatDirectConversationsTable.user2Id, userId)
        )
      );

    const unreadMap: Record<number, number> = {};

    for (const conv of dmConversations) {
      const receipt = await db
        .select()
        .from(chatReadReceiptsTable)
        .where(
          and(
            eq(chatReadReceiptsTable.userId, userId),
            eq(chatReadReceiptsTable.directConversationId, conv.id)
          )
        );

      const lastReadId = receipt[0]?.lastReadMessageId || 0;
      const otherId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessagesTable)
        .where(
          and(
            isNull(chatMessagesTable.channelId),
            eq(chatMessagesTable.senderId, otherId),
            eq(chatMessagesTable.recipientId, userId),
            eq(chatMessagesTable.isDeleted, false),
            gt(chatMessagesTable.id, lastReadId)
          )
        );

      if (Number(count) > 0) {
        unreadMap[conv.id] = Number(count);
      }
    }

    res.json(unreadMap);
  } catch (err) {
    console.error("Error fetching DM unread:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/dm", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ message: "Target user required" });

  const u1 = Math.min(userId, targetUserId);
  const u2 = Math.max(userId, targetUserId);

  try {
    const existing = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(
        and(
          eq(chatDirectConversationsTable.user1Id, u1),
          eq(chatDirectConversationsTable.user2Id, u2)
        )
      );

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    const [conversation] = await db
      .insert(chatDirectConversationsTable)
      .values({ user1Id: u1, user2Id: u2 })
      .returning();

    res.json(conversation);
  } catch (err) {
    console.error("Error creating DM:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/dm/:conversationId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const conversationId = Number(req.params.conversationId);
  const before = req.query.before ? Number(req.query.before) : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  try {
    const [conv] = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(eq(chatDirectConversationsTable.id, conversationId));

    if (!conv || (conv.user1Id !== userId && conv.user2Id !== userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const conditions = [
      isNull(chatMessagesTable.channelId),
      eq(chatMessagesTable.isDeleted, false),
      or(
        and(
          eq(chatMessagesTable.senderId, conv.user1Id),
          eq(chatMessagesTable.recipientId, conv.user2Id)
        ),
        and(
          eq(chatMessagesTable.senderId, conv.user2Id),
          eq(chatMessagesTable.recipientId, conv.user1Id)
        )
      ),
    ];
    if (before) {
      conditions.push(sql`${chatMessagesTable.id} < ${before}`);
    }

    const messages = await db
      .select({
        id: chatMessagesTable.id,
        senderId: chatMessagesTable.senderId,
        recipientId: chatMessagesTable.recipientId,
        content: chatMessagesTable.content,
        messageType: chatMessagesTable.messageType,
        attachments: chatMessagesTable.attachments,
        metadata: chatMessagesTable.metadata,
        isEdited: chatMessagesTable.isEdited,
        createdAt: chatMessagesTable.createdAt,
        senderName: usersTable.fullName,
        senderNameHe: usersTable.fullNameHe,
        senderAvatar: usersTable.avatarUrl,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(chatMessagesTable.id))
      .limit(limit);

    res.json(messages.reverse());
  } catch (err) {
    console.error("Error fetching DM messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/dm/:conversationId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const conversationId = Number(req.params.conversationId);
  const { content, messageType, attachments, metadata } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: "Message content required" });

  try {
    const [conv] = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(eq(chatDirectConversationsTable.id, conversationId));

    if (!conv || (conv.user1Id !== userId && conv.user2Id !== userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const recipientId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        senderId: userId,
        recipientId,
        content: content.trim(),
        messageType: messageType || "text",
        attachments: attachments || null,
        metadata: metadata || null,
      })
      .returning();

    await db
      .update(chatDirectConversationsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatDirectConversationsTable.id, conversationId));

    const [sender] = await db
      .select({
        fullName: usersTable.fullName,
        fullNameHe: usersTable.fullNameHe,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const fullMessage = {
      ...message,
      conversationId,
      senderName: sender?.fullName,
      senderNameHe: sender?.fullNameHe,
      senderAvatar: sender?.avatarUrl,
    };

    broadcastToUser(recipientId, "new_dm", fullMessage);
    broadcastToUser(userId, "new_dm", fullMessage);

    res.json(fullMessage);
  } catch (err) {
    console.error("Error sending DM:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/channels/:channelId/read", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { messageId } = req.body;

  try {
    if (messageId) {
      const [msg] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.id, messageId), eq(chatMessagesTable.channelId, channelId)))
        .limit(1);
      if (!msg) return res.status(400).json({ message: "Invalid message ID for this channel" });
    }

    const existing = await db
      .select()
      .from(chatReadReceiptsTable)
      .where(
        and(
          eq(chatReadReceiptsTable.userId, userId),
          eq(chatReadReceiptsTable.channelId, channelId)
        )
      );

    if (existing.length > 0) {
      await db
        .update(chatReadReceiptsTable)
        .set({ lastReadMessageId: messageId, lastReadAt: new Date() })
        .where(eq(chatReadReceiptsTable.id, existing[0].id));
    } else {
      await db.insert(chatReadReceiptsTable).values({
        userId,
        channelId,
        lastReadMessageId: messageId,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking read:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/dm/:conversationId/read", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const conversationId = Number(req.params.conversationId);
  const { messageId } = req.body;

  try {
    const [conv] = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(eq(chatDirectConversationsTable.id, conversationId));

    if (!conv || (conv.user1Id !== userId && conv.user2Id !== userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (messageId) {
      const otherId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
      const [msg] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.id, messageId),
            sql`${chatMessagesTable.channelId} IS NULL`,
            sql`(
              (${chatMessagesTable.senderId} = ${userId} AND ${chatMessagesTable.recipientId} = ${otherId})
              OR (${chatMessagesTable.senderId} = ${otherId} AND ${chatMessagesTable.recipientId} = ${userId})
            )`
          )
        )
        .limit(1);
      if (!msg) return res.status(400).json({ message: "Invalid message ID for this conversation" });
    }

    const existing = await db
      .select()
      .from(chatReadReceiptsTable)
      .where(
        and(
          eq(chatReadReceiptsTable.userId, userId),
          eq(chatReadReceiptsTable.directConversationId, conversationId)
        )
      );

    if (existing.length > 0) {
      await db
        .update(chatReadReceiptsTable)
        .set({ lastReadMessageId: messageId, lastReadAt: new Date() })
        .where(eq(chatReadReceiptsTable.id, existing[0].id));
    } else {
      await db.insert(chatReadReceiptsTable).values({
        userId,
        directConversationId: conversationId,
        lastReadMessageId: messageId,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking read:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/unread-counts", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const memberships = await db
      .select({ channelId: chatChannelMembersTable.channelId })
      .from(chatChannelMembersTable)
      .where(eq(chatChannelMembersTable.userId, userId));

    const channelIds = memberships.map((m) => m.channelId);
    let totalUnread = 0;

    for (const channelId of channelIds) {
      const receipt = await db
        .select()
        .from(chatReadReceiptsTable)
        .where(
          and(
            eq(chatReadReceiptsTable.userId, userId),
            eq(chatReadReceiptsTable.channelId, channelId)
          )
        );

      const lastReadId = receipt[0]?.lastReadMessageId || 0;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessagesTable)
        .where(
          and(
            eq(chatMessagesTable.channelId, channelId),
            eq(chatMessagesTable.isDeleted, false),
            eq(chatMessagesTable.isInternal, false),
            gt(chatMessagesTable.id, lastReadId),
            sql`${chatMessagesTable.senderId} != ${userId}`
          )
        );

      totalUnread += Number(count);
    }

    const dmConversations = await db
      .select()
      .from(chatDirectConversationsTable)
      .where(
        or(
          eq(chatDirectConversationsTable.user1Id, userId),
          eq(chatDirectConversationsTable.user2Id, userId)
        )
      );

    for (const conv of dmConversations) {
      const receipt = await db
        .select()
        .from(chatReadReceiptsTable)
        .where(
          and(
            eq(chatReadReceiptsTable.userId, userId),
            eq(chatReadReceiptsTable.directConversationId, conv.id)
          )
        );

      const lastReadId = receipt[0]?.lastReadMessageId || 0;
      const otherId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessagesTable)
        .where(
          and(
            isNull(chatMessagesTable.channelId),
            eq(chatMessagesTable.senderId, otherId),
            eq(chatMessagesTable.recipientId, userId),
            eq(chatMessagesTable.isDeleted, false),
            gt(chatMessagesTable.id, lastReadId)
          )
        );

      totalUnread += Number(count);
    }

    res.json({ totalUnread });
    return;
  } catch (err) {
    console.error("Error counting unread:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
    return;
  }
});

router.get("/chat/users", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        fullName: usersTable.fullName,
        fullNameHe: usersTable.fullNameHe,
        department: usersTable.department,
        jobTitle: usersTable.jobTitle,
        avatarUrl: usersTable.avatarUrl,
        isActive: usersTable.isActive,
      })
      .from(usersTable)
      .where(eq(usersTable.isActive, true))
      .orderBy(usersTable.fullName);

    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/messages/search", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const query = String(req.query.q || "");
  if (!query.trim()) return res.json([]);

  try {
    const memberships = await db
      .select({ channelId: chatChannelMembersTable.channelId })
      .from(chatChannelMembersTable)
      .where(eq(chatChannelMembersTable.userId, userId));

    const channelIds = memberships.map((m) => m.channelId);

    const term = `%${query}%`;
    const scopeConditions = [];

    if (channelIds.length > 0) {
      scopeConditions.push(inArray(chatMessagesTable.channelId, channelIds));
    }
    scopeConditions.push(
      and(
        isNull(chatMessagesTable.channelId),
        or(
          eq(chatMessagesTable.senderId, userId),
          eq(chatMessagesTable.recipientId, userId)
        )
      )
    );

    const results = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        senderId: chatMessagesTable.senderId,
        content: chatMessagesTable.content,
        createdAt: chatMessagesTable.createdAt,
        senderName: usersTable.fullName,
        senderNameHe: usersTable.fullNameHe,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(
        and(
          eq(chatMessagesTable.isDeleted, false),
          sql`${chatMessagesTable.content} ILIKE ${term}`,
          or(...scopeConditions)
        )
      )
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(30);

    res.json(results);
  } catch (err) {
    console.error("Error searching messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/channels/:channelId/members", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const members = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        fullNameHe: usersTable.fullNameHe,
        avatarUrl: usersTable.avatarUrl,
        department: usersTable.department,
        role: chatChannelMembersTable.role,
      })
      .from(chatChannelMembersTable)
      .innerJoin(usersTable, eq(chatChannelMembersTable.userId, usersTable.id))
      .where(eq(chatChannelMembersTable.channelId, channelId));

    res.json(members);
  } catch (err) {
    console.error("Error fetching members:", err);
    res.status(500).json({ message: "Server error" });
  }
});

async function checkIsSupportAgent(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ jobTitle: usersTable.jobTitle, department: usersTable.department })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return false;
  const dept = (user.department || "").toLowerCase();
  const title = (user.jobTitle || "").toLowerCase();
  return dept === "it" || dept === "תמיכה" || title.includes("תמיכה") || title.includes("support") || title.includes("helpdesk");
}

router.get("/chat/support/tickets", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  try {
    const isSupportAgent = await checkIsSupportAgent(userId);
    const [user] = await db.select({ isSuperAdmin: usersTable.isSuperAdmin }).from(usersTable).where(eq(usersTable.id, userId));

    let tickets;
    if (isSupportAgent || user?.isSuperAdmin) {
      tickets = await db
        .select({
          id: supportTicketsTable.id,
          ticketNumber: supportTicketsTable.ticketNumber,
          subject: supportTicketsTable.subject,
          description: supportTicketsTable.description,
          status: supportTicketsTable.status,
          priority: supportTicketsTable.priority,
          createdAt: supportTicketsTable.createdAt,
          updatedAt: supportTicketsTable.updatedAt,
          resolvedAt: supportTicketsTable.resolvedAt,
          createdByName: usersTable.fullNameHe,
          createdById: supportTicketsTable.createdBy,
          assignedTo: supportTicketsTable.assignedTo,
          channelId: supportTicketsTable.channelId,
        })
        .from(supportTicketsTable)
        .innerJoin(usersTable, eq(supportTicketsTable.createdBy, usersTable.id))
        .orderBy(desc(supportTicketsTable.createdAt));
    } else {
      tickets = await db
        .select({
          id: supportTicketsTable.id,
          ticketNumber: supportTicketsTable.ticketNumber,
          subject: supportTicketsTable.subject,
          description: supportTicketsTable.description,
          status: supportTicketsTable.status,
          priority: supportTicketsTable.priority,
          createdAt: supportTicketsTable.createdAt,
          updatedAt: supportTicketsTable.updatedAt,
          resolvedAt: supportTicketsTable.resolvedAt,
          createdByName: usersTable.fullNameHe,
          createdById: supportTicketsTable.createdBy,
          assignedTo: supportTicketsTable.assignedTo,
          channelId: supportTicketsTable.channelId,
        })
        .from(supportTicketsTable)
        .innerJoin(usersTable, eq(supportTicketsTable.createdBy, usersTable.id))
        .where(eq(supportTicketsTable.createdBy, userId))
        .orderBy(desc(supportTicketsTable.createdAt));
    }

    res.json(tickets);
  } catch (err) {
    console.error("Error fetching tickets:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/support/tickets", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { subject, description, priority } = req.body;
  if (!subject?.trim() || !description?.trim()) {
    return res.status(400).json({ message: "Subject and description required" });
  }

  try {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(supportTicketsTable);
    const ticketNum = `TKT-${String(Number(countResult[0].count) + 1).padStart(4, "0")}`;

    const supportChannel = await db
      .select()
      .from(chatChannelsTable)
      .where(eq(chatChannelsTable.type, "support"))
      .limit(1);

    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        ticketNumber: ticketNum,
        subject: subject.trim(),
        description: description.trim(),
        priority: priority || "medium",
        createdBy: userId,
        channelId: supportChannel[0]?.id || null,
      })
      .returning();

    if (supportChannel[0]) {
      const [user] = await db.select({ fullNameHe: usersTable.fullNameHe, fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, userId));
      const priorityLabel = { low: "נמוכה", medium: "בינונית", high: "גבוהה", urgent: "דחוף" }[priority as string] || "בינונית";

      await db.insert(chatMessagesTable).values({
        channelId: supportChannel[0].id,
        senderId: userId,
        content: `פנייה חדשה: ${subject}`,
        messageType: "support_ticket",
        metadata: {
          ticketId: ticket.id,
          ticketNumber: ticketNum,
          subject: subject.trim(),
          description: description.trim(),
          priority: priority || "medium",
          priorityLabel,
          status: "open",
          createdByName: user?.fullNameHe || user?.fullName || "עובד",
        },
      });

      await db.update(chatChannelsTable).set({ updatedAt: new Date() }).where(eq(chatChannelsTable.id, supportChannel[0].id));

      const members = await db
        .select({ userId: chatChannelMembersTable.userId })
        .from(chatChannelMembersTable)
        .where(eq(chatChannelMembersTable.channelId, supportChannel[0].id));

      for (const member of members) {
        broadcastToUser(member.userId, "new_message", { channelId: supportChannel[0].id, type: "support_ticket" });
      }
    }

    res.json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/chat/support/tickets/:ticketId", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const ticketId = Number(req.params.ticketId);
  const { status, assignedTo, priority } = req.body;

  try {
    const isSupportAgent = await checkIsSupportAgent(userId);
    const [user] = await db.select({ isSuperAdmin: usersTable.isSuperAdmin }).from(usersTable).where(eq(usersTable.id, userId));

    if (!isSupportAgent && !user?.isSuperAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      if (status === "resolved" || status === "closed") {
        updates.resolvedAt = new Date();
      }
    }
    if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;
    if (priority) updates.priority = priority;

    await db.update(supportTicketsTable).set(updates).where(eq(supportTicketsTable.id, ticketId));

    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
    res.json(ticket);
  } catch (err) {
    console.error("Error updating ticket:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/chat/support/tickets/:ticketId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const ticketId = Number(req.params.ticketId);

  try {
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const isSupportAgent = await checkIsSupportAgent(userId);
    const [userRow] = await db.select({ isSuperAdmin: usersTable.isSuperAdmin }).from(usersTable).where(eq(usersTable.id, userId));

    const isOwner = ticket.createdBy === userId;
    if (!isOwner && !isSupportAgent && !userRow?.isSuperAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!ticket.channelId) {
      return res.json([]);
    }

    const conditions: ReturnType<typeof eq>[] = [
      eq(chatMessagesTable.channelId, ticket.channelId),
      eq(chatMessagesTable.isDeleted, false),
      sql`${chatMessagesTable.metadata}->>'ticketId' = ${String(ticketId)}` as ReturnType<typeof eq>,
    ];

    if (!isSupportAgent && !userRow?.isSuperAdmin) {
      conditions.push(eq(chatMessagesTable.isInternal, false));
    }

    const msgs = await db
      .select({
        id: chatMessagesTable.id,
        channelId: chatMessagesTable.channelId,
        senderId: chatMessagesTable.senderId,
        content: chatMessagesTable.content,
        messageType: chatMessagesTable.messageType,
        metadata: chatMessagesTable.metadata,
        attachments: chatMessagesTable.attachments,
        isPinned: chatMessagesTable.isPinned,
        isInternal: chatMessagesTable.isInternal,
        isEdited: chatMessagesTable.isEdited,
        createdAt: chatMessagesTable.createdAt,
        senderName: usersTable.fullName,
        senderNameHe: usersTable.fullNameHe,
        senderAvatar: usersTable.avatarUrl,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(and(...conditions))
      .orderBy(chatMessagesTable.id)
      .limit(200);

    return res.json(msgs);
  } catch (err) {
    console.error("Error fetching ticket messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/chat/support/tickets/:ticketId/messages", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const ticketId = Number(req.params.ticketId);

  try {
    const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId)).limit(1);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const isSupportAgent = await checkIsSupportAgent(userId);
    const [userRow] = await db.select({ isSuperAdmin: usersTable.isSuperAdmin }).from(usersTable).where(eq(usersTable.id, userId));

    const isOwner = ticket.createdBy === userId;
    if (!isOwner && !isSupportAgent && !userRow?.isSuperAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { content, isInternal } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Content required" });

    const canSendInternal = (isSupportAgent || userRow?.isSuperAdmin) && isInternal;

    if (!ticket.channelId) {
      return res.status(400).json({ message: "Ticket has no linked channel" });
    }

    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        channelId: ticket.channelId,
        senderId: userId,
        content: content.trim(),
        messageType: "text",
        isInternal: canSendInternal ? true : false,
        metadata: { ticketId },
      })
      .returning();

    const [sender] = await db
      .select({ fullName: usersTable.fullName, fullNameHe: usersTable.fullNameHe, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const fullMessage = { ...message, senderName: sender?.fullName, senderNameHe: sender?.fullNameHe, senderAvatar: sender?.avatarUrl };

    const authorizedUserIds = new Set<number>();
    authorizedUserIds.add(ticket.createdBy);
    if (ticket.assignedTo) authorizedUserIds.add(ticket.assignedTo);

    const supportAgents = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
          or(
            sql`lower(${usersTable.department}) = 'it'`,
            sql`lower(${usersTable.department}) = 'תמיכה'`,
            eq(usersTable.isSuperAdmin, true)
          )
        )
      );
    for (const agent of supportAgents) authorizedUserIds.add(agent.id);

    for (const targetUserId of authorizedUserIds) {
      if (canSendInternal && targetUserId === ticket.createdBy) {
        continue;
      }
      broadcastToUser(targetUserId, "new_message", { ...fullMessage, ticketId });
    }

    res.json(fullMessage);
  } catch (err) {
    console.error("Error sending ticket message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/chat/channels/:channelId/messages/:messageId/metadata", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const channelId = Number(req.params.channelId);
  const messageId = Number(req.params.messageId);

  if (!(await isChannelMember(userId, channelId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { metadata } = req.body;
  if (!metadata) return res.status(400).json({ message: "metadata required" });

  try {
    const [msg] = await db.select({ senderId: chatMessagesTable.senderId }).from(chatMessagesTable).where(eq(chatMessagesTable.id, messageId)).limit(1);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    const [updated] = await db
      .update(chatMessagesTable)
      .set({ metadata, isEdited: true, updatedAt: new Date() })
      .where(and(eq(chatMessagesTable.id, messageId), eq(chatMessagesTable.channelId, channelId)))
      .returning();

    const members = await db.select({ userId: chatChannelMembersTable.userId }).from(chatChannelMembersTable).where(eq(chatChannelMembersTable.channelId, channelId));
    for (const member of members) {
      broadcastToUser(member.userId, "message_updated", { messageId, channelId, metadata });
    }

    res.json(updated);
  } catch (err) {
    console.error("Error updating message metadata:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.use("/chat/uploads", (req, res, next) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  next();
}, express.static(uploadsDir));

router.post("/chat/upload", upload.single("file"), (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const file = req.file;
  if (!file) return res.status(400).json({ message: "No file uploaded" });

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname);

  res.json({
    url: `/api/chat/uploads/${file.filename}`,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    isImage,
  });
});

export async function seedDefaultChannels() {
  try {
    const existing = await db.select().from(chatChannelsTable).where(eq(chatChannelsTable.isDefault, true));
    if (existing.length > 0) {
      const departmentChannels = [
        { name: "ייצור", department: "ייצור", icon: "Factory" },
        { name: "לוגיסטיקה", department: "לוגיסטיקה", icon: "Truck" },
        { name: "הנהלה", department: "הנהלה", icon: "Building2" },
        { name: "שיווק", department: "שיווק", icon: "Megaphone" },
        { name: "הנדסה", department: "הנדסה", icon: "Cpu" },
        { name: "IT", department: "IT", icon: "Server" },
        { name: "שירות", department: "שירות", icon: "Headphones" },
      ];
      for (const ch of departmentChannels) {
        const alreadyExists = existing.some((e) => e.department === ch.department);
        if (!alreadyExists) {
          const [channel] = await db.insert(chatChannelsTable).values({
            name: ch.name,
            description: `ערוץ מחלקת ${ch.name}`,
            type: "department",
            department: ch.department,
            icon: ch.icon,
            isDefault: true,
          }).returning();

          const users = await db.select({ id: usersTable.id, department: usersTable.department }).from(usersTable).where(eq(usersTable.isActive, true));
          for (const user of users) {
            if (user.department === ch.department) {
              await db.insert(chatChannelMembersTable).values({
                channelId: channel.id,
                userId: user.id,
                role: "member",
              }).onConflictDoNothing();
            }
          }
        }
      }
      return;
    }

    const defaultChannels = [
      { name: "כללי", description: "ערוץ כללי לכל העובדים", type: "group", isDefault: true, icon: "Hash" },
      { name: "תמיכה ושירות", description: "פניות תמיכה ועזרה", type: "support", isDefault: true, icon: "Headphones" },
      { name: "מכירות", description: "ערוץ מחלקת מכירות", type: "department", department: "מכירות", isDefault: true, icon: "TrendingUp" },
      { name: "כספים", description: "ערוץ מחלקת כספים", type: "department", department: "כספים", isDefault: true, icon: "DollarSign" },
      { name: "משאבי אנוש", description: "ערוץ משאבי אנוש", type: "department", department: "משאבי אנוש", isDefault: true, icon: "Users" },
      { name: "ייצור", description: "ערוץ מחלקת ייצור", type: "department", department: "ייצור", isDefault: true, icon: "Factory" },
      { name: "לוגיסטיקה", description: "ערוץ מחלקת לוגיסטיקה", type: "department", department: "לוגיסטיקה", isDefault: true, icon: "Truck" },
      { name: "הנהלה", description: "ערוץ ההנהלה", type: "department", department: "הנהלה", isDefault: true, icon: "Building2" },
      { name: "שיווק", description: "ערוץ מחלקת שיווק", type: "department", department: "שיווק", isDefault: true, icon: "Megaphone" },
      { name: "הנדסה", description: "ערוץ מחלקת הנדסה", type: "department", department: "הנדסה", isDefault: true, icon: "Cpu" },
      { name: "IT", description: "ערוץ מחלקת IT", type: "department", department: "IT", isDefault: true, icon: "Server" },
      { name: "שירות", description: "ערוץ שירות לקוחות", type: "department", department: "שירות", isDefault: true, icon: "Headphones" },
    ];

    for (const ch of defaultChannels) {
      const [channel] = await db.insert(chatChannelsTable).values(ch).returning();

      const users = await db.select({ id: usersTable.id, department: usersTable.department }).from(usersTable).where(eq(usersTable.isActive, true));

      for (const user of users) {
        if (ch.department && user.department !== ch.department && ch.type !== "support") {
          if (ch.name !== "כללי" && ch.name !== "תמיכה ושירות") continue;
        }
        await db.insert(chatChannelMembersTable).values({
          channelId: channel.id,
          userId: user.id,
          role: "member",
        }).onConflictDoNothing();
      }
    }

    console.log("[Chat] Default channels seeded");
  } catch (err) {
    console.error("[Chat] Seed error:", err);
  }
}

export default router;
