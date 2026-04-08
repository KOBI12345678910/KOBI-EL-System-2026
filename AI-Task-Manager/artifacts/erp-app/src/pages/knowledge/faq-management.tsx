import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, Plus, BookOpen, Tag, Eye, ThumbsUp } from "lucide-react";

export default function FAQManagement() {
  const [search, setSearch] = useState("");
  const categories = ["כללי", "פיננסים", "מלאי", "משאבי אנוש", "ייצור", "טכני"];

  const faqs = [
    { id: 1, question: "איך מוציאים חשבונית חדשה?", answer: "נכנסים למודול פיננסים > הכנסות > לחיצה על 'מסמך חדש' > בוחרים סוג 'חשבונית מס' > ממלאים פרטי לקוח ושורות > שמירה.", category: "פיננסים", views: 234, helpful: 189 },
    { id: 2, question: "איך מבצעים ספירת מלאי?", answer: "מודול מלאי > ספירות > 'ספירה חדשה' > בוחרים מחסן > מתחילים ספירה > מזינים כמויות > מאשרים.", category: "מלאי", views: 156, helpful: 132 },
    { id: 3, question: "איך מגישים דוח חופשה?", answer: "מודול HR > חופשות > 'בקשה חדשה' > בוחרים תאריכים > מצרפים אישור אם נדרש > שולחים לאישור מנהל.", category: "משאבי אנוש", views: 312, helpful: 298 },
    { id: 4, question: "איך מוסיפים ספק חדש?", answer: "מודול ספקים > 'ספק חדש' > ממלאים פרטים כולל ח.פ., בנק, תנאי תשלום > שמירה > מופיע ברשימת הספקים.", category: "כללי", views: 189, helpful: 167 },
  ];

  const filtered = faqs.filter(f => !search || f.question.includes(search) || f.answer.includes(search));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" /> שאלות נפוצות
        </h1>
        <Button><Plus className="h-4 w-4 ml-2" /> שאלה חדשה</Button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="חפש שאלה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10 text-lg h-12" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <Badge key={cat} variant="outline" className="cursor-pointer hover:bg-accent">
            <Tag className="h-3 w-3 ml-1" />{cat}
          </Badge>
        ))}
      </div>

      <Accordion type="multiple" className="space-y-2">
        {filtered.map(faq => (
          <AccordionItem key={faq.id} value={String(faq.id)} className="border rounded-lg px-4">
            <AccordionTrigger className="text-right">
              <div className="flex items-center gap-3 flex-1">
                <span className="font-medium">{faq.question}</span>
                <Badge variant="secondary" className="mr-auto">{faq.category}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground mb-3">{faq.answer}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{faq.views} צפיות</span>
                <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{faq.helpful} מועיל</span>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
