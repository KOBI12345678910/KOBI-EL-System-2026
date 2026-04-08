import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  X,
  Send,
  Hash,
  Users,
  Headphones,
  Search,
  Plus,
  ChevronRight,
  Paperclip,
  Circle,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch, authJson } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type ChatView = "list" | "channel" | "dm" | "new-dm" | "new-channel";

interface Channel {
  id: number;
  name: string;
  description: string | null;
  type: string;
  department: string | null;
  isDefault: boolean;
}

interface DMConversation {
  id: number;
  user1Id: number;
  user2Id: number;
  lastMessageAt: string | null;
  otherUser: {
    id: number;
    fullName: string;
    fullNameHe: string | null;
    avatarUrl: string | null;
    department: string | null;
  } | null;
}

interface ChatMessage {
  id: number;
  channelId?: number;
  senderId: number;
  recipientId?: number;
  content: string;
  messageType: string;
  attachments: unknown;
  isEdited: boolean;
  createdAt: string;
  senderName: string;
  senderNameHe: string | null;
  senderAvatar: string | null;
  conversationId?: number;
}

interface ChatUser {
  id: number;
  username: string;
  fullName: string;
  fullNameHe: string | null;
  department: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export function ChatPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ChatView>("list");
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [activeDMId, setActiveDMId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = user ? Number((user as Record<string, unknown>).id) : 0;

  useEffect(() => {
    if (!isOpen || !token) return;

    const es = new EventSource(`${API_BASE}/chat/stream?token=${token}`);
    eventSourceRef.current = es;

    es.addEventListener("new_message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.channelId) {
        queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.channelId] });
        queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      }
      queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
    });

    es.addEventListener("new_dm", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.conversationId) {
        queryClient.invalidateQueries({ queryKey: ["chat-dm-messages", msg.conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["chat-dm-list"] });
      queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
    });

    es.addEventListener("presence", (e) => {
      const data = JSON.parse(e.data);
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    });

    authFetch(`${API_BASE}/chat/online-users`)
      .then((r) => r.json())
      .then((ids: number[]) => setOnlineUsers(new Set(ids)))
      .catch(() => {});

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isOpen, token, queryClient]);

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["chat-channels"],
    queryFn: () => authJson(`${API_BASE}/chat/channels`),
    enabled: isOpen,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: dmList = [] } = useQuery<DMConversation[]>({
    queryKey: ["chat-dm-list"],
    queryFn: () => authJson(`${API_BASE}/chat/dm`),
    enabled: isOpen,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: channelMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", activeChannelId],
    queryFn: () => authJson(`${API_BASE}/chat/channels/${activeChannelId}/messages`),
    enabled: !!activeChannelId && view === "channel",
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: dmMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-dm-messages", activeDMId],
    queryFn: () => authJson(`${API_BASE}/chat/dm/${activeDMId}/messages`),
    enabled: !!activeDMId && view === "dm",
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ["chat-users"],
    queryFn: () => authJson(`${API_BASE}/chat/users`),
    enabled: isOpen,
    staleTime: 60000,
  });

  const { data: searchResults = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-search", searchQuery],
    queryFn: () => authJson(`${API_BASE}/chat/messages/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.length > 2,
  });

  const sendChannelMessage = useMutation({
    mutationFn: (content: string) =>
      authJson(`${API_BASE}/chat/channels/${activeChannelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
      setMessageText("");
    },
  });

  const sendDMMessage = useMutation({
    mutationFn: (content: string) =>
      authJson(`${API_BASE}/chat/dm/${activeDMId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-dm-messages", activeDMId] });
      setMessageText("");
    },
  });

  const startDM = useMutation({
    mutationFn: (targetUserId: number) =>
      authJson(`${API_BASE}/chat/dm`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      }),
    onSuccess: (data: DMConversation) => {
      setActiveDMId(data.id);
      setView("dm");
      queryClient.invalidateQueries({ queryKey: ["chat-dm-list"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, dmMessages]);

  const handleSend = useCallback(() => {
    if (!messageText.trim()) return;
    if (view === "channel" && activeChannelId) {
      sendChannelMessage.mutate(messageText);
    } else if (view === "dm" && activeDMId) {
      sendDMMessage.mutate(messageText);
    }
  }, [messageText, view, activeChannelId, activeDMId, sendChannelMessage, sendDMMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch(`${API_BASE}/chat/upload`, {
        method: "POST",
        body: formData,
        headers: {},
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      const attachmentInfo = {
        url: data.url,
        originalName: data.originalName,
        size: data.size,
        mimeType: data.mimeType,
        isImage: data.isImage,
      };

      const content = data.isImage
        ? `📎 ${data.originalName}`
        : `📄 ${data.originalName}`;

      if (view === "channel" && activeChannelId) {
        await authJson(`${API_BASE}/chat/channels/${activeChannelId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content,
            messageType: data.isImage ? "image" : "file",
            attachments: [attachmentInfo],
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
      } else if (view === "dm" && activeDMId) {
        await authJson(`${API_BASE}/chat/dm/${activeDMId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content,
            messageType: data.isImage ? "image" : "file",
            attachments: [attachmentInfo],
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["chat-dm-messages", activeDMId] });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const markChannelRead = useCallback((channelId: number, msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    const lastId = msgs[msgs.length - 1].id;
    authFetch(`${API_BASE}/chat/channels/${channelId}/read`, {
      method: "POST",
      body: JSON.stringify({ messageId: lastId }),
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
  }, [queryClient]);

  const markDMRead = useCallback((convId: number, msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    const lastId = msgs[msgs.length - 1].id;
    authFetch(`${API_BASE}/chat/dm/${convId}/read`, {
      method: "POST",
      body: JSON.stringify({ messageId: lastId }),
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
  }, [queryClient]);

  useEffect(() => {
    if (view === "channel" && activeChannelId && channelMessages.length > 0) {
      markChannelRead(activeChannelId, channelMessages);
    }
  }, [view, activeChannelId, channelMessages, markChannelRead]);

  useEffect(() => {
    if (view === "dm" && activeDMId && dmMessages.length > 0) {
      markDMRead(activeDMId, dmMessages);
    }
  }, [view, activeDMId, dmMessages, markDMRead]);

  const openChannel = (channelId: number) => {
    setActiveChannelId(channelId);
    setView("channel");
  };

  const openDM = (convId: number) => {
    setActiveDMId(convId);
    setView("dm");
  };

  const goBack = () => {
    setView("list");
    setActiveChannelId(null);
    setActiveDMId(null);
    setSearchQuery("");
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDM = dmList.find((d) => d.id === activeDMId);
  const messages = view === "channel" ? channelMessages : dmMessages;

  const getChannelIcon = (type: string) => {
    if (type === "support") return <Headphones className="w-4 h-4 text-green-400" />;
    return <Hash className="w-4 h-4 text-blue-400" />;
  };

  const getInitial = (name: string) => name?.charAt(0) || "?";

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "היום";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "אתמול";
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  };

  const filteredUsers = chatUsers.filter(
    (u) =>
      u.id !== currentUserId &&
      (u.fullNameHe?.includes(searchQuery) ||
        u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.department?.includes(searchQuery))
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed top-0 left-0 h-full w-full sm:w-[420px] bg-card border-r border-border z-[61] flex flex-col shadow-2xl"
          >
            {view === "list" && (
              <>
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    צ'אט ארגוני
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setView("new-dm")}
                      className="p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                      title="שיחה חדשה"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-card/5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="px-3 py-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="חיפוש הודעות..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-background/50 border border-border/50 rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>

                {searchQuery.length > 2 && searchResults.length > 0 && (
                  <div className="px-3 py-1">
                    <p className="text-xs text-muted-foreground mb-1">תוצאות חיפוש</p>
                    {searchResults.slice(0, 5).map((msg) => (
                      <div
                        key={msg.id}
                        className="p-2 rounded-lg hover:bg-card/5 cursor-pointer text-sm"
                        onClick={() => {
                          if (msg.channelId) openChannel(msg.channelId);
                          setSearchQuery("");
                        }}
                      >
                        <span className="text-muted-foreground">{msg.senderNameHe || msg.senderName}: </span>
                        <span className="text-foreground">{msg.content.slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {channels.length > 0 && (
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">ערוצים</p>
                      {channels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => openChannel(channel.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/5 transition-colors text-right"
                        >
                          {getChannelIcon(channel.type)}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{channel.name}</div>
                            {channel.description && (
                              <div className="text-xs text-muted-foreground truncate">{channel.description}</div>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-3 py-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-xs font-semibold text-muted-foreground">הודעות פרטיות</p>
                      <button
                        onClick={() => setView("new-dm")}
                        className="text-xs text-primary hover:text-primary/80"
                      >
                        + חדש
                      </button>
                    </div>
                    {dmList.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                        אין שיחות פרטיות עדיין
                      </p>
                    )}
                    {dmList.map((dm) => (
                      <button
                        key={dm.id}
                        onClick={() => openDM(dm.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/5 transition-colors text-right"
                      >
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
                            {getInitial(dm.otherUser?.fullNameHe || dm.otherUser?.fullName || "")}
                          </div>
                          {dm.otherUser && onlineUsers.has(dm.otherUser.id) && (
                            <Circle className="w-2.5 h-2.5 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {dm.otherUser?.fullNameHe || dm.otherUser?.fullName || "משתמש"}
                          </div>
                          {dm.otherUser?.department && (
                            <div className="text-xs text-muted-foreground truncate">{dm.otherUser.department}</div>
                          )}
                        </div>
                        {dm.lastMessageAt && (
                          <span className="text-[10px] text-muted-foreground">{formatDate(dm.lastMessageAt)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {view === "new-dm" && (
              <>
                <div className="p-4 border-b border-border/50 flex items-center gap-3">
                  <button onClick={goBack} className="p-1 hover:bg-card/5 rounded-lg">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <h2 className="text-base font-bold text-foreground">שיחה חדשה</h2>
                </div>
                <div className="px-3 py-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="חפש עובד..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-background/50 border border-border/50 rounded-lg py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => startDM.mutate(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/5 transition-colors text-right"
                    >
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-bold">
                          {getInitial(u.fullNameHe || u.fullName)}
                        </div>
                        {onlineUsers.has(u.id) && (
                          <Circle className="w-2.5 h-2.5 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {u.fullNameHe || u.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.department || u.jobTitle || ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {(view === "channel" || view === "dm") && (
              <>
                <div className="p-3 border-b border-border/50 flex items-center gap-3">
                  <button onClick={goBack} className="p-1.5 hover:bg-card/5 rounded-lg">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                  {view === "channel" && activeChannel && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getChannelIcon(activeChannel.type)}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{activeChannel.name}</div>
                        {activeChannel.description && (
                          <div className="text-[10px] text-muted-foreground truncate">{activeChannel.description}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {view === "dm" && activeDM && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
                          {getInitial(activeDM.otherUser?.fullNameHe || activeDM.otherUser?.fullName || "")}
                        </div>
                        {activeDM.otherUser && onlineUsers.has(activeDM.otherUser.id) && (
                          <Circle className="w-2 h-2 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">
                          {activeDM.otherUser?.fullNameHe || activeDM.otherUser?.fullName || "משתמש"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {activeDM.otherUser && onlineUsers.has(activeDM.otherUser.id) ? "מחובר/ת" : "לא מחובר/ת"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      אין הודעות עדיין. התחל/י שיחה!
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const isMe = msg.senderId === currentUserId;
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showDateSep =
                      !prevMsg ||
                      new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
                    const showSender = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId || showDateSep);

                    return (
                      <div key={msg.id}>
                        {showDateSep && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px bg-border/30" />
                            <span className="text-[10px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                            <div className="flex-1 h-px bg-border/30" />
                          </div>
                        )}
                        <div className={`flex ${isMe ? "justify-start" : "justify-end"} mb-0.5`}>
                          <div className={`max-w-[80%] ${isMe ? "order-1" : "order-2"}`}>
                            {showSender && view === "channel" && (
                              <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
                                {msg.senderNameHe || msg.senderName}
                              </div>
                            )}
                            <div
                              className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                                isMe
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted/50 text-foreground rounded-bl-md"
                              }`}
                            >
                              {msg.messageType === "image" && msg.attachments ? (
                                <div>
                                  {(msg.attachments as { url: string; originalName: string }[]).map((att, i) => (
                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
                                      <img src={att.url} alt={att.originalName} className="max-w-[240px] max-h-[200px] rounded-lg mb-1" />
                                    </a>
                                  ))}
                                  <span className="text-xs opacity-80">{msg.content}</span>
                                </div>
                              ) : msg.messageType === "file" && msg.attachments ? (
                                <div>
                                  {(msg.attachments as { url: string; originalName: string; size: number }[]).map((att, i) => (
                                    <a
                                      key={i}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-1.5 rounded-lg bg-black/10 hover:bg-black/20 transition-colors mb-1"
                                    >
                                      <FileText className="w-4 h-4 flex-shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium truncate">{att.originalName}</div>
                                        <div className="text-[10px] opacity-60">{(att.size / 1024).toFixed(1)} KB</div>
                                      </div>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                msg.content
                              )}
                            </div>
                            <div
                              className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${
                                isMe ? "text-left" : "text-right"
                              }`}
                            >
                              {formatTime(msg.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-3 border-t border-border/50">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                    onChange={handleFileUpload}
                  />
                  <div className="flex items-center gap-2 bg-background/50 border border-border/50 rounded-xl px-3 py-1.5">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      title="צרף קובץ"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="כתוב הודעה..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
                      dir="auto"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!messageText.trim() || sendChannelMessage.isPending || sendDMMessage.isPending}
                      className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ChatBadge() {
  const { data } = useQuery<{ totalUnread: number }>({
    queryKey: ["chat-unread"],
    queryFn: () => authJson(`${(import.meta.env.VITE_API_URL || "/api")}/chat/unread-counts`),
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const count = data?.totalUnread || 0;
  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
