import { writeFile } from "./fileTool";

interface AnalyticsEvent { name: string; properties: Record<string, any>; timestamp: string; userId?: string; sessionId?: string }
const events: AnalyticsEvent[] = [];
const MAX_EVENTS = 10000;

export async function trackEvent(params: { name: string; properties?: Record<string, any>; userId?: string; sessionId?: string }): Promise<{ success: boolean; output: string }> {
  events.push({ name: params.name, properties: params.properties || {}, timestamp: new Date().toISOString(), userId: params.userId, sessionId: params.sessionId });
  if (events.length > MAX_EVENTS) events.shift();
  return { success: true, output: `Tracked event "${params.name}"` };
}

export async function getAnalytics(params: { event?: string; from?: string; to?: string; groupBy?: string }): Promise<{ success: boolean; output: string }> {
  let filtered = events;
  if (params.event) filtered = filtered.filter(e => e.name === params.event);
  if (params.from) filtered = filtered.filter(e => e.timestamp >= params.from!);
  if (params.to) filtered = filtered.filter(e => e.timestamp <= params.to!);

  if (params.groupBy === "event") {
    const groups: Record<string, number> = {};
    for (const e of filtered) groups[e.name] = (groups[e.name] || 0) + 1;
    return { success: true, output: Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}: ${c}`).join("\n") };
  }

  return { success: true, output: `Total events: ${filtered.length}\n${filtered.slice(-20).map(e => `[${e.timestamp}] ${e.name}${e.userId ? ` (user:${e.userId})` : ""}`).join("\n")}` };
}

export async function getTopEvents(params: { limit?: number }): Promise<{ success: boolean; output: string }> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.name] = (counts[e.name] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, params.limit || 20);
  return { success: true, output: sorted.map(([n, c], i) => `${i + 1}. ${n}: ${c}`).join("\n") || "No events tracked" };
}

export async function generateAnalyticsSetup(params: { provider?: string }): Promise<{ success: boolean; output: string }> {
  const provider = params.provider || "custom";
  const code = provider === "ga4" ? `
declare global { interface Window { gtag: (...args: any[]) => void } }
const GA_ID = import.meta.env.VITE_GA_ID;
export function initGA() { const s = document.createElement('script'); s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID; document.head.appendChild(s); window.gtag = function() { (window as any).dataLayer = (window as any).dataLayer || []; (window as any).dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', GA_ID); }
export function trackEvent(name: string, params?: Record<string, any>) { window.gtag('event', name, params); }
export function trackPageView(path: string) { window.gtag('config', GA_ID, { page_path: path }); }
` : `
const events: Array<{ name: string; data: any; ts: number }> = [];
export function track(name: string, data?: Record<string, any>) { events.push({ name, data: data || {}, ts: Date.now() }); if (events.length > 5000) events.shift(); }
export function getEvents() { return events; }
export function trackPageView(path: string) { track('page_view', { path }); }
`;
  await writeFile({ path: "src/lib/analytics.ts", content: code.trim() });
  return { success: true, output: `Analytics setup generated → src/lib/analytics.ts (${provider})` };
}

export const ANALYTICS_TOOLS = [
  { name: "track_event", description: "Track an analytics event with properties", input_schema: { type: "object" as const, properties: { name: { type: "string" }, properties: { type: "object" }, userId: { type: "string" }, sessionId: { type: "string" } }, required: ["name"] as string[] } },
  { name: "get_analytics", description: "Query analytics events with filters and grouping", input_schema: { type: "object" as const, properties: { event: { type: "string" }, from: { type: "string" }, to: { type: "string" }, groupBy: { type: "string", enum: ["event", "user", "day"] } }, required: [] as string[] } },
  { name: "get_top_events", description: "Get most frequent tracked events", input_schema: { type: "object" as const, properties: { limit: { type: "number" } }, required: [] as string[] } },
  { name: "generate_analytics_setup", description: "Generate client-side analytics tracking code (GA4 or custom)", input_schema: { type: "object" as const, properties: { provider: { type: "string", enum: ["ga4", "mixpanel", "custom"] } }, required: [] as string[] } },
];