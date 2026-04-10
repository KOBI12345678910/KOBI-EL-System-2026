import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, FolderOpen, Search, TrendingUp, Eye, Users, Clock, Star, FileText, Plus, Download } from "lucide-react";

const FALLBACK_ARTICLES = [
  { id: 1, title: "מדריך התקנת חלונות אלומיניום", category: "מדריכי התקנה", author: "יוסי כהן", views: 1245, rating: 4.8, updated: "2026-03-28", status: "פורסם" },
  { id: 2, title: "מפרט חומר אלומיניום 6063-T5", category: "מפרטי חומרים", author: "דוד לוי", views: 987, rating: 4.6, updated: "2026-04-01", status: "פורסם" },
  { id: 3, title: "פתרון בעיות דליפת מים בחלונות", category: "פתרון תקלות", author: "משה אברהם", views: 2340, rating: 4.9, updated: "2026-03-15", status: "פורסם" },
  { id: 4, title: "נוהלי בטיחות בעבודה עם זכוכית", category: "נוהלי בטיחות", author: "שרה גולן", views: 1567, rating: 4.7, updated: "2026-04-05", status: "פורסם" },
  { id: 5, title: "מדריך הרכבת דלתות הזזה", category: "מדריכי התקנה", author: "אבי מזרחי", views: 890, rating: 4.5, updated: "2026-03-20", status: "פורסם" },
  { id: 6, title: "מפרט זכוכית מחוסמת 10 מ\"מ", category: "מפרטי חומרים", author: "דוד לוי", views: 756, rating: 4.4, updated: "2026-02-28", status: "פורסם" },
  { id: 7, title: "תקלות נפוצות בתריסי גלילה", category: "פתרון תקלות", author: "יעקב שמש", views: 1890, rating: 4.8, updated: "2026-03-10", status: "פורסם" },
  { id: 8, title: "בטיחות בחיתוך אלומיניום", category: "נוהלי בטיחות", author: "שרה גולן", views: 1123, rating: 4.6, updated: "2026-04-02", status: "פורסם" },
  { id: 9, title: "התקנת מעקות זכוכית", category: "מדריכי התקנה", author: "יוסי כהן", views: 678, rating: 4.3, updated: "2026-03-25", status: "פורסם" },
  { id: 10, title: "מפרט אטם EPDM לחלונות", category: "מפרטי חומרים", author: "רונית שפירא", views: 543, rating: 4.2, updated: "2026-01-15", status: "פורסם" },
  { id: 11, title: "טיפול בחלודה בפרופילי ברזל", category: "פתרון תקלות", author: "משה אברהם", views: 1456, rating: 4.7, updated: "2026-03-05", status: "פורסם" },
  { id: 12, title: "עבודה בגובה - נוהלי בטיחות", category: "נוהלי בטיחות", author: "אמיר רז", views: 2100, rating: 4.9, updated: "2026-04-03", status: "פורסם" },
  { id: 13, title: "מדריך התקנת ויטרינות חנויות", category: "מדריכי התקנה", author: "אבי מזרחי", views: 432, rating: 4.1, updated: "2026-02-20", status: "טיוטה" },
  { id: 14, title: "מפרט ציפוי אבקתי RAL", category: "מפרטי חומרים", author: "דוד לוי", views: 867, rating: 4.5, updated: "2026-03-18", status: "פורסם" },
  { id: 15, title: "פתרון בעיות רעש ברוח בחלונות", category: "פתרון תקלות", author: "יעקב שמש", views: 1678, rating: 4.8, updated: "2026-04-06", status: "ממתין לבדיקה" },
];

const categories = [
  { name: "מדריכי התקנה", count: 4, icon: "bg-blue-500/20 text-blue-400", description: "הנחיות התקנה שלב אחרי שלב" },
  { name: "מפרטי חומרים", count: 4, icon: "bg-emerald-500/20 text-emerald-400", description: "מפרטים טכניים של חומרי גלם" },
  { name: "פתרון תקלות", count: 4, icon: "bg-orange-500/20 text-orange-400", description: "מדריכי פתרון בעיות נפוצות" },
  { name: "נוהלי בטיחות", count: 3, icon: "bg-red-500/20 text-red-400", description: "הוראות בטיחות ונהלים" },
  { name: "תחזוקה מונעת", count: 6, icon: "bg-purple-500/20 text-purple-400", description: "תוכניות ומדריכי תחזוקה" },
  { name: "בקרת איכות", count: 5, icon: "bg-yellow-500/20 text-yellow-400", description: "סטנדרטים ובדיקות איכות" },
  { name: "הדרכת עובדים", count: 3, icon: "bg-cyan-500/20 text-cyan-400", description: "חומרי הדרכה ולימוד" },
  { name: "תקנות ורגולציה", count: 4, icon: "bg-pink-500/20 text-pink-400", description: "תקני ISO ורגולציה" },
];

const FALLBACK_KPIS = [
  { label: "סה\"כ מאמרים", value: "156", icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "קטגוריות", value: "8", icon: FolderOpen, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "צפיות החודש", value: "12,450", icon: Eye, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "תורמים", value: "24", icon: Users, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "ממתין לבדיקה", value: "7", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "מאמר פופולרי", value: "פתרון דליפות", icon: Star, color: "text-pink-400", bg: "bg-pink-500/10" },
];

