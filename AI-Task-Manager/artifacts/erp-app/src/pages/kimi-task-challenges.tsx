import { useState } from "react";
import { authFetch } from "@/lib/utils";
import {
  Play, CheckCircle2, XCircle, Code, Loader2, Trophy, Target, Zap,
  Bot, RotateCcw, Sparkles, ChevronRight
} from "lucide-react";

interface Challenge {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  description: string;
  prompt: string;
  testId: string;
  criteria: string;
}

const CHALLENGES: Challenge[] = [
  {
    id: "c1",
    title: "חיבור מספרים",
    category: "לוגיקה",
    difficulty: "קל",
    description: "בקש מקימי לכתוב פונקציה שמחברת שני מספרים",
    prompt: "כתוב פונקציית JavaScript בשם sum שמקבלת שני מספרים a ו-b ומחזירה את הסכום שלהם. החזר רק את הקוד, בלי הסברים.",
    testId: "sum",
    criteria: "sum(1, 2) === 3",
  },
  {
    id: "c2",
    title: "היפוך מחרוזת",
    category: "מחרוזות",
    difficulty: "בינוני",
    description: "בקש מקימי לכתוב פונקציה שהופכת מחרוזת",
    prompt: "כתוב פונקציית JavaScript בשם reverseString שמקבלת מחרוזת str ומחזירה אותה הפוכה. החזר רק את הקוד, בלי הסברים.",
    testId: "reverse",
    criteria: "reverseString('hello') === 'olleh'",
  },
  {
    id: "c3",
    title: "עצרת (Factorial)",
    category: "מתמטיקה",
    difficulty: "קשה",
    description: "בקש מקימי לכתוב פונקציה שמחשבת עצרת",
    prompt: "כתוב פונקציית JavaScript בשם factorial שמקבלת מספר n ומחזירה את n! (עצרת). לדוגמה factorial(5) = 120. החזר רק את הקוד, בלי הסברים.",
    testId: "factorial",
    criteria: "factorial(5) === 120",
  },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  "קל": "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "בינוני": "text-amber-400 bg-amber-500/10 border-amber-500/30",
  "קשה": "text-red-400 bg-red-500/10 border-red-500/30",
};

interface TestResult {
  passed: boolean;
  kimiCode: string;
  output: string;
  feedback: string;
  score: number;
  latencyMs: number;
}

