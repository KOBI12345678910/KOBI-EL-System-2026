import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createServer as createViteServer } from "vite";

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception (kept alive):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection (kept alive):", reason instanceof Error ? reason.message : reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5000;
const isDev = process.env.NODE_ENV !== "production";

async function start() {
  let apiApp: express.Express | null = null;
  try {
    const apiModule = await import("../artifacts/api-server/src/app.js");
    apiApp = apiModule.default;
    console.log("[server] API module loaded");

    if (apiModule.deferredStartup) {
      setTimeout(async () => {
        try {
          await apiModule.deferredStartup();
          console.log("[server] Deferred startup completed");
        } catch (err: any) {
          console.warn("[server] Deferred startup error:", err.message);
        }
      }, 5000);
    }
  } catch (err: any) {
    console.warn("[server] API module load failed, running frontend only:", err.message);
  }

  const app = express();

  if (apiApp) {
    app.use(apiApp);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Running on port ${PORT}`);
  });

  if (isDev) {
    const vite = await createViteServer({
      root: path.resolve(__dirname, "..", "artifacts", "erp-app"),
      configFile: path.resolve(__dirname, "..", "artifacts", "erp-app", "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "..", "artifacts", "erp-app", "dist", "public");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
}

start().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
