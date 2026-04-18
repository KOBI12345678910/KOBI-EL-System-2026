import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";
import { installPackage } from "./packageTool";

export interface ScaffoldTemplate {
  name: string;
  files: Record<string, string>;
  packages?: string[];
  devPackages?: string[];
  commands?: string[];
}

function getTemplates(): Record<string, ScaffoldTemplate> {
  return {
    "express-api": {
      name: "Express REST API",
      packages: ["express", "cors", "helmet", "morgan", "dotenv", "zod"],
      devPackages: ["typescript", "tsx", "@types/node", "@types/express", "@types/cors", "@types/morgan", "vitest"],
      files: {
        "tsconfig.json": `{\n  "compilerOptions": {\n    "target": "ES2022", "module": "commonjs", "lib": ["ES2022"],\n    "outDir": "./dist", "rootDir": "./src", "strict": true,\n    "esModuleInterop": true, "skipLibCheck": true,\n    "resolveJsonModule": true, "declaration": true, "sourceMap": true\n  },\n  "include": ["src/**/*"]\n}`,
        "src/index.ts": `import express from 'express';\nimport cors from 'cors';\nimport helmet from 'helmet';\nimport morgan from 'morgan';\nimport { config } from 'dotenv';\nimport { router } from './routes';\nimport { errorHandler, notFound } from './middleware/errorHandler';\n\nconfig();\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\napp.use(helmet());\napp.use(cors());\napp.use(morgan('dev'));\napp.use(express.json());\napp.use(express.urlencoded({ extended: true }));\n\napp.use('/api', router);\napp.use(notFound);\napp.use(errorHandler);\n\napp.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));\nexport default app;`,
        "src/routes/index.ts": `import { Router } from 'express';\nimport { healthRouter } from './health';\n\nexport const router = Router();\nrouter.use('/health', healthRouter);`,
        "src/routes/health.ts": `import { Router, Request, Response } from 'express';\n\nexport const healthRouter = Router();\n\nhealthRouter.get('/', (req: Request, res: Response) => {\n  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });\n});`,
        "src/middleware/errorHandler.ts": `import { Request, Response, NextFunction } from 'express';\n\nexport class AppError extends Error {\n  statusCode: number;\n  constructor(message: string, statusCode: number) {\n    super(message);\n    this.statusCode = statusCode;\n  }\n}\n\nexport function notFound(req: Request, res: Response, next: NextFunction) {\n  next(new AppError(\`Route \${req.originalUrl} not found\`, 404));\n}\n\nexport function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {\n  const statusCode = err.statusCode || 500;\n  res.status(statusCode).json({ error: { message: err.message, status: statusCode } });\n}`,
        "src/middleware/validate.ts": `import { Request, Response, NextFunction } from 'express';\nimport { ZodSchema, ZodError } from 'zod';\n\nexport function validate(schema: ZodSchema) {\n  return (req: Request, res: Response, next: NextFunction) => {\n    try {\n      schema.parse({ body: req.body, query: req.query, params: req.params });\n      next();\n    } catch (err) {\n      if (err instanceof ZodError) {\n        res.status(400).json({ errors: err.errors });\n      } else {\n        next(err);\n      }\n    }\n  };\n}`,
        ".env": "PORT=3000\nNODE_ENV=development",
        ".env.example": "PORT=3000\nNODE_ENV=development",
        ".gitignore": "node_modules/\ndist/\n.env\n.env.local\ncoverage/",
      },
    },
    "react-vite": {
      name: "React + Vite + TailwindCSS",
      commands: ["npm create vite@latest . -- --template react-ts", "npm install", "npm install -D tailwindcss @tailwindcss/vite"],
      files: {
        "vite.config.ts": `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n});`,
        "src/App.tsx": `import { useState } from 'react';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">\n      <h1 className="text-4xl font-bold mb-4">Kobi App</h1>\n      <p className="text-xl mb-8">Count: {count}</p>\n      <button\n        onClick={() => setCount(c => c + 1)}\n        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"\n      >\n        Click me\n      </button>\n    </div>\n  );\n}\n\nexport default App;`,
        "src/index.css": `@import "tailwindcss";`,
      },
    },
    "next-fullstack": {
      name: "Next.js Full-Stack App",
      commands: ["npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias '@/*' --use-npm"],
      files: {
        "app/page.tsx": `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center p-24">\n      <h1 className="text-6xl font-bold text-center mb-8">\n        Welcome to <span className="text-purple-500">Kobi App</span>\n      </h1>\n      <p className="text-xl text-gray-400">Built with Next.js, TypeScript & Tailwind CSS</p>\n    </main>\n  );\n}`,
        "app/api/health/route.ts": `import { NextResponse } from 'next/server';\n\nexport async function GET() {\n  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });\n}`,
      },
    },
    "fastapi": {
      name: "FastAPI Python Backend",
      commands: ["python -m venv venv", "pip install fastapi uvicorn sqlalchemy pydantic python-dotenv"],
      files: {
        "main.py": `from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\nfrom dotenv import load_dotenv\nfrom routes import router\n\nload_dotenv()\napp = FastAPI(title="Kobi API", version="1.0.0")\n\napp.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])\n\napp.include_router(router, prefix="/api")\n\n@app.get("/health")\nasync def health():\n    return {"status": "ok"}\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)\n`,
        "routes/__init__.py": `from fastapi import APIRouter\nrouter = APIRouter()\n\n@router.get("/items")\nasync def get_items():\n    return {"items": []}\n`,
        "models/__init__.py": `from sqlalchemy import create_engine\nfrom sqlalchemy.ext.declarative import declarative_base\nfrom sqlalchemy.orm import sessionmaker\nimport os\n\nDATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")\nengine = create_engine(DATABASE_URL)\nSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)\nBase = declarative_base()\n`,
        "requirements.txt": "fastapi==0.109.0\nuvicorn==0.27.0\nsqlalchemy==2.0.25\npydantic==2.5.3\npython-dotenv==1.0.0\n",
        ".env": "DATABASE_URL=sqlite:///./app.db\nSECRET_KEY=change-me",
      },
    },
    "fullstack-t3": {
      name: "T3 Stack (Next.js + tRPC + Prisma + Tailwind)",
      commands: ["npx create-t3-app@latest . --noGit --CI --trpc --tailwind --prisma --nextAuth --appRouter"],
      files: {},
    },
  };
}

