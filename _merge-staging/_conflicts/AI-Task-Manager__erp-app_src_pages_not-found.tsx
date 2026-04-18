import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center" dir="rtl">
      <Card className="w-full max-w-md mx-4 bg-slate-900/50 border-slate-700/50">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground mb-2">404</h1>
          <p className="text-lg text-slate-300 mb-1">הדף לא נמצא</p>
          <p className="text-sm text-muted-foreground mb-6">
            הדף שחיפשת לא קיים או שהועבר למיקום אחר
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate("/")} className="gap-2">
              <Home className="w-4 h-4" />
              חזרה לדשבורד
            </Button>
            <Button variant="outline" onClick={() => window.history.back()} className="gap-2 border-slate-600">
              <ArrowRight className="w-4 h-4" />
              חזרה אחורה
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
