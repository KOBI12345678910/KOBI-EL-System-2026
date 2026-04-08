import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChartData { type: "bar" | "pie"; title?: string; data: Array<{ label: string; value: number }>; }

function KimiChart({ chart }: { chart: ChartData }) {
  if (!chart.data || chart.data.length === 0) return null;
  const maxVal = Math.max(...chart.data.map(d => d.value), 1);
  const total = chart.data.reduce((s, d) => s + d.value, 0);
  const COLORS = ["#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];

  if (chart.type === "pie") {
    if (total === 0) return null;
    let cumPercent = 0;
    const segments = chart.data.map((d, i) => {
      const percent = (d.value / total) * 100;
      const start = cumPercent;
      cumPercent += percent;
      return { ...d, percent, start, color: COLORS[i % COLORS.length] };
    });
    const gradientStops = segments.map(s => `${s.color} ${s.start}% ${s.start + s.percent}%`).join(", ");
    return (
      <div className="my-3 bg-black/20 rounded-lg p-3 border border-border">
        {chart.title && <div className="text-xs font-medium text-gray-300 mb-3 text-center">{chart.title}</div>}
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-full flex-shrink-0" style={{ background: `conic-gradient(${gradientStops})` }} />
          <div className="space-y-1 flex-1">
            {segments.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="text-muted-foreground flex-1 truncate">{s.label}</span>
                <span className="text-gray-300 font-mono">{s.value.toLocaleString()}</span>
                <span className="text-muted-foreground w-10 text-left">{s.percent.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 bg-black/20 rounded-lg p-3 border border-border">
      {chart.title && <div className="text-xs font-medium text-gray-300 mb-3 text-center">{chart.title}</div>}
      <div className="space-y-1.5">
        {chart.data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 text-left truncate">{d.label}</span>
            <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
              <div className="h-full rounded transition-all flex items-center justify-end px-1.5"
                style={{ width: `${Math.max((d.value / maxVal) * 100, 2)}%`, background: COLORS[i % COLORS.length] }}>
                <span className="text-[9px] text-foreground font-mono">{d.value.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function extractChartBlocks(text: string): Array<{ chart: ChartData; placeholder: string }> {
  const blocks: Array<{ chart: ChartData; placeholder: string }> = [];
  const regex = /```kimi-chart\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.data) {
        blocks.push({ chart: parsed, placeholder: match[0] });
      }
    } catch {}
  }
  return blocks;
}

export default function RenderContentWithCharts({ content }: { content: string }) {
  const chartBlocks = extractChartBlocks(content);
  if (chartBlocks.length === 0) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  let remaining = content;
  const parts: Array<{ type: "text" | "chart"; content?: string; chart?: ChartData }> = [];
  for (const block of chartBlocks) {
    const idx = remaining.indexOf(block.placeholder);
    if (idx >= 0) {
      const before = remaining.slice(0, idx);
      if (before.trim()) parts.push({ type: "text", content: before });
      parts.push({ type: "chart", chart: block.chart });
      remaining = remaining.slice(idx + block.placeholder.length);
    }
  }
  if (remaining.trim()) parts.push({ type: "text", content: remaining });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "chart" && p.chart ? (
          <KimiChart key={i} chart={p.chart} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{p.content || ""}</ReactMarkdown>
        )
      )}
    </>
  );
}