export default function KimiTaskChallenges() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "asking_kimi" | "testing_code">("idle");
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const ch = CHALLENGES[selectedIdx];
  const currentResult = results[ch.id];

  const extractCode = (text: string): string => {
    const fenceMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    const funcMatch = text.match(/(function\s+\w+[\s\S]*)/);
    if (funcMatch) return funcMatch[1].trim();
    return text.trim();
  };

  const runChallenge = async () => {
    setLoading(true);
    setPhase("asking_kimi");
    const startTime = Date.now();

    try {
      const chatRes = await authFetch("/api/kimi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: ch.prompt }],
        }),
      });

      if (!chatRes.ok) {
        const err = await chatRes.json().catch(() => ({ error: "שגיאה בתקשורת עם Kimi" }));
        const isTimeout = chatRes.status === 504 || err?.timeout === true;
        setResults((prev) => ({
          ...prev,
          [ch.id]: {
            passed: false,
            kimiCode: "",
            output: "",
            feedback: isTimeout
              ? "קימי לא הגיב בזמן — נסה שוב"
              : `קימי לא זמין: ${err.error || chatRes.status}`,
            score: 0,
            latencyMs: Date.now() - startTime,
          },
        }));
        return;
      }

      const chatData = await chatRes.json();
      const kimiCode = extractCode(chatData.content || "");

      if (!kimiCode) {
        setResults((prev) => ({
          ...prev,
          [ch.id]: {
            passed: false,
            kimiCode: chatData.content || "",
            output: "",
            feedback: "קימי לא החזיר קוד תקין",
            score: 0,
            latencyMs: Date.now() - startTime,
          },
        }));
        return;
      }

      setPhase("testing_code");

      const testRes = await authFetch("/api/task-challenges/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: ch.testId, code: kimiCode }),
      });

      const testData = await testRes.json();
      const latencyMs = Date.now() - startTime;

      setResults((prev) => ({
        ...prev,
        [ch.id]: {
          passed: testData.passed,
          kimiCode,
          output: String(testData.output ?? ""),
          feedback: testData.feedback,
          score: testData.score,
          latencyMs,
        },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = /timeout|abort/i.test(msg);
      setResults((prev) => ({
        ...prev,
        [ch.id]: {
          passed: false,
          kimiCode: "",
          output: "",
          feedback: isTimeout
            ? "קימי לא הגיב בזמן — נסה שוב"
            : "שגיאת רשת: " + msg,
          score: 0,
          latencyMs: Date.now() - startTime,
        },
      }));
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  const totalScore = Object.values(results).reduce((sum, r) => sum + r.score, 0);
  const passedCount = Object.values(results).filter((r) => r.passed).length;

  return (
    <div dir="rtl" className="flex h-full">
      <div className="w-72 border-l border-border/50 bg-card/30 flex flex-col">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-bold">אתגרי קוד לקימי</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-muted-foreground">{totalScore} נקודות</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-muted-foreground">{passedCount}/{CHALLENGES.length} עברו</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {CHALLENGES.map((c, i) => {
            const r = results[c.id];
            const isActive = selectedIdx === i;
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedIdx(i); }}
                className={`w-full text-right p-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-card/50 border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {r?.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : r ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Code className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{c.title}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${DIFFICULTY_COLORS[c.difficulty] || ""}`}>
                    {c.difficulty}
                  </span>
                  {r && <span className="text-[10px] text-muted-foreground">{r.score} נק | {r.latencyMs}ms</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                {ch.title}
                <span className={`text-xs px-2 py-0.5 rounded border ${DIFFICULTY_COLORS[ch.difficulty] || ""}`}>
                  {ch.difficulty}
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{ch.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {currentResult && (
                <button
                  onClick={() => {
                    setResults((prev) => {
                      const next = { ...prev };
                      delete next[ch.id];
                      return next;
                    });
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-card/50 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  איפוס
                </button>
              )}
              <button
                onClick={runChallenge}
                disabled={loading}
                className="text-xs px-4 py-2 rounded-lg bg-purple-600 text-foreground hover:bg-purple-500 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {phase === "asking_kimi" ? "שואל את קימי..." : "בודק קוד..."}
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    שלח לקימי
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/20 rounded-xl border border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Code className="w-4 h-4 text-blue-400" />
                קטגוריה: <span className="text-foreground font-medium">{ch.category}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="w-4 h-4 text-amber-400" />
                בדיקה: <span className="text-foreground font-mono text-xs">{ch.criteria}</span>
              </div>
            </div>

            <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
              <div className="flex items-center gap-1.5 text-sm text-purple-300 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                פרומפט שנשלח לקימי:
              </div>
              <div className="text-xs text-purple-200/80 leading-relaxed">{ch.prompt}</div>
            </div>
          </div>

          {currentResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border ${currentResult.passed ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {currentResult.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`font-bold ${currentResult.passed ? "text-emerald-300" : "text-red-300"}`}>
                    {currentResult.passed ? "קימי עבר את האתגר!" : "קימי נכשל באתגר"}
                  </span>
                  <span className="mr-auto text-xs text-muted-foreground">
                    ציון: {currentResult.score}/100 | זמן: {currentResult.latencyMs}ms
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{currentResult.feedback}</div>
              </div>

              {currentResult.kimiCode && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-card/50 border-b border-border flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-medium text-muted-foreground">הקוד שקימי כתב:</span>
                  </div>
                  <div className="p-4 bg-background/50 font-mono text-sm text-foreground overflow-x-auto max-h-[250px] overflow-y-auto" dir="ltr">
                    <pre className="whitespace-pre-wrap">{currentResult.kimiCode}</pre>
                  </div>
                </div>
              )}

              {currentResult.output && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 bg-card/50 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">פלט הרצה:</span>
                  </div>
                  <div className="p-4 bg-background/50 font-mono text-sm text-foreground" dir="ltr">
                    <pre className="whitespace-pre-wrap">{currentResult.output}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {!currentResult && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bot className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-sm">לחץ על &quot;שלח לקימי&quot; כדי לבדוק אם קימי יכול לפתור את האתגר</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
