import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Heart } from "lucide-react";

interface Comment {
  id: number;
  user: string;
  text: string;
  time: string;
  likes: number;
}

export default function CollaborationHub() {
  const [comments] = useState<Comment[]>([
    { id: 1, user: "דור בן אור", text: "הלקוח בחזרה עם שאלה על מחיר", time: "2 שעות", likes: 3 },
    { id: 2, user: "שרה לוי", text: "@דור בן אור אני שלחתי הנחה של 10%", time: "1 שעה", likes: 1 },
  ]);
  const [newComment, setNewComment] = useState("");

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          Team Collaboration & Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="p-3 border border-slate-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-slate-900 text-sm">{comment.user}</p>
                <p className="text-sm text-slate-700 mt-1">{comment.text}</p>
                <p className="text-xs text-slate-500 mt-2">{comment.time}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Heart className="w-3 h-3 text-red-600" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              <Badge variant="outline" className="text-xs">{comment.likes} likes</Badge>
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Input
              placeholder="Comment... (type @ to mention)"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
          </div>
          <Button className="bg-indigo-600">
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