const FALLBACK_POPULAR_ARTICLES = [
  { rank: 1, title: "פתרון בעיות דליפת מים בחלונות", views: 2340, trend: "+12%" },
  { rank: 2, title: "עבודה בגובה - נוהלי בטיחות", views: 2100, trend: "+8%" },
  { rank: 3, title: "תקלות נפוצות בתריסי גלילה", views: 1890, trend: "+15%" },
  { rank: 4, title: "פתרון בעיות רעש ברוח בחלונות", views: 1678, trend: "+22%" },
  { rank: 5, title: "נוהלי בטיחות בעבודה עם זכוכית", views: 1567, trend: "+5%" },
  { rank: 6, title: "טיפול בחלודה בפרופילי ברזל", views: 1456, trend: "+3%" },
  { rank: 7, title: "מדריך התקנת חלונות אלומיניום", views: 1245, trend: "+10%" },
  { rank: 8, title: "בטיחות בחיתוך אלומיניום", views: 1123, trend: "+7%" },
  { rank: 9, title: "מפרט חומר אלומיניום 6063-T5", views: 987, trend: "-2%" },
  { rank: 10, title: "מדריך הרכבת דלתות הזזה", views: 890, trend: "+18%" },
];

export default function KnowledgeBase() {
  const { data: knowledgebaseData } = useQuery({
    queryKey: ["knowledge-base"],
    queryFn: () => authFetch("/api/knowledge/knowledge_base"),
    staleTime: 5 * 60 * 1000,
  });

  const articles = knowledgebaseData ?? FALLBACK_ARTICLES;
  const kpis = FALLBACK_KPIS;
  const popularArticles = FALLBACK_POPULAR_ARTICLES;

  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = articles.filter(a => {
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (search && !a.title.includes(search) && !a.category.includes(search) && !a.author.includes(search)) return false;
    return true;
  });

  const searchResults = articles.filter(a =>
    searchQuery && (a.title.includes(searchQuery) || a.category.includes(searchQuery) || a.author.includes(searchQuery))
  );

  const statusColor: Record<string, string> = {
    "פורסם": "bg-green-500/20 text-green-300",
    "טיוטה": "bg-yellow-500/20 text-yellow-300",
    "ממתין לבדיקה": "bg-blue-500/20 text-blue-300",
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-blue-400" /> בסיס ידע — טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מאגר ידע ארגוני למפעל מתכת, אלומיניום וזכוכית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm"><Plus className="w-4 h-4 ml-1" />מאמר חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`mx-auto w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="articles" className="space-y-4">
        <TabsList className="bg-card/50">
          <TabsTrigger value="articles"><FileText className="w-4 h-4 ml-1" />מאמרים</TabsTrigger>
          <TabsTrigger value="categories"><FolderOpen className="w-4 h-4 ml-1" />קטגוריות</TabsTrigger>
          <TabsTrigger value="search"><Search className="w-4 h-4 ml-1" />חיפוש מתקדם</TabsTrigger>
          <TabsTrigger value="popular"><TrendingUp className="w-4 h-4 ml-1" />הנצפים ביותר</TabsTrigger>
        </TabsList>

        <TabsContent value="articles">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש מאמר..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הקטגוריות</option>
                  {[...new Set(articles.map(a => a.category))].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">כותרת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כותב</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">צפיות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">דירוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עדכון אחרון</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                        <td className="p-3 text-foreground font-medium">{a.title}</td>
                        <td className="p-3 text-muted-foreground">{a.category}</td>
                        <td className="p-3 text-muted-foreground">{a.author}</td>
                        <td className="p-3 text-center text-muted-foreground">{a.views.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-yellow-400">
                            <Star className="w-3.5 h-3.5 fill-current" /> {a.rating}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.updated}</td>
                        <td className="p-3 text-center">
                          <Badge className={statusColor[a.status] || "bg-gray-500/20 text-gray-300"}>{a.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">מציג {filtered.length} מתוך {articles.length} מאמרים</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map(c => (
              <Card key={c.name} className="bg-card/50 border-border/50 hover:border-border transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={c.icon}>{c.name}</Badge>
                    <span className="text-2xl font-bold text-foreground">{c.count}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                  <div className="mt-3 text-xs text-muted-foreground">{c.count} מאמרים בקטגוריה</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="search">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">חיפוש מתקדם בבסיס הידע</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="הקלד מילות חיפוש... (לדוגמה: התקנה, אלומיניום, בטיחות)"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-10 text-lg h-12 bg-background/50"
                />
              </div>
              {searchQuery && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">נמצאו {searchResults.length} תוצאות עבור "{searchQuery}"</p>
                  {searchResults.map(r => (
                    <Card key={r.id} className="bg-background/30 border-border/30">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{r.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">{r.category} | {r.author} | {r.updated}</p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Eye className="w-4 h-4" /> {r.views.toLocaleString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">לא נמצאו תוצאות. נסה מילות חיפוש אחרות.</p>
                  )}
                </div>
              )}
              {!searchQuery && (
                <div className="text-center py-10 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>הקלד מילות חיפוש כדי למצוא מאמרים</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {["התקנת חלונות", "מפרט אלומיניום", "בטיחות", "פתרון תקלות", "זכוכית מחוסמת"].map(term => (
                      <Badge key={term} variant="outline" className="cursor-pointer hover:bg-accent" onClick={() => setSearchQuery(term)}>{term}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="popular">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> 10 המאמרים הנצפים ביותר
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {popularArticles.map(a => (
                  <div key={a.rank} className="flex items-center gap-4 p-3 rounded-lg bg-background/30 hover:bg-background/50 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${a.rank <= 3 ? "bg-yellow-500/20 text-yellow-400" : "bg-muted text-muted-foreground"}`}>
                      {a.rank}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{a.title}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground"><Eye className="w-4 h-4" /> {a.views.toLocaleString()}</span>
                      <Badge className={a.trend.startsWith("+") ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}>{a.trend}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