export async function listTemplates(): Promise<{ success: boolean; output: string; templates?: string[] }> {
  const templates = getTemplates();
  const list = Object.entries(templates).map(([key, t]) => `${key}: ${t.name}`);
  return { success: true, output: list.join("\n"), templates: Object.keys(templates) };
}

export async function scaffold(params: { template: string }): Promise<{ success: boolean; output: string }> {
  const template = getTemplates()[params.template];
  if (!template) {
    const available = Object.keys(getTemplates()).join(", ");
    return { success: false, output: `Template '${params.template}' not found. Available: ${available}` };
  }

  let output = `Scaffolding: ${template.name}\n`;

  if (template.commands) {
    for (const cmd of template.commands) {
      output += `\n> ${cmd}\n`;
      const result = await runCommand({ command: cmd, timeout: 300000 });
      output += result.stdout + "\n";
      if (!result.success) output += `Warning: ${result.stderr}\n`;
    }
  }

  if (template.packages?.length) {
    output += `\nInstalling: ${template.packages.join(", ")}\n`;
    await installPackage({ packages: template.packages });
  }
  if (template.devPackages?.length) {
    output += `Installing dev: ${template.devPackages.join(", ")}\n`;
    await installPackage({ packages: template.devPackages, dev: true });
  }

  for (const [filePath, content] of Object.entries(template.files)) {
    await writeFile({ path: filePath, content });
    output += `Created: ${filePath}\n`;
  }

  return { success: true, output };
}

export const SCAFFOLD_TOOLS = [
  {
    name: "list_templates",
    description: "List available project scaffold templates (express-api, react-vite, next-fullstack, fastapi, fullstack-t3)",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "scaffold",
    description: "Scaffold a new project from a template (express-api, react-vite, next-fullstack, fastapi, fullstack-t3)",
    input_schema: {
      type: "object" as const,
      properties: {
        template: { type: "string", description: "Template name: express-api, react-vite, next-fullstack, fastapi, fullstack-t3" },
      },
      required: ["template"] as string[],
    },
  },
];