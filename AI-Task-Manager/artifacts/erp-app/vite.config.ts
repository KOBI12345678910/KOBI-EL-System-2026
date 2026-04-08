import { defineConfig, type Plugin } from "vite";
import type { OutputChunk } from "rollup";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

function injectModulePreloadPlugin(): Plugin {
  return {
    name: "inject-critical-modulepreload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const base = basePath.replace(/\/$/, "");
        const hints: string[] = [];
        const DASHBOARD_MODULE = "src/pages/reports/kpi-dashboard.tsx";
        for (const [key, rawChunk] of Object.entries(ctx.bundle)) {
          if (rawChunk.type !== "chunk") continue;
          const chunk = rawChunk as OutputChunk;
          const isNamedVendor = chunk.name === "vendor";
          const isNamedReactQuery = chunk.name === "react-query";
          const isDashboardChunk =
            !chunk.isEntry &&
            Object.keys(chunk.modules ?? {}).some((m) =>
              m.includes(DASHBOARD_MODULE)
            );
          if (isNamedVendor || isNamedReactQuery || isDashboardChunk) {
            hints.push(`  <link rel="modulepreload" href="${base}/${key}" />`);
          }
        }
        if (hints.length === 0) return html;
        return html.replace("</head>", `${hints.join("\n")}\n</head>`);
      },
    },
  };
}

const rawPort = process.env.PORT || "23023";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" ? [runtimeErrorOverlay()] : []),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw-custom.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      base: basePath,
      includeAssets: ["favicon.ico", "icons/*.png", "icons/*.svg"],
      manifest: {
        name: "טכנו-כל עוזי | מערכת ERP",
        short_name: "ERP עוזי",
        description: "מערכת ERP מתקדמת לניהול מפעל מתכת, אלומיניום, נירוסטה וזכוכית",
        theme_color: "#6366f1",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait-primary",
        lang: "he",
        dir: "rtl",
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        categories: ["business", "productivity"],
        screenshots: [],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}"],
      },
      devOptions: {
        enabled: false,
        type: "module",
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
    injectModulePreloadPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "react": path.resolve(import.meta.dirname, "node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(import.meta.dirname, "node_modules/react/jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(import.meta.dirname, "node_modules/react/jsx-dev-runtime"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          "react-query": ["@tanstack/react-query"],
          router: ["wouter"],
          "framer-motion": ["framer-motion"],
          recharts: ["recharts"],
          "radix-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          leaflet: ["leaflet", "react-leaflet"],
          xlsx: ["xlsx"],
          jspdf: ["jspdf", "jspdf-autotable"],
          exceljs: ["exceljs"],
          "monaco-editor": ["@monaco-editor/react"],
          xyflow: ["@xyflow/react"],
          uppy: ["@uppy/core", "@uppy/dashboard", "@uppy/react", "@uppy/aws-s3"],
          "date-fns": ["date-fns"],
          "lucide-react": ["lucide-react"],
          sentry: ["@sentry/react"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    target: "es2020",
    cssCodeSplit: true,
    modulePreload: {
      polyfill: true,
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "wouter",
      "@tanstack/react-query",
      "framer-motion",
      "lucide-react",
      "recharts",
      "date-fns",
      "clsx",
      "tailwind-merge",
      "zod",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "class-variance-authority",
      "cmdk",
      "leaflet",
      "react-leaflet",
      "xlsx",
      "jspdf",
      "jspdf-autotable",
      "exceljs",
      "@monaco-editor/react",
      "@xyflow/react",
      "@uppy/core",
      "@uppy/dashboard",
      "@uppy/react",
      "@uppy/aws-s3",
      "@sentry/react",
      "sonner",
      "vaul",
      "embla-carousel-react",
      "react-day-picker",
      "react-resizable-panels",
      "react-markdown",
      "remark-gfm",
      "react-icons",
      "idb",
      "qrcode",
      "driver.js",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
    holdUntilCrawlEnd: false,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      timeout: 30000,
      overlay: true,
    },
    watch: {
      usePolling: false,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        headers: {
          Connection: "keep-alive",
        },
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const upgrade = req.headers["upgrade"];
            if (upgrade) {
              proxyReq.setHeader("Upgrade", upgrade);
              proxyReq.setHeader("Connection", "Upgrade");
            }
          });
        },
      },
    },
    warmup: {
      clientFiles: [
        "./src/App.tsx",
        "./src/routes/lazy-utils.tsx",
        "./src/routes/finance-routes.tsx",
        "./src/routes/hr-routes.tsx",
        "./src/routes/crm-routes.tsx",
        "./src/routes/production-routes.tsx",
        "./src/routes/procurement-routes.tsx",
        "./src/routes/builder-routes.tsx",
        "./src/routes/sales-routes.tsx",
        "./src/routes/inventory-routes.tsx",
        "./src/routes/platform-routes.tsx",
        "./src/routes/ai-routes.tsx",
        "./src/routes/other-routes.tsx",
        "./src/components/layout.tsx",
        "./src/pages/login.tsx",
        "./src/pages/dashboard.tsx",
        "./src/pages/reports/kpi-dashboard.tsx",
        "./src/hooks/use-auth.tsx",
        "./src/hooks/use-permissions.tsx",
        "./src/lib/utils.ts",
      ],
    },
    fs: {
      strict: true,
      allow: [
        import.meta.dirname,
        path.resolve(import.meta.dirname, "src"),
        path.resolve(import.meta.dirname, "public"),
        path.resolve(import.meta.dirname, "node_modules"),
        path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
        path.resolve(import.meta.dirname, "..", "api-client-react", "src"),
        path.resolve(import.meta.dirname, "..", "object-storage-web", "src"),
      ],
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
