import { lazy, Suspense, type ComponentType } from "react";
import { withPage } from "@/components/ui/unified-states";

function ChunkErrorFallback() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px", padding: "32px", textAlign: "center", direction: "rtl" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>⚠️</div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>שגיאה בטעינת הדף</p>
        <p style={{ fontSize: "14px", color: "#6b7280", maxWidth: "300px" }}>לא ניתן היה לטעון את הדף. ייתכן שיש בעיית רשת.</p>
      </div>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: "14px" }}>
        🔄 נסה שוב
      </button>
    </div>
  );
}

export function lazyPage<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> {
  const Lazy = lazy(() =>
    factory().catch(() =>
      factory().catch(() => ({
        default: ChunkErrorFallback as unknown as ComponentType<P>,
      }))
    )
  );
  return withPage<P>(Lazy);
}
