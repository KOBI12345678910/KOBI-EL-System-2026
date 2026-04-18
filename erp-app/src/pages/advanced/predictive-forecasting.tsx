import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, DollarSign, Package, Wallet, Activity, Brain,
  RefreshCw, Sparkles, AlertTriangle, BarChart3, Target,
  Zap, Calendar, CheckCircle2, Play
} from "lucide-react";

type ModelType = "moving_average" | "exponential_smoothing" | "arima" | "prophet" | "lstm";

interface ForecastSeries {
  id: string;
  title: string;
  titleHe: string;
  icon: any;
  color: string;
  unit: string;
  historical: number[];
  forecast: number[];
  upperBound: number[];
  lowerBound: number[];
  metrics: { mae: number; rmse: number; mape: number };
  seasonality: { month: string; strength: number }[];
  anomalies: { index: number; reason: string }[];
}

const MONTHS_HIST = ["אפר 25", "מאי 25", "יונ 25", "יול 25", "אוג 25", "ספט 25", "אוק 25", "נוב 25", "דצמ 25", "ינו 26", "פבר 26", "מרץ 26"];
const MONTHS_FC = ["אפר 26", "מאי 26", "יונ 26", "יול 26", "אוג 26", "ספט 26"];

const MOCK_FORECASTS: ForecastSeries[] = [
  {
    id: "sales",
    title: "Sales Forecast",
    titleHe: "חיזוי מכירות",
    icon: DollarSign,
    color: "cyan",
    unit: "₪K",
    historical: [850, 920, 880, 1050, 1120, 980, 1100, 1180, 1050, 1200, 1280, 1350],
    forecast: [1410, 1480, 1550, 1620, 1680, 1740],
    upperBound: [1480, 1560, 1650, 1740, 1820, 1900],
    lowerBound: [1340, 1400, 1450, 1500, 1540, 1580],
    metrics: { mae: 42, rmse: 58, mape: 3.8 },
    seasonality: [
      { month: "ק1", strength: 0.72 },
      { month: "ק2", strength: 0.85 },
      { month: "ק3", strength: 0.68 },
      { month: "ק4", strength: 0.91 },
    ],
    anomalies: [
      { index: 2, reason: "ירידה חריגה — קמפיין מתחרים" },
      { index: 7, reason: "שיא עונתי — חגים" },
    ],
  },
  {
    id: "demand",
    title: "Demand Forecast",
    titleHe: "חיזוי ביקושים",
    icon: Package,
    color: "purple",
    unit: "יח׳",
    historical: [4200, 4500, 4100, 5000, 5400, 4800, 5200, 5600, 5100, 5800, 6100, 6400],
    forecast: [6700, 7000, 7300, 7600, 7900, 8200],
    upperBound: [7000, 7400, 7800, 8200, 8600, 9000],
    lowerBound: [6400, 6600, 6800, 7000, 7200, 7400],
    metrics: { mae: 180, rmse: 245, mape: 4.2 },
    seasonality: [
      { month: "ק1", strength: 0.68 },
      { month: "ק2", strength: 0.79 },
      { month: "ק3", strength: 0.74 },
      { month: "ק4", strength: 0.88 },
    ],
    anomalies: [
      { index: 5, reason: "ירידה בחורף" },
      { index: 11, reason: "עלייה חדה — מוצר חדש" },
    ],
  },
  {
    id: "cashflow",
    title: "Cashflow Forecast",
    titleHe: "חיזוי תזרים מזומנים",
    icon: Wallet,
    color: "green",
    unit: "₪K",
    historical: [320, 380, 340, 420, 460, 380, 440, 500, 420, 520, 580, 620],
    forecast: [660, 700, 740, 780, 820, 860],
    upperBound: [700, 760, 820, 880, 940, 1000],
    lowerBound: [620, 640, 660, 680, 700, 720],
    metrics: { mae: 24, rmse: 32, mape: 4.8 },
    seasonality: [
      { month: "ק1", strength: 0.65 },
      { month: "ק2", strength: 0.8 },
      { month: "ק3", strength: 0.72 },
      { month: "ק4", strength: 0.86 },
    ],
    anomalies: [
      { index: 3, reason: "תזרים חיובי חריג — גביה רבעונית" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory Forecast",
    titleHe: "חיזוי מלאי",
    icon: Package,
    color: "amber",
    unit: "יח׳",
    historical: [12500, 12800, 13200, 12900, 13500, 14100, 13700, 14300, 14800, 15200, 15600, 16000],
    forecast: [16400, 16800, 17200, 17600, 18000, 18400],
    upperBound: [16800, 17400, 18000, 18600, 19200, 19800],
    lowerBound: [16000, 16200, 16400, 16600, 16800, 17000],
    metrics: { mae: 320, rmse: 450, mape: 2.5 },
    seasonality: [
      { month: "ק1", strength: 0.55 },
      { month: "ק2", strength: 0.7 },
      { month: "ק3", strength: 0.78 },
      { month: "ק4", strength: 0.82 },
    ],
    anomalies: [
      { index: 6, reason: "עלייה במלאי — רכישה מוקדמת" },
    ],
  },
];

const MODELS: { value: ModelType; label: string; description: string }[] = [
  { value: "moving_average", label: "Moving Average", description: "ממוצע נע — מודל פשוט ומהיר" },
  { value: "exponential_smoothing", label: "Exp. Smoothing", description: "החלקה מעריכית עם עונתיות" },
  { value: "arima", label: "ARIMA", description: "AutoRegressive Integrated Moving Average" },
  { value: "prophet", label: "Prophet", description: "מודל של Facebook לעונתיות מורכבת" },
  { value: "lstm", label: "LSTM Neural", description: "רשת נוירונים לסדרות עומק" },
];

function MiniChart({ historical, forecast, upper, lower, color }: { historical: number[]; forecast: number[]; upper: number[]; lower: number[]; color: string }) {
  const all = [...historical, ...forecast];
  const min = Math.min(...all, ...lower);
  const max = Math.max(...all, ...upper);
  const range = max - min || 1;
  const width = 100;
  const histWidth = (historical.length / (historical.length + forecast.length)) * width;
  const pointSpacing = width / (historical.length + forecast.length - 1);

  const toPath = (arr: number[], startIdx: number = 0) =>
    arr
      .map((v, i) => {
        const x = (i + startIdx) * pointSpacing;
        const y = 100 - ((v - min) / range) * 80 - 10;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  const confidencePath =
    upper
      .map((v, i) => {
        const x = (i + historical.length) * pointSpacing;
        const y = 100 - ((v - min) / range) * 80 - 10;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ") +
    " L" +
    lower
      .slice()
      .reverse()
      .map((v, i) => {
        const x = (lower.length - 1 - i + historical.length) * pointSpacing;
        const y = 100 - ((v - min) / range) * 80 - 10;
        return `${x},${y}`;
      })
      .join(" L") +
    " Z";

  const colorMap: Record<string, string> = {
    cyan: "#22d3ee",
    purple: "#a855f7",
    green: "#22c55e",
    amber: "#f59e0b",
  };

  return (
    <svg viewBox="0 0 100 100" className="w-full h-32" preserveAspectRatio="none">
      <line x1={histWidth} y1="0" x2={histWidth} y2="100" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
      <path d={confidencePath} fill={colorMap[color]} fillOpacity="0.15" />
      <path d={toPath(historical)} stroke={colorMap[color]} strokeWidth="1.5" fill="none" />
      <path d={toPath(forecast, historical.length - 1)} stroke={colorMap[color]} strokeWidth="1.5" strokeDasharray="2,2" fill="none" />
      {historical.map((v, i) => {
        const x = i * pointSpacing;
        const y = 100 - ((v - min) / range) * 80 - 10;
        return <circle key={i} cx={x} cy={y} r="0.8" fill={colorMap[color]} />;
      })}
    </svg>
  );
}

export default function PredictiveForecasting() {
  const [selectedModel, setSelectedModel] = useState<ModelType>("prophet");
  const [isRetraining, setIsRetraining] = useState(false);
  const [retrainProgress, setRetrainProgress] = useState(0);

  const { data } = useQuery({
    queryKey: ["predictive-forecasting"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/advanced/forecasting");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { forecasts: MOCK_FORECASTS };
      }
    },
  });

  const forecasts: ForecastSeries[] = data?.forecasts || MOCK_FORECASTS;

  const handleRetrain = () => {
    setIsRetraining(true);
    setRetrainProgress(0);
    const interval = setInterval(() => {
      setRetrainProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setIsRetraining(false);
          return 100;
        }
        return p + 10;
      });
    }, 200);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40">
            <Brain className="h-7 w-7 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מנוע חיזוי מבוסס AI</h1>
            <p className="text-sm text-gray-400">חיזוי סדרות זמן למכירות, ביקושים, תזרים ומלאי</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as ModelType)}
            className="bg-[#111827] border border-[#1f2937] rounded-md px-3 py-2 text-sm"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button onClick={handleRetrain} disabled={isRetraining} className="bg-cyan-600 hover:bg-cyan-700">
            {isRetraining ? (
              <><RefreshCw className="h-4 w-4 ml-2 animate-spin" /> מאמן...</>
            ) : (
              <><Play className="h-4 w-4 ml-2" /> אמן מחדש</>
            )}
          </Button>
        </div>
      </div>

      {isRetraining && (
        <Card className="bg-cyan-500/5 border-cyan-500/30 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400 animate-pulse" />
                <span className="text-sm font-medium">מאמן מודל {MODELS.find((m) => m.value === selectedModel)?.label}...</span>
              </div>
              <span className="text-xs text-cyan-400">{retrainProgress}%</span>
            </div>
            <Progress value={retrainProgress} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#111827] border-[#1f2937] mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              {MODELS.find((m) => m.value === selectedModel)?.label}
            </div>
            <Badge variant="outline" className="border-green-500/40 text-green-400">
              <CheckCircle2 className="h-3 w-3 ml-1" /> פעיל
            </Badge>
          </div>
          <div className="text-xs text-gray-400">{MODELS.find((m) => m.value === selectedModel)?.description}</div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {forecasts.map((f) => {
          const Icon = f.icon;
          const colorClasses: Record<string, string> = {
            cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
            purple: "text-purple-400 bg-purple-500/10 border-purple-500/30",
            green: "text-green-400 bg-green-500/10 border-green-500/30",
            amber: "text-amber-400 bg-amber-500/10 border-amber-500/30",
          };
          const lastHist = f.historical[f.historical.length - 1];
          const lastFC = f.forecast[f.forecast.length - 1];
          const growth = ((lastFC - lastHist) / lastHist * 100).toFixed(1);
          return (
            <Card key={f.id} className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border ${colorClasses[f.color]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-white">{f.titleHe}</CardTitle>
                      <div className="text-xs text-gray-400 mt-0.5">{f.title}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">חיזוי 6 חודשים</div>
                    <div className="text-sm font-bold text-green-400 flex items-center gap-1 justify-end">
                      <TrendingUp className="h-3 w-3" /> +{growth}%
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-2 rounded-lg bg-[#0a0e1a] border border-[#1f2937] mb-3">
                  <MiniChart historical={f.historical} forecast={f.forecast} upper={f.upperBound} lower={f.lowerBound} color={f.color} />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>{MONTHS_HIST[0]}</span>
                    <span>היום</span>
                    <span>{MONTHS_FC[MONTHS_FC.length - 1]}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="text-gray-500">MAE</div>
                    <div className="font-bold text-white">{f.metrics.mae}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="text-gray-500">RMSE</div>
                    <div className="font-bold text-white">{f.metrics.rmse}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="text-gray-500">MAPE</div>
                    <div className="font-bold text-green-400">{f.metrics.mape}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              זיהוי חריגות במודל
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {forecasts.flatMap((f) =>
              f.anomalies.map((a, i) => (
                <div key={`${f.id}-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{f.titleHe}</div>
                    <div className="text-xs text-gray-400 mt-1">{a.reason}</div>
                    <div className="text-[10px] text-gray-500 mt-1">נקודה: {MONTHS_HIST[a.index] || "—"}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-[#1f2937]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-white text-sm">
              <Calendar className="h-4 w-4 text-purple-400" />
              דפוסים עונתיים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="sales">
              <TabsList className="bg-[#0a0e1a] border border-[#1f2937] w-full">
                {forecasts.map((f) => (
                  <TabsTrigger key={f.id} value={f.id} className="text-xs flex-1">
                    {f.titleHe.split(" ")[1]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {forecasts.map((f) => (
                <TabsContent key={f.id} value={f.id} className="mt-3 space-y-2">
                  {f.seasonality.map((s) => (
                    <div key={s.month}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400">רבעון {s.month}</span>
                        <span className="text-purple-400">{(s.strength * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${s.strength * 100}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <div className="text-xs text-purple-400 flex items-center gap-2">
                      <Target className="h-3 w-3" />
                      <span>דפוס מזוהה: עונתיות רבעונית חזקה עם שיאים ברבעון 4</span>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#111827] border-[#1f2937] mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white text-sm">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            השוואת מודלים (מדדי דיוק)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {MODELS.map((m) => {
              const isSelected = m.value === selectedModel;
              const mockMAPE = [5.8, 4.9, 4.2, 3.8, 3.5][MODELS.indexOf(m)];
              return (
                <div
                  key={m.value}
                  onClick={() => setSelectedModel(m.value)}
                  className={`p-3 rounded-lg cursor-pointer border transition-all ${
                    isSelected ? "bg-cyan-500/10 border-cyan-500/40" : "bg-[#0a0e1a] border-[#1f2937] hover:border-cyan-500/20"
                  }`}
                >
                  <div className="text-xs font-semibold">{m.label}</div>
                  <div className="text-[10px] text-gray-500 mt-1 truncate">{m.description}</div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1f2937]">
                    <span className="text-[10px] text-gray-400">MAPE</span>
                    <Badge variant="outline" className={`text-[10px] h-4 ${mockMAPE < 4 ? "border-green-500/40 text-green-400" : "border-amber-500/40 text-amber-400"}`}>
                      {mockMAPE}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
