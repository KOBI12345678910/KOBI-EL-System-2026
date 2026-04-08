import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  FileText,
  TrendingUp,
  Eye,
  UserPlus,
  Plus,
  Heart,
  MessageCircle,
  Share2,
  Facebook,
  Instagram,
  Linkedin,
  ThumbsUp,
  BarChart3,
  Image,
  Video,
  Link,
} from "lucide-react";

const FALLBACK_POSTS = [
  { id: 1, title: "השקת קו חלונות פרימיום 2026", platform: "פייסבוק", type: "תמונה", likes: 245, comments: 34, shares: 18, reach: 3200, date: "2026-04-05" },
  { id: 2, title: "סרטון תהליך ייצור", platform: "אינסטגרם", type: "וידאו", likes: 567, comments: 89, shares: 45, reach: 8900, date: "2026-04-04" },
  { id: 3, title: "פרויקט מגדל השחר - סיום", platform: "לינקדאין", type: "מאמר", likes: 189, comments: 23, shares: 56, reach: 4500, date: "2026-04-03" },
  { id: 4, title: "מבצע אביב - 20% הנחה", platform: "פייסבוק", type: "תמונה", likes: 312, comments: 67, shares: 89, reach: 5600, date: "2026-04-02" },
  { id: 5, title: "מאחורי הקלעים - קו ייצור", platform: "אינסטגרם", type: "וידאו", likes: 890, comments: 123, shares: 67, reach: 12400, date: "2026-04-01" },
  { id: 6, title: "טיפים לבחירת חלונות", platform: "פייסבוק", type: "קישור", likes: 134, comments: 28, shares: 42, reach: 2800, date: "2026-03-30" },
  { id: 7, title: "עובד החודש - יוסי כהן", platform: "לינקדאין", type: "תמונה", likes: 267, comments: 45, shares: 12, reach: 3800, date: "2026-03-28" },
  { id: 8, title: "לפני ואחרי - שיפוץ בניין", platform: "אינסטגרם", type: "תמונה", likes: 723, comments: 98, shares: 56, reach: 9800, date: "2026-03-25" },
  { id: 9, title: "הרצאה בכנס אדריכלות", platform: "לינקדאין", type: "מאמר", likes: 156, comments: 34, shares: 78, reach: 5200, date: "2026-03-22" },
  { id: 10, title: "מבצע סוף חורף", platform: "פייסבוק", type: "תמונה", likes: 198, comments: 41, shares: 23, reach: 3100, date: "2026-03-20" },
];

const FALLBACK_CHANNELS = [
  { name: "פייסבוק", icon: Facebook, followers: 8500, growth: 4.2, posts: 45, engagement: 3.8, color: "text-blue-600", bg: "bg-blue-50" },
  { name: "אינסטגרם", icon: Instagram, followers: 12300, growth: 8.5, posts: 62, engagement: 5.2, color: "text-pink-600", bg: "bg-pink-50" },
  { name: "לינקדאין", icon: Linkedin, followers: 4200, growth: 6.1, posts: 28, engagement: 4.1, color: "text-blue-800", bg: "bg-indigo-50" },
];

