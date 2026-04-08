import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import ActivityLog from "@/components/activity-log";
import {
  Hash,
  MessageSquare,
  Users,
  Headphones,
  Search,
  Plus,
  Send,
  Paperclip,
  Circle,
  ArrowRight,
  FileText,
  Loader2,
  Factory,
  Truck,
  Building2,
  Megaphone,
  TrendingUp,
  DollarSign,
  Server,
  Cpu,
  CheckSquare,
  Target,
  Bell,
  X,
  Pin,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LifeBuoy,
  Clock,
  CheckCircle,
  AlertTriangle,
  Tag,
  User,
  Settings,
  UserPlus,
  UserMinus,
  Trash2,
  Edit3,
  Shield,
  Crown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch, authJson } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

type SidebarSection = "channels" | "dms" | "support";
type ChatView = "channel" | "dm" | "support-tickets" | "support-ticket-detail" | "none";

interface Channel {
  id: number;
  name: string;
  description: string | null;
  type: string;
  department: string | null;
  isDefault: boolean;
  icon: string | null;
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
  metadata: unknown;
  isPinned?: boolean;
  isInternal?: boolean;
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

interface SupportTicket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  createdByName: string | null;
  createdById: number;
  assignedTo: number | null;
  channelId: number | null;
}

interface RichMessageMetadata {
  type?: string;
  title?: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  status?: string;
  goal?: number;
  progress?: number;
  unit?: string;
  ticketId?: number;
  ticketNumber?: string;
  priority?: string;
  priorityLabel?: string;
  createdByName?: string;
  subject?: string;
}

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Hash, Factory, Truck, Building2, Megaphone, TrendingUp, DollarSign, Server, Cpu, Headphones, Users,
};

function getChannelIcon(channel: Channel) {
  if (channel.type === "support") return <Headphones className="w-4 h-4 text-green-400" />;
  if (channel.icon && CHANNEL_ICONS[channel.icon]) {
    const Icon = CHANNEL_ICONS[channel.icon];
    return <Icon className="w-4 h-4 text-blue-400" />;
  }
  return <Hash className="w-4 h-4 text-blue-400" />;
}

function getInitial(name: string) {
  return name?.charAt(0) || "?";
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "היום";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "אתמול";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function TaskCard({ meta, isMe, onMarkDone }: { meta: RichMessageMetadata; isMe: boolean; onMarkDone?: () => void }) {
  const statusColors: Record<string, string> = {
    pending: "text-yellow-400",
    in_progress: "text-blue-400",
    done: "text-green-400",
    cancelled: "text-muted-foreground",
  };
  const isDone = meta.status === "done";
  return (
    <div className={`rounded-xl border p-3 mt-1 ${isDone ? "opacity-70" : ""} ${isMe ? "bg-primary/20 border-primary/40" : "bg-card border-border/60"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <CheckSquare className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">משימה</span>
        {!isDone && onMarkDone && (
          <button
            onClick={onMarkDone}
            className="mr-auto text-[10px] px-2 py-0.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors flex items-center gap-1"
          >
            <CheckCircle className="w-2.5 h-2.5" /> סמן כהושלם
          </button>
        )}
        {isDone && <span className="mr-auto text-[10px] text-green-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> הושלם</span>}
      </div>
      <div className={`text-sm font-medium mb-1 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>{meta.title}</div>
      {meta.description && <div className="text-xs text-muted-foreground mb-2">{meta.description}</div>}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {meta.assignee && (
          <span className="flex items-center gap-1"><User className="w-3 h-3" />{meta.assignee}</span>
        )}
        {meta.dueDate && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{meta.dueDate}</span>
        )}
        {meta.status && (
          <span className={`flex items-center gap-1 ${statusColors[meta.status] || "text-muted-foreground"}`}>
            <CheckCircle className="w-3 h-3" />{meta.status === "done" ? "הושלם" : meta.status === "in_progress" ? "בביצוע" : "ממתין"}
          </span>
        )}
      </div>
    </div>
  );
}

function AnnouncementCard({ meta, isMe }: { meta: RichMessageMetadata; isMe: boolean }) {
  return (
    <div className={`rounded-xl border p-3 mt-1 ${isMe ? "bg-primary/20 border-primary/40" : "bg-amber-500/10 border-amber-500/30"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Megaphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">הכרזה</span>
      </div>
      <div className="text-sm font-medium text-foreground mb-1">{meta.title}</div>
      {meta.description && <div className="text-xs text-muted-foreground">{meta.description}</div>}
    </div>
  );
}

function GoalCard({ meta, isMe, onUpdateProgress }: { meta: RichMessageMetadata; isMe: boolean; onUpdateProgress?: (newProgress: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(meta.progress || 0));
  const progress = meta.progress || 0;
  const goal = meta.goal || 100;
  const pct = Math.min(100, Math.round((progress / goal) * 100));

  const handleSave = () => {
    const val = Number(inputVal);
    if (!isNaN(val) && onUpdateProgress) onUpdateProgress(val);
    setEditing(false);
  };

  return (
    <div className={`rounded-xl border p-3 mt-1 ${isMe ? "bg-primary/20 border-primary/40" : "bg-green-500/10 border-green-500/30"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Target className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">יעד</span>
        {onUpdateProgress && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="mr-auto text-[10px] px-2 py-0.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
          >
            עדכן
          </button>
        )}
      </div>
      <div className="text-sm font-medium text-foreground mb-1">{meta.title}</div>
      {meta.description && <div className="text-xs text-muted-foreground mb-2">{meta.description}</div>}
      {editing ? (
        <div className="flex items-center gap-2 mb-1">
          <input
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="w-20 bg-background/50 border border-border/50 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            autoFocus
          />
          <span className="text-xs text-muted-foreground">/ {goal}{meta.unit || ""}</span>
          <button onClick={handleSave} className="text-[10px] px-2 py-1 rounded bg-green-500/30 text-green-400 hover:bg-green-500/40 transition-colors">שמור</button>
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 rounded bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors">ביטול</button>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>התקדמות: {progress}{meta.unit || ""}</span>
            <span>יעד: {goal}{meta.unit || ""}</span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-green-400 text-right">{pct}%</div>
        </div>
      )}
    </div>
  );
}

function SupportTicketCard({ meta }: { meta: RichMessageMetadata }) {
  const priorityColors: Record<string, string> = {
    low: "text-muted-foreground",
    medium: "text-yellow-400",
    high: "text-orange-400",
    urgent: "text-red-400",
  };
  return (
    <div className="rounded-xl border bg-blue-500/10 border-blue-500/30 p-3 mt-1">
      <div className="flex items-center gap-2 mb-1.5">
        <LifeBuoy className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">פנייה</span>
        <span className="text-xs text-muted-foreground">{meta.ticketNumber}</span>
        {meta.priority && (
          <span className={`text-xs mr-auto ${priorityColors[meta.priority] || "text-muted-foreground"}`}>
            {meta.priorityLabel || meta.priority}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-foreground mb-1">{meta.subject || meta.title}</div>
      {meta.description && <div className="text-xs text-muted-foreground line-clamp-2">{meta.description}</div>}
      {meta.createdByName && <div className="text-xs text-muted-foreground mt-1">נפתחה ע"י: {meta.createdByName}</div>}
    </div>
  );
}

function MessageBubble({ msg, isMe, showSender, view, onPin, onMarkTaskDone, onUpdateGoalProgress }: {
  msg: ChatMessage;
  isMe: boolean;
  showSender: boolean;
  view: ChatView;
  onPin?: (msgId: number) => void;
  onMarkTaskDone?: (msgId: number, meta: RichMessageMetadata) => void;
  onUpdateGoalProgress?: (msgId: number, meta: RichMessageMetadata, newProgress: number) => void;
}) {
  const meta = msg.metadata as RichMessageMetadata | null;

  const actions = (
    <div className={`absolute top-0 ${isMe ? "left-full ml-1" : "right-full mr-1"} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
      {onPin && (
        <button
          onClick={() => onPin(msg.id)}
          className={`p-1 rounded hover:bg-card/10 transition-colors ${msg.isPinned ? "text-yellow-400" : "text-muted-foreground"}`}
          title={msg.isPinned ? "בטל הצמדה" : "הצמד הודעה"}
        >
          <Pin className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className={`flex ${isMe ? "justify-start" : "justify-end"} mb-0.5`}>
      <div className={`max-w-[75%] relative group ${isMe ? "order-1" : "order-2"}`}>
        {actions}
        {showSender && view === "channel" && !isMe && (
          <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
            {msg.senderNameHe || msg.senderName}
          </div>
        )}
        {msg.isInternal && (
          <div className="text-[10px] text-yellow-400 mb-0.5 px-1 flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" /> הערה פנימית
          </div>
        )}
        {msg.isPinned && (
          <div className="text-[10px] text-yellow-400 mb-0.5 px-1 flex items-center gap-1">
            <Pin className="w-2.5 h-2.5" /> מוצמד
          </div>
        )}
        {msg.messageType === "task" && meta ? (
          <div>
            <TaskCard
              meta={meta}
              isMe={isMe}
              onMarkDone={onMarkTaskDone && meta.status !== "done" ? () => onMarkTaskDone(msg.id, meta) : undefined}
            />
            <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
              {formatTime(msg.createdAt)}
            </div>
          </div>
        ) : msg.messageType === "announcement" && meta ? (
          <div>
            <AnnouncementCard meta={meta} isMe={isMe} />
            <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
              {formatTime(msg.createdAt)}
            </div>
          </div>
        ) : msg.messageType === "goal" && meta ? (
          <div>
            <GoalCard
              meta={meta}
              isMe={isMe}
              onUpdateProgress={onUpdateGoalProgress ? (newProgress) => onUpdateGoalProgress(msg.id, meta, newProgress) : undefined}
            />
            <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
              {formatTime(msg.createdAt)}
            </div>
          </div>
        ) : msg.messageType === "support_ticket" && meta ? (
          <div>
            <SupportTicketCard meta={meta} />
            <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
              {formatTime(msg.createdAt)}
            </div>
          </div>
        ) : (
          <div>
            <div
              className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                msg.isInternal
                  ? "bg-yellow-500/15 border border-yellow-500/30 text-foreground"
                  : isMe
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
            <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 flex items-center gap-1 ${isMe ? "text-left" : "text-right"}`}>
              {formatTime(msg.createdAt)}
              {msg.isEdited && <span className="opacity-60">(נערך)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type RichMessageType = "task" | "announcement" | "goal";

interface RichMessageForm {
  type: RichMessageType;
  title: string;
  description: string;
  assignee: string;
  dueDate: string;
  status: string;
  goal: string;
  progress: string;
  unit: string;
}

function RichMessageDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (type: string, content: string, metadata: RichMessageMetadata) => void;
}) {
  const [form, setForm] = useState<RichMessageForm>({
    type: "task",
    title: "",
    description: "",
    assignee: "",
    dueDate: "",
    status: "pending",
    goal: "",
    progress: "",
    unit: "",
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const meta: RichMessageMetadata = { title: form.title, description: form.description };
    let content = form.title;
    if (form.type === "task") {
      meta.assignee = form.assignee;
      meta.dueDate = form.dueDate;
      meta.status = form.status;
      content = `משימה: ${form.title}`;
    } else if (form.type === "announcement") {
      content = `הכרזה: ${form.title}`;
    } else if (form.type === "goal") {
      meta.goal = Number(form.goal) || 100;
      meta.progress = Number(form.progress) || 0;
      meta.unit = form.unit;
      content = `יעד: ${form.title}`;
    }
    onSubmit(form.type, content, meta);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground">הודעה עשירה</h3>
          <button onClick={onClose} className="p-1 hover:bg-card/5 rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["task", "announcement", "goal"] as RichMessageType[]).map((t) => (
            <button
              key={t}
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                form.type === t ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {t === "task" ? "משימה" : t === "announcement" ? "הכרזה" : "יעד"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">כותרת *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="כותרת..."
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              placeholder="תיאור..."
              rows={2}
            />
          </div>

          {form.type === "task" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">אחראי</label>
                  <input
                    type="text"
                    value={form.assignee}
                    onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                    className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="שם..."
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">תאריך יעד</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="pending">ממתין</option>
                  <option value="in_progress">בביצוע</option>
                  <option value="done">הושלם</option>
                </select>
              </div>
            </>
          )}

          {form.type === "goal" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">יעד</label>
                <input
                  type="number"
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="100"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">התקדמות</label>
                <input
                  type="number"
                  value={form.progress}
                  onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                  className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">יחידה</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full bg-background/50 border border-border/50 rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="₪, %, יח'"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.title.trim()}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            שלח
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CreateChannelDialog({
  onClose,
  onSuccess,
  users,
}: {
  onClose: () => void;
  onSuccess: () => void;
  users: ChatUser[];
}) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredUsers = users.filter(
    (u) =>
      !selectedMembers.includes(u.id) &&
      (u.fullNameHe?.includes(memberSearch) ||
        u.fullName?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        u.department?.includes(memberSearch))
  );

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await authJson(`${API_BASE}/chat/channels`, {
        method: "POST",
        body: JSON.stringify({ ...form, memberIds: selectedMembers }),
      });
      onSuccess();
      onClose();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            יצירת ערוץ חדש
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-card/5 rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">שם הערוץ *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="שם הערוץ..."
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="תיאור הערוץ..."
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">הוסף חברים</label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 mb-2"
              placeholder="חפש עובד..."
            />
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedMembers.map((mid) => {
                  const mu = users.find((u) => u.id === mid);
                  return (
                    <span key={mid} className="flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded-lg">
                      {mu?.fullNameHe || mu?.fullName}
                      <button onClick={() => setSelectedMembers((s) => s.filter((id) => id !== mid))} className="hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {memberSearch.length > 0 &&
                filteredUsers.slice(0, 10).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedMembers((s) => [...s, u.id])}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card/5 text-right"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-[10px] font-bold">
                      {getInitial(u.fullNameHe || u.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-foreground truncate">{u.fullNameHe || u.fullName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{u.department || ""}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || loading}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            צור ערוץ
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ManageMembersDialog({
  channelId,
  channelName,
  currentMembers,
  allUsers,
  onClose,
  onSuccess,
}: {
  channelId: number;
  channelName: string;
  currentMembers: ChatUser[];
  allUsers: ChatUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const memberIds = new Set(currentMembers.map((m) => m.id));

  const nonMembers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      (u.fullNameHe?.includes(searchQ) ||
        u.fullName?.toLowerCase().includes(searchQ.toLowerCase()) ||
        u.department?.includes(searchQ))
  );

  const handleAdd = async (userId: number) => {
    setLoading(userId);
    try {
      await authJson(`${API_BASE}/chat/channels/${channelId}/members`, {
        method: "POST",
        body: JSON.stringify({ userIds: [userId] }),
      });
      onSuccess();
    } catch {
    } finally {
      setLoading(null);
    }
  };

  const handleRemove = async (userId: number) => {
    setLoading(userId);
    try {
      await authFetch(`${API_BASE}/chat/channels/${channelId}/members/${userId}`, {
        method: "DELETE",
      });
      onSuccess();
    } catch {
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            ניהול חברי ערוץ — {channelName}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-card/5 rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          {currentMembers.length} חברים בערוץ
        </div>

        <div className="flex-1 overflow-y-auto space-y-0.5 mb-3 max-h-40">
          {currentMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card/5">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-[10px] font-bold">
                {getInitial(m.fullNameHe || m.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground truncate">{m.fullNameHe || m.fullName}</div>
                {m.department && <div className="text-[10px] text-muted-foreground">{m.department}</div>}
              </div>
              {(m as ChatUser & { role?: string }).role === "admin" ? (
                <span className="text-[10px] text-yellow-400 flex items-center gap-0.5"><Crown className="w-3 h-3" /> מנהל</span>
              ) : (
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={loading === m.id}
                  className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
                  title="הסר מהערוץ"
                >
                  {loading === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border/50 pt-3">
          <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> הוסף חברים חדשים
          </label>
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 mb-2"
            placeholder="חפש עובד להוספה..."
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {searchQ.length > 0 &&
              nonMembers.slice(0, 10).map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleAdd(u.id)}
                  disabled={loading === u.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card/5 text-right disabled:opacity-40"
                >
                  <div className="w-6 h-6 rounded-full bg-green-600/30 flex items-center justify-center text-green-300 text-[10px] font-bold">
                    {getInitial(u.fullNameHe || u.fullName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-foreground truncate">{u.fullNameHe || u.fullName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{u.department || ""}</div>
                  </div>
                  {loading === u.id ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <UserPlus className="w-3 h-3 text-green-400" />
                  )}
                </button>
              ))}
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-3 py-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
          סגור
        </button>
      </motion.div>
    </div>
  );
}

function SupportTicketForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ subject: "", description: "", priority: "medium" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) return;
    setLoading(true);
    try {
      await authJson(`${API_BASE}/chat/support/tickets`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onSuccess();
      onClose();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-blue-400" />
            פתיחת פנייה חדשה
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-card/5 rounded-lg">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">נושא *</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="נושא הפנייה..."
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              placeholder="תאר את הבעיה או השאלה..."
              rows={4}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">דחיפות</label>
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="low">נמוכה</option>
              <option value="medium">בינונית</option>
              <option value="high">גבוהה</option>
              <option value="urgent">דחוף</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
            ביטול
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.subject.trim() || !form.description.trim() || loading}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            שלח פנייה
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function ChatPage() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SidebarSection>("channels");
  const [chatView, setChatView] = useState<ChatView>("none");
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [activeDMId, setActiveDMId] = useState<number | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [ticketReplyText, setTicketReplyText] = useState("");
  const [ticketReplyInternal, setTicketReplyInternal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [showRichDialog, setShowRichDialog] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showInternalNote, setShowInternalNote] = useState(false);
  const [messageFilter, setMessageFilter] = useState<string>("all");
  const [isSupportAgent, setIsSupportAgent] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");
  const [showChannelDetails, setShowChannelDetails] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const currentUserId = user ? Number((user as Record<string, unknown>).id) : 0;

  const { data: chatRole } = useQuery<{ isSuperAdmin: boolean; isManager: boolean; isSupportAgent: boolean }>({
    queryKey: ["chat-role"],
    queryFn: () => authJson(`${API_BASE}/chat/me/role`),
    staleTime: 120000,
  });

  const isManagerOrAdmin = chatRole?.isManager || chatRole?.isSuperAdmin || false;

  useEffect(() => {
    if (user) {
      const dept = ((user.department as string) || "").toLowerCase();
      const title = ((user.jobTitle as string) || "").toLowerCase();
      setIsSupportAgent(
        !!user.isSuperAdmin ||
        dept === "it" || dept === "תמיכה" ||
        title.includes("תמיכה") || title.includes("support") || title.includes("helpdesk")
      );
    }
  }, [user]);

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`${API_BASE}/chat/stream?token=${token}`);
    eventSourceRef.current = es;

    es.addEventListener("new_message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.channelId) {
        queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.channelId] });
        queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      }
      queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
      queryClient.invalidateQueries({ queryKey: ["chat-channel-unread"] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    });

    es.addEventListener("new_dm", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.conversationId) {
        queryClient.invalidateQueries({ queryKey: ["chat-dm-messages", msg.conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["chat-dm-list"] });
      queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
      queryClient.invalidateQueries({ queryKey: ["chat-dm-unread"] });
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
  }, [token, queryClient]);

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["chat-channels"],
    queryFn: () => authJson(`${API_BASE}/chat/channels`),
    refetchInterval: 30000,
  });

  const { data: dmList = [] } = useQuery<DMConversation[]>({
    queryKey: ["chat-dm-list"],
    queryFn: () => authJson(`${API_BASE}/chat/dm`),
    refetchInterval: 30000,
  });

  const { data: channelMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", activeChannelId, messageFilter],
    queryFn: () => authJson(
      `${API_BASE}/chat/channels/${activeChannelId}/messages${messageFilter !== "all" ? `?type=${messageFilter}` : ""}`
    ),
    enabled: !!activeChannelId && chatView === "channel",
    refetchInterval: 10000,
  });

  const { data: dmMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["chat-dm-messages", activeDMId],
    queryFn: () => authJson(`${API_BASE}/chat/dm/${activeDMId}/messages`),
    enabled: !!activeDMId && chatView === "dm",
    refetchInterval: 10000,
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ["chat-users"],
    queryFn: () => authJson(`${API_BASE}/chat/users`),
    staleTime: 60000,
  });

  const { data: channelUnread = {} } = useQuery<Record<number, number>>({
    queryKey: ["chat-channel-unread"],
    queryFn: () => authJson(`${API_BASE}/chat/channels/unread`),
    refetchInterval: 30000,
  });

  const { data: dmUnread = {} } = useQuery<Record<number, number>>({
    queryKey: ["chat-dm-unread"],
    queryFn: () => authJson(`${API_BASE}/chat/dm/unread`),
    refetchInterval: 30000,
  });

  const { data: tickets = [] } = useQuery<SupportTicket[]>({
    queryKey: ["support-tickets"],
    queryFn: () => authJson(`${API_BASE}/chat/support/tickets`),
    refetchInterval: 30000,
  });

  const sendChannelMessage = useMutation({
    mutationFn: (payload: { content: string; messageType?: string; metadata?: unknown; isInternal?: boolean }) =>
      authJson(`${API_BASE}/chat/channels/${activeChannelId}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
      setMessageText("");
      setShowInternalNote(false);
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

  const updateTicket = useMutation({
    mutationFn: ({ ticketId, updates }: { ticketId: number; updates: Record<string, unknown> }) =>
      authJson(`${API_BASE}/chat/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-tickets"] }),
  });

  const sendTicketMessage = useMutation({
    mutationFn: ({ ticketId, content, isInternal }: { ticketId: number; content: string; isInternal: boolean }) =>
      authJson(`${API_BASE}/chat/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, isInternal }),
      }),
    onSuccess: (_, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", ticketId] });
      setTicketReplyText("");
      setTicketReplyInternal(false);
    },
  });

  const pinMessage = useMutation({
    mutationFn: ({ channelId, messageId }: { channelId: number; messageId: number }) =>
      authJson(`${API_BASE}/chat/channels/${channelId}/messages/${messageId}/pin`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] }),
  });

  const updateMessageMetadata = useMutation({
    mutationFn: ({ channelId, messageId, metadata }: { channelId: number; messageId: number; metadata: RichMessageMetadata }) =>
      authJson(`${API_BASE}/chat/channels/${channelId}/messages/${messageId}/metadata`, {
        method: "PATCH",
        body: JSON.stringify({ metadata }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] }),
  });

  const { data: ticketMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["ticket-messages", activeTicketId],
    queryFn: () => authJson(`${API_BASE}/chat/support/tickets/${activeTicketId}/messages`),
    enabled: !!activeTicketId && chatView === "support-ticket-detail",
    refetchInterval: 15000,
  });

  const { data: pinnedMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["pinned-messages", activeChannelId],
    queryFn: () => authJson(`${API_BASE}/chat/channels/${activeChannelId}/pinned`),
    enabled: !!activeChannelId && chatView === "channel",
    staleTime: 30000,
  });

  const { data: channelMembers = [] } = useQuery<ChatUser[]>({
    queryKey: ["channel-members", activeChannelId],
    queryFn: () => authJson(`${API_BASE}/chat/channels/${activeChannelId}/members`),
    enabled: !!activeChannelId && chatView === "channel" && showChannelDetails,
    staleTime: 60000,
  });

  const ticketMessagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ticketMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticketMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, dmMessages]);

  const handleSend = useCallback(() => {
    if (!messageText.trim()) return;
    if (chatView === "channel" && activeChannelId) {
      sendChannelMessage.mutate({ content: messageText, isInternal: showInternalNote });
    } else if (chatView === "dm" && activeDMId) {
      sendDMMessage.mutate(messageText);
    }
  }, [messageText, chatView, activeChannelId, activeDMId, showInternalNote, sendChannelMessage, sendDMMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRichMessage = useCallback((type: string, content: string, metadata: RichMessageMetadata) => {
    if (chatView === "channel" && activeChannelId) {
      sendChannelMessage.mutate({ content, messageType: type, metadata });
    }
  }, [chatView, activeChannelId, sendChannelMessage]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch(`${API_BASE}/chat/upload`, { method: "POST", body: formData, headers: {} });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const attachmentInfo = { url: data.url, originalName: data.originalName, size: data.size, mimeType: data.mimeType, isImage: data.isImage };
      const content = data.isImage ? `📎 ${data.originalName}` : `📄 ${data.originalName}`;
      if (chatView === "channel" && activeChannelId) {
        await authJson(`${API_BASE}/chat/channels/${activeChannelId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content, messageType: data.isImage ? "image" : "file", attachments: [attachmentInfo] }),
        });
        queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
      }
    } catch {
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
    queryClient.invalidateQueries({ queryKey: ["chat-channel-unread"] });
  }, [queryClient]);

  const markDMRead = useCallback((convId: number, msgs: ChatMessage[]) => {
    if (msgs.length === 0) return;
    const lastId = msgs[msgs.length - 1].id;
    authFetch(`${API_BASE}/chat/dm/${convId}/read`, {
      method: "POST",
      body: JSON.stringify({ messageId: lastId }),
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["chat-unread"] });
    queryClient.invalidateQueries({ queryKey: ["chat-dm-unread"] });
  }, [queryClient]);

  useEffect(() => {
    if (chatView === "channel" && activeChannelId && channelMessages.length > 0) {
      markChannelRead(activeChannelId, channelMessages);
    }
  }, [chatView, activeChannelId, channelMessages, markChannelRead]);

  useEffect(() => {
    if (chatView === "dm" && activeDMId && dmMessages.length > 0) {
      markDMRead(activeDMId, dmMessages);
    }
  }, [chatView, activeDMId, dmMessages, markDMRead]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDM = dmList.find((d) => d.id === activeDMId);
  const activeTicket = tickets.find((t) => t.id === activeTicketId);
  const allMessages = chatView === "channel" ? channelMessages : dmMessages;
  const messages = channelSearch && chatView === "channel"
    ? allMessages.filter((m) => {
        const meta = m.metadata as RichMessageMetadata | null;
        const q = channelSearch.toLowerCase();
        return (
          m.content.toLowerCase().includes(q) ||
          (meta?.title?.toLowerCase().includes(q) ?? false) ||
          (meta?.description?.toLowerCase().includes(q) ?? false) ||
          (m.senderNameHe?.toLowerCase().includes(q) ?? false) ||
          (m.senderName?.toLowerCase().includes(q) ?? false)
        );
      })
    : allMessages;

  const filteredUsers = chatUsers.filter(
    (u) =>
      u.id !== currentUserId &&
      (u.fullNameHe?.includes(searchQuery) ||
        u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.department?.includes(searchQuery))
  );

  const generalChannels = channels.filter((c) => c.type !== "department" && c.type !== "support");
  const deptChannels = channels.filter((c) => c.type === "department");
  const supportChannel = channels.find((c) => c.type === "support");

  const statusLabels: Record<string, string> = { open: "פתוח", in_progress: "בטיפול", waiting: "ממתין לתגובה", resolved: "נפתר", closed: "סגור" };
  const statusColors: Record<string, string> = {
    open: "bg-blue-500/20 text-blue-400",
    in_progress: "bg-yellow-500/20 text-yellow-400",
    waiting: "bg-purple-500/20 text-purple-400",
    resolved: "bg-green-500/20 text-green-400",
    closed: "bg-muted/20 text-muted-foreground",
  };
  const priorityColors: Record<string, string> = {
    low: "text-muted-foreground",
    medium: "text-yellow-400",
    high: "text-orange-400",
    urgent: "text-red-400",
  };

  const totalChannelUnread = Object.values(channelUnread as Record<string, number>).reduce((a, b) => a + b, 0);
  const totalDMUnread = Object.values(dmUnread as Record<string, number>).reduce((a, b) => a + b, 0);
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="flex h-full bg-background" dir="rtl">
      {showRichDialog && (
        <RichMessageDialog
          onClose={() => setShowRichDialog(false)}
          onSubmit={handleRichMessage}
        />
      )}
      {showTicketForm && (
        <SupportTicketForm
          onClose={() => setShowTicketForm(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
            queryClient.invalidateQueries({ queryKey: ["chat-messages", supportChannel?.id] });
          }}
        />
      )}
      {showCreateChannel && (
        <CreateChannelDialog
          onClose={() => setShowCreateChannel(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
          }}
          users={chatUsers.filter((u) => u.id !== currentUserId)}
        />
      )}
      {showManageMembers && activeChannelId && activeChannel && (
        <ManageMembersDialog
          channelId={activeChannelId}
          channelName={activeChannel.name}
          currentMembers={channelMembers}
          allUsers={chatUsers.filter((u) => u.id !== currentUserId)}
          onClose={() => setShowManageMembers(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["channel-members", activeChannelId] });
          }}
        />
      )}

      <div className="w-64 border-l border-border/50 flex flex-col bg-card/50 flex-shrink-0">
        <div className="p-4 border-b border-border/50">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            צ'אט ארגוני
          </h1>
        </div>

        <div className="p-2 border-b border-border/50 flex gap-1">
          {([
            { key: "channels" as SidebarSection, label: "ערוצים", badge: totalChannelUnread },
            { key: "dms" as SidebarSection, label: "פרטי", badge: totalDMUnread },
            { key: "support" as SidebarSection, label: "תמיכה", badge: openTickets },
          ] as const).map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-medium transition-colors relative ${
                activeSection === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-card/5"
              }`}
            >
              {label}
              {badge > 0 && (
                <span className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 bg-red-500 text-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeSection === "channels" && (
            <div className="p-2 space-y-0.5">
              {isManagerOrAdmin && (
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors mb-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  ערוץ חדש
                </button>
              )}
              {generalChannels.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">כללי</div>
                  {generalChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => { setActiveChannelId(ch.id); setChatView("channel"); setMessageFilter("all"); }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-right relative ${
                        activeChannelId === ch.id && chatView === "channel" ? "bg-primary/20 text-primary" : "text-foreground hover:bg-card/5"
                      }`}
                    >
                      {getChannelIcon(ch)}
                      <span className="text-sm truncate flex-1">{ch.name}</span>
                      {(channelUnread as Record<string, number>)[String(ch.id)] > 0 && (
                        <span className="w-4 h-4 bg-red-500 text-foreground text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {(channelUnread as Record<string, number>)[String(ch.id)] > 9 ? "9+" : (channelUnread as Record<string, number>)[String(ch.id)]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {deptChannels.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">מחלקות</div>
                  {deptChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => { setActiveChannelId(ch.id); setChatView("channel"); setMessageFilter("all"); }}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-right relative ${
                        activeChannelId === ch.id && chatView === "channel" ? "bg-primary/20 text-primary" : "text-foreground hover:bg-card/5"
                      }`}
                    >
                      {getChannelIcon(ch)}
                      <span className="text-sm truncate flex-1">{ch.name}</span>
                      {(channelUnread as Record<string, number>)[String(ch.id)] > 0 && (
                        <span className="w-4 h-4 bg-red-500 text-foreground text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {(channelUnread as Record<string, number>)[String(ch.id)] > 9 ? "9+" : (channelUnread as Record<string, number>)[String(ch.id)]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSection === "dms" && (
            <div className="p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>שיחות פרטיות</span>
                <button
                  onClick={() => setChatView("none")}
                  className="text-primary text-[10px] hover:underline"
                >
                  + חדש
                </button>
              </div>
              <div className="px-2 py-1">
                <div className="relative">
                  <Search className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="חפש עובד..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-background/50 border border-border/50 rounded-lg py-1.5 pr-7 pl-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              {searchQuery.length > 0 ? (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={async () => {
                      const conv = await authJson(`${API_BASE}/chat/dm`, { method: "POST", body: JSON.stringify({ targetUserId: u.id }) });
                      setActiveDMId(conv.id);
                      setChatView("dm");
                      queryClient.invalidateQueries({ queryKey: ["chat-dm-list"] });
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-card/5 text-right"
                  >
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-xs font-bold">
                        {getInitial(u.fullNameHe || u.fullName)}
                      </div>
                      {onlineUsers.has(u.id) && (
                        <Circle className="w-2 h-2 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">{u.fullNameHe || u.fullName}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{u.department || ""}</div>
                    </div>
                  </button>
                ))
              ) : (
                dmList.map((dm) => (
                  <button
                    key={dm.id}
                    onClick={() => { setActiveDMId(dm.id); setChatView("dm"); }}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-right relative ${
                      activeDMId === dm.id && chatView === "dm" ? "bg-primary/20 text-primary" : "text-foreground hover:bg-card/5"
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
                        {getInitial(dm.otherUser?.fullNameHe || dm.otherUser?.fullName || "")}
                      </div>
                      {dm.otherUser && onlineUsers.has(dm.otherUser.id) && (
                        <Circle className="w-2 h-2 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{dm.otherUser?.fullNameHe || dm.otherUser?.fullName || "משתמש"}</div>
                      {dm.lastMessageAt && (
                        <div className="text-[10px] text-muted-foreground">{formatDate(dm.lastMessageAt)}</div>
                      )}
                    </div>
                    {(dmUnread as Record<string, number>)[String(dm.id)] > 0 && (
                      <span className="w-4 h-4 bg-red-500 text-foreground text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                        {(dmUnread as Record<string, number>)[String(dm.id)] > 9 ? "9+" : (dmUnread as Record<string, number>)[String(dm.id)]}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {activeSection === "support" && (
            <div className="p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>תמיכה ושירות</span>
              </div>

              {supportChannel && (
                <button
                  onClick={() => { setActiveChannelId(supportChannel.id); setChatView("channel"); }}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-right ${
                    activeChannelId === supportChannel.id && chatView === "channel" ? "bg-primary/20 text-primary" : "text-foreground hover:bg-card/5"
                  }`}
                >
                  <Headphones className="w-4 h-4 text-green-400" />
                  <span className="text-sm truncate flex-1">ערוץ תמיכה</span>
                </button>
              )}

              <button
                onClick={() => setChatView("support-tickets")}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-right ${
                  chatView === "support-tickets" ? "bg-primary/20 text-primary" : "text-foreground hover:bg-card/5"
                }`}
              >
                <Tag className="w-4 h-4 text-blue-400" />
                <span className="text-sm flex-1">תור פניות</span>
                {openTickets > 0 && (
                  <span className="w-4 h-4 bg-red-500 text-foreground text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                    {openTickets > 9 ? "9+" : openTickets}
                  </span>
                )}
              </button>

              <div className="px-2 pt-2">
                <button
                  onClick={() => setShowTicketForm(true)}
                  className="w-full py-2 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  פתח פנייה חדשה
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {chatView === "none" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">בחר ערוץ או שיחה להתחלה</p>
            </div>
          </div>
        )}

        {(chatView === "channel" || chatView === "dm") && (
          <>
            <div className="p-3 border-b border-border/50 flex items-center gap-2 bg-card/50 flex-wrap">
              {chatView === "channel" && activeChannel && (
                <>
                  {getChannelIcon(activeChannel)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground">{activeChannel.name}</div>
                    {activeChannel.description && (
                      <div className="text-xs text-muted-foreground truncate">{activeChannel.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="relative">
                      <Search className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="חיפוש..."
                        value={channelSearch}
                        onChange={(e) => setChannelSearch(e.target.value)}
                        className="bg-background/50 border border-border/50 rounded-lg py-1 pr-7 pl-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-32"
                      />
                    </div>
                    {activeChannel.type !== "support" && (
                      <select
                        value={messageFilter}
                        onChange={(e) => setMessageFilter(e.target.value)}
                        className="text-xs bg-background/50 border border-border/50 rounded-lg px-2 py-1 text-muted-foreground focus:outline-none"
                      >
                        <option value="all">כל ההודעות</option>
                        <option value="task">משימות</option>
                        <option value="announcement">הכרזות</option>
                        <option value="goal">יעדים</option>
                      </select>
                    )}
                    {activeChannel.type === "support" && isSupportAgent && (
                      <button
                        onClick={() => setShowInternalNote(!showInternalNote)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                          showInternalNote ? "bg-yellow-500/20 text-yellow-400" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <AlertCircle className="w-3 h-3" /> פנימי
                      </button>
                    )}
                    {activeChannel.type === "support" && (
                      <button
                        onClick={() => setShowTicketForm(true)}
                        className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> פנייה
                      </button>
                    )}
                    <button
                      onClick={() => setShowChannelDetails(!showChannelDetails)}
                      className={`p-1.5 rounded-lg text-xs transition-colors ${showChannelDetails ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-card/5"}`}
                      title="פרטי ערוץ"
                    >
                      <Users className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
              {chatView === "dm" && activeDM && (
                <>
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-sm font-bold">
                      {getInitial(activeDM.otherUser?.fullNameHe || activeDM.otherUser?.fullName || "")}
                    </div>
                    {activeDM.otherUser && onlineUsers.has(activeDM.otherUser.id) && (
                      <Circle className="w-2.5 h-2.5 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-foreground">
                      {activeDM.otherUser?.fullNameHe || activeDM.otherUser?.fullName || "משתמש"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activeDM.otherUser && onlineUsers.has(activeDM.otherUser.id) ? "מחובר/ת" : "לא מחובר/ת"}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-h-0">

            {chatView === "channel" && pinnedMessages.length > 0 && (
              <div className="px-4 py-2 border-b border-border/30 bg-yellow-500/5">
                <div className="flex items-center gap-1 mb-1.5">
                  <Pin className="w-3 h-3 text-yellow-400" />
                  <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide">הודעות מוצמדות</span>
                </div>
                <div className="space-y-1">
                  {pinnedMessages.slice(0, 3).map((pm) => (
                    <div key={pm.id} className="text-xs text-muted-foreground bg-yellow-500/5 px-2 py-1 rounded-lg flex items-start gap-1">
                      <span className="font-medium text-foreground/80 flex-shrink-0">{pm.senderNameHe || pm.senderName}:</span>
                      <span className="truncate">{pm.messageType === "task" ? `[משימה] ${(pm.metadata as RichMessageMetadata)?.title}` : pm.messageType === "goal" ? `[יעד] ${(pm.metadata as RichMessageMetadata)?.title}` : pm.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {chatView === "channel" && channelSearch && (
              <div className="px-3 py-1.5 border-b border-border/30 bg-primary/5">
                <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>מחפש: <span className="text-primary font-medium">"{channelSearch}"</span> — {messages.length} תוצאות</span>
                  <button onClick={() => setChannelSearch("")} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
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
                    <MessageBubble
                      msg={msg}
                      isMe={isMe}
                      showSender={showSender}
                      view={chatView}
                      onPin={chatView === "channel" && activeChannelId && msg.channelId ? (msgId) => pinMessage.mutate({ channelId: activeChannelId, messageId: msgId }) : undefined}
                      onMarkTaskDone={chatView === "channel" && activeChannelId ? (msgId, meta) => {
                        updateMessageMetadata.mutate({ channelId: activeChannelId, messageId: msgId, metadata: { ...meta, status: "done" } });
                      } : undefined}
                      onUpdateGoalProgress={chatView === "channel" && activeChannelId ? (msgId, meta, newProgress) => {
                        updateMessageMetadata.mutate({ channelId: activeChannelId, messageId: msgId, metadata: { ...meta, progress: newProgress } });
                      } : undefined}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border/50 bg-card/30">
              {showInternalNote && (
                <div className="mb-2 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  הערה פנימית — גלויה לצוות תמיכה בלבד
                </div>
              )}
              <input ref={fileInputRef} type="file" className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                onChange={handleFileUpload}
              />
              <div className="flex items-center gap-2 bg-background/50 border border-border/50 rounded-xl px-3 py-1.5">
                {chatView === "channel" && (
                  <>
                    <button
                      onClick={() => setShowRichDialog(true)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="הודעה עשירה"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      title="צרף קובץ"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                    </button>
                  </>
                )}
                <input
                  type="text"
                  placeholder={showInternalNote ? "כתוב הערה פנימית..." : "כתוב הודעה..."}
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
            </div>

            {chatView === "channel" && showChannelDetails && (
              <div className="w-56 border-r border-border/50 bg-card/30 flex flex-col flex-shrink-0">
                <div className="p-3 border-b border-border/30">
                  <div className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-primary" /> חברי הערוץ
                  </div>
                </div>
                {isManagerOrAdmin && (
                  <div className="p-2 border-b border-border/30 space-y-1">
                    <button
                      onClick={() => setShowManageMembers(true)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      ניהול חברים
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {channelMembers.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">טוען...</div>
                  )}
                  {channelMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card/5">
                      <div className="relative flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-[10px] font-bold">
                          {getInitial(m.fullNameHe || m.fullName)}
                        </div>
                        {onlineUsers.has(m.id) && (
                          <Circle className="w-2 h-2 absolute -bottom-0.5 -left-0.5 fill-green-500 text-green-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-foreground truncate">{m.fullNameHe || m.fullName}</div>
                        {m.department && <div className="text-[10px] text-muted-foreground truncate">{m.department}</div>}
                      </div>
                      {(m as ChatUser & { role?: string }).role === "admin" && (
                        <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" title="מנהל ערוץ" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          </>
        )}

        {chatView === "support-tickets" && (
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-border/50 flex items-center justify-between bg-card/50">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-400" />
                  תור פניות
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{tickets.length} פניות סה"כ</p>
              </div>
              <button
                onClick={() => setShowTicketForm(true)}
                className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                פנייה חדשה
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tickets.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  אין פניות פתוחות
                </div>
              )}
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-card border border-border/50 rounded-xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => { setActiveTicketId(ticket.id); setChatView("support-ticket-detail"); }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-mono">{ticket.ticketNumber}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[ticket.status] || "bg-muted/20 text-muted-foreground"}`}>
                          {statusLabels[ticket.status] || ticket.status}
                        </span>
                        <span className={`text-[10px] font-medium ${priorityColors[ticket.priority] || "text-muted-foreground"}`}>
                          {ticket.priority === "urgent" ? "⚡ דחוף" : ticket.priority === "high" ? "🔴 גבוה" : ticket.priority === "medium" ? "🟡 בינוני" : "🟢 נמוך"}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-foreground mb-1">{ticket.subject}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    {ticket.createdByName && <span>{ticket.createdByName}</span>}
                    <span>{formatDate(ticket.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {chatView === "support-ticket-detail" && activeTicket && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-border/50 flex items-center gap-3 bg-card/50 flex-shrink-0">
              <button
                onClick={() => setChatView("support-tickets")}
                className="p-1.5 hover:bg-card/5 rounded-lg flex-shrink-0"
              >
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{activeTicket.subject}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono">{activeTicket.ticketNumber}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[activeTicket.status] || "bg-muted/20 text-muted-foreground"}`}>
                    {statusLabels[activeTicket.status] || activeTicket.status}
                  </span>
                  <span className={`text-[10px] font-medium ${priorityColors[activeTicket.priority] || ""}`}>
                    {activeTicket.priority === "urgent" ? "⚡ דחוף" : activeTicket.priority === "high" ? "🔴 גבוה" : activeTicket.priority === "medium" ? "🟡 בינוני" : "🟢 נמוך"}
                  </span>
                </div>
              </div>
              {isSupportAgent && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(["open", "in_progress", "waiting", "resolved", "closed"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateTicket.mutate({ ticketId: activeTicket.id, updates: { status: s } })}
                      className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${
                        activeTicket.status === s ? statusColors[s] : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {statusLabels[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <div className="bg-card border border-border/50 rounded-xl p-4 mb-4">
                <div className="text-xs text-muted-foreground mb-1">תיאור הפנייה</div>
                <div className="text-sm text-foreground">{activeTicket.description}</div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  {activeTicket.createdByName && <span>נפתחה ע"י: {activeTicket.createdByName}</span>}
                  <span>{formatDate(activeTicket.createdAt)}</span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> היסטוריית שיחה
              </div>

              {ticketMessages.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">אין הודעות עדיין</div>
              )}

              <div className="space-y-1">
                {ticketMessages.map((msg) => {
                  const isMe = msg.senderId === currentUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"} mb-1`}>
                      <div className={`max-w-[80%]`}>
                        <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
                          {msg.senderNameHe || msg.senderName}
                          {msg.isInternal && (
                            <span className="ml-2 text-yellow-400 flex items-center gap-0.5 inline-flex">
                              <AlertCircle className="w-2 h-2" /> פנימי
                            </span>
                          )}
                        </div>
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                          msg.isInternal
                            ? "bg-yellow-500/15 border border-yellow-500/30 text-foreground"
                            : isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-foreground"
                        }`}>
                          {msg.content}
                        </div>
                        <div className={`text-[10px] text-muted-foreground/60 mt-0.5 px-1 ${isMe ? "text-left" : "text-right"}`}>
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={ticketMessagesEndRef} />
              </div>
            </div>

            <div className="p-3 border-t border-border/50 bg-card/30 flex-shrink-0">
              {isSupportAgent && ticketReplyInternal && (
                <div className="mb-2 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  הערה פנימית — גלויה לצוות תמיכה בלבד
                </div>
              )}
              <div className="flex items-center gap-2 bg-background/50 border border-border/50 rounded-xl px-3 py-1.5">
                {isSupportAgent && (
                  <button
                    onClick={() => setTicketReplyInternal(!ticketReplyInternal)}
                    className={`p-1 rounded transition-colors ${ticketReplyInternal ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"}`}
                    title={ticketReplyInternal ? "הסר סימון הערה פנימית" : "סמן כהערה פנימית"}
                  >
                    <AlertCircle className="w-4 h-4" />
                  </button>
                )}
                <input
                  type="text"
                  placeholder={ticketReplyInternal ? "כתוב הערה פנימית..." : "כתוב תגובה..."}
                  value={ticketReplyText}
                  onChange={(e) => setTicketReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && ticketReplyText.trim()) {
                      e.preventDefault();
                      sendTicketMessage.mutate({ ticketId: activeTicket.id, content: ticketReplyText, isInternal: ticketReplyInternal });
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
                  dir="auto"
                />
                <button
                  onClick={() => {
                    if (ticketReplyText.trim()) {
                      sendTicketMessage.mutate({ ticketId: activeTicket.id, content: ticketReplyText, isInternal: ticketReplyInternal });
                    }
                  }}
                  disabled={!ticketReplyText.trim() || sendTicketMessage.isPending}
                  className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeChannel && (
          <div className="border-t border-border/50 p-3">
            <ActivityLog entityType="chat-channels" entityId={activeChannel.id} compact />
          </div>
        )}
      </div>
    </div>
  );
}
