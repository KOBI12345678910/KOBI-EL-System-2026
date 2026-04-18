import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Lock, AtSign } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Comment {
  id: string | number;
  content: string;
  author_name?: string;
  type?: string;
  created_date?: string;
}

interface CommentsSectionProps {
  relatedTo?: string;
  relatedId?: string | number;
  comments?: Comment[];
  onSubmit?: (content: string, type: string) => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "הרגע";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export default function CommentsSection({ comments = [], onSubmit }: CommentsSectionProps) {
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState("comment");

  const defaultComments: Comment[] = [
    { id: "1", content: "הלקוח ביקש להקדים את המועד", author_name: "דני כהן", type: "comment", created_date: new Date().toISOString() },
    { id: "2", content: "הערה פנימית: לבדוק מלאי לפני אישור", author_name: "שרה לוי", type: "internal_note", created_date: new Date(Date.now() - 3600000).toISOString() },
  ];

  const displayComments = comments.length > 0 ? comments : defaultComments;

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    onSubmit?.(newComment, commentType);
    setNewComment("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          תגובות והערות
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={commentType} onValueChange={setCommentType}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="comment">תגובה</TabsTrigger>
            <TabsTrigger value="internal_note"><Lock className="w-3 h-3 ml-1" />הערה פנימית</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder={commentType === "internal_note" ? "הערה פנימית (רק לצוות)..." : "כתוב תגובה... (@ לאזכור)"} className="min-h-20" />
        </div>
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm"><AtSign className="w-4 h-4 ml-1" />אזכר משתמש</Button>
          <Button onClick={handleSubmit} size="sm" className="gap-2"><Send className="w-4 h-4" />שלח</Button>
        </div>
        <div className="space-y-3 pt-4 border-t">
          {displayComments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{comment.author_name?.charAt(0) || "U"}</AvatarFallback></Avatar>
              <div className="flex-1 bg-slate-50 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{comment.author_name}</span>
                    {comment.type === "internal_note" && (<Badge variant="outline" className="text-xs"><Lock className="w-3 h-3 ml-1" />פנימי</Badge>)}
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(comment.created_date)}</span>
                </div>
                <p className="text-sm text-slate-700">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