const typeIcon = (type: string) => {
  switch (type) {
    case "תמונה": return <Image className="h-4 w-4" />;
    case "וידאו": return <Video className="h-4 w-4" />;
    case "מאמר": return <FileText className="h-4 w-4" />;
    case "קישור": return <Link className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
};

const platformIcon = (platform: string) => {
  switch (platform) {
    case "פייסבוק": return <Facebook className="h-4 w-4 text-blue-600" />;
    case "אינסטגרם": return <Instagram className="h-4 w-4 text-pink-600" />;
    case "לינקדאין": return <Linkedin className="h-4 w-4 text-blue-800" />;
    default: return <Share2 className="h-4 w-4" />;
  }
};

export default function SocialMedia() {
  const { data: socialmediaData } = useQuery({
    queryKey: ["social-media"],
    queryFn: () => authFetch("/api/marketing/social_media"),
    staleTime: 5 * 60 * 1000,
  });

  const posts = socialmediaData ?? FALLBACK_POSTS;

  const [tab, setTab] = useState("posts");

  const totalFollowers = channels.reduce((s, c) => s + c.followers, 0);
  const postsThisMonth = posts.filter((p) => p.date >= "2026-04-01").length;
  const avgEngagement = (channels.reduce((s, c) => s + c.engagement, 0) / channels.length).toFixed(1);
  const totalReach = posts.reduce((s, p) => s + p.reach, 0);
  const leadsFromSocial = 142;

  const kpis = [
    { label: "עוקבים", value: totalFollowers.toLocaleString(), icon: Users, color: "text-blue-600" },
    { label: "פוסטים החודש", value: postsThisMonth, icon: FileText, color: "text-green-600" },
    { label: "מעורבות", value: `${avgEngagement}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "חשיפה", value: totalReach.toLocaleString(), icon: Eye, color: "text-orange-600" },
    { label: "לידים מרשתות", value: leadsFromSocial, icon: UserPlus, color: "text-emerald-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול רשתות חברתיות</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - נוכחות דיגיטלית</p>
        </div>
        <Button><Plus className="h-4 w-4 ml-2" />פוסט חדש</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">פוסטים</TabsTrigger>
          <TabsTrigger value="channels">ערוצים</TabsTrigger>
          <TabsTrigger value="analytics">אנליטיקס</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {platformIcon(post.platform)}
                    <div>
                      <div className="font-semibold">{post.title}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        {typeIcon(post.type)}<span>{post.type}</span>
                        <span className="text-gray-300">|</span>
                        <span>{post.date}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{post.platform}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="flex items-center gap-1 text-red-500">
                    <Heart className="h-4 w-4" /><span>{post.likes}</span>
                  </div>
                  <div className="flex items-center gap-1 text-blue-500">
                    <MessageCircle className="h-4 w-4" /><span>{post.comments}</span>
                  </div>
                  <div className="flex items-center gap-1 text-green-500">
                    <Share2 className="h-4 w-4" /><span>{post.shares}</span>
                  </div>
                  <div className="flex items-center gap-1 text-purple-500">
                    <Eye className="h-4 w-4" /><span>{post.reach.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          {channels.map((ch) => (
            <Card key={ch.name}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`${ch.bg} p-4 rounded-xl`}>
                    <ch.icon className={`h-8 w-8 ${ch.color}`} />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{ch.name}</div>
                    <Badge className="bg-green-100 text-green-800 mt-1">+{ch.growth}% גדילה</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Users className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                    <div className="font-bold text-lg">{ch.followers.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">עוקבים</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <FileText className="h-5 w-5 mx-auto mb-1 text-green-600" />
                    <div className="font-bold text-lg">{ch.posts}</div>
                    <div className="text-xs text-muted-foreground">פוסטים</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <ThumbsUp className="h-5 w-5 mx-auto mb-1 text-purple-600" />
                    <div className="font-bold text-lg">{ch.engagement}%</div>
                    <div className="text-xs text-muted-foreground">מעורבות</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-600" />
                    <div className="font-bold text-lg">+{ch.growth}%</div>
                    <div className="text-xs text-muted-foreground">גדילה חודשית</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>ביצועים לפי פלטפורמה</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {channels.map((ch) => {
                  const chPosts = posts.filter((p) => p.platform === ch.name);
                  const chLikes = chPosts.reduce((s, p) => s + p.likes, 0);
                  const chReach = chPosts.reduce((s, p) => s + p.reach, 0);
                  return (
                    <div key={ch.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ch.icon className={`h-4 w-4 ${ch.color}`} />
                          <span className="font-medium">{ch.name}</span>
                        </div>
                        <span className="text-sm">{chLikes} לייקים | {chReach.toLocaleString()} חשיפה</span>
                      </div>
                      <Progress value={(chReach / 20000) * 100} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>סוגי תוכן פופולריים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {["וידאו", "תמונה", "מאמר", "קישור"].map((type) => {
                  const typePosts = posts.filter((p) => p.type === type);
                  const avgLikes = typePosts.length > 0 ? Math.round(typePosts.reduce((s, p) => s + p.likes, 0) / typePosts.length) : 0;
                  return (
                    <div key={type} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">{typeIcon(type)}<span>{type}</span></div>
                      <div className="text-left">
                        <div className="font-bold">{avgLikes} לייקים ממוצע</div>
                        <div className="text-xs text-muted-foreground">{typePosts.length} פוסטים</div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>סיכום חודשי</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-red-50 rounded-lg">
                  <Heart className="h-6 w-6 mx-auto mb-1 text-red-500" />
                  <div className="text-xl font-bold">{posts.reduce((s, p) => s + p.likes, 0).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">לייקים</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <MessageCircle className="h-6 w-6 mx-auto mb-1 text-blue-500" />
                  <div className="text-xl font-bold">{posts.reduce((s, p) => s + p.comments, 0)}</div>
                  <div className="text-xs text-muted-foreground">תגובות</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <Share2 className="h-6 w-6 mx-auto mb-1 text-green-500" />
                  <div className="text-xl font-bold">{posts.reduce((s, p) => s + p.shares, 0)}</div>
                  <div className="text-xs text-muted-foreground">שיתופים</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <BarChart3 className="h-6 w-6 mx-auto mb-1 text-purple-500" />
                  <div className="text-xl font-bold">{posts.reduce((s, p) => s + p.reach, 0).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">חשיפה כוללת</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
