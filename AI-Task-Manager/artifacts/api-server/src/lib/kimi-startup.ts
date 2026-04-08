import Kimi from "./kimi-production";

export async function kimiStartup(): Promise<void> {
  console.log("[Kimi] מאתחל תת-מערכת AI...");

  const health = await Kimi.health();

  if (!health.ok) {
    console.error(`[Kimi] אתחול נכשל: ${health.error}`);
    console.error("[Kimi] בדוק:");
    console.error("  1. KIMI_API_KEY מוגדר ב-Secrets");
    console.error("  2. המפתח מתחיל ב-sk-");
    console.error("  3. יש מכסה זמינה בחשבון");

    if (process.env.KIMI_REQUIRED === "true") {
      process.exit(1);
    } else {
      console.warn("[Kimi] ממשיך ללא Kimi (מצב מוגבל)");
      return;
    }
  }

  const status = Kimi.status();
  console.log(`[Kimi] מוכן — השהיה: ${health.latencyMs}ms, circuit: ${status.circuit}`);
}
