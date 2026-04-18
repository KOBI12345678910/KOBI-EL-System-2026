import { readFile, writeFile, createDirectory } from "./fileTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export interface ProjectRules {
  agent: {
    defaultMode: string;
    autoTest: boolean;
    autoLint: boolean;
    autoSnapshot: boolean;
    autoCommit: boolean;
    maxRetries: number;
    codeStyle: string;
    preferredStack: string[];
  };
  coding: {
    language: string;
    framework: string;
    cssFramework: string;
    stateManagement: string;
    orm: string;
    testFramework: string;
    formatting: {
      indentSize: number;
      useTabs: boolean;
      semicolons: boolean;
      singleQuote: boolean;
      trailingComma: string;
    };
  };
  project: {
    name: string;
    description: string;
    type: string;
    structure: string;
  };
  custom: Record<string, string>;
}

function getDefaultRules(): ProjectRules {
  return {
    agent: {
      defaultMode: "power",
      autoTest: true,
      autoLint: true,
      autoSnapshot: true,
      autoCommit: false,
      maxRetries: 5,
      codeStyle: "clean, well-typed TypeScript with error handling",
      preferredStack: ["TypeScript", "React", "Node.js", "PostgreSQL", "Tailwind CSS"],
    },
    coding: {
      language: "typescript",
      framework: "express",
      cssFramework: "tailwindcss",
      stateManagement: "zustand",
      orm: "drizzle",
      testFramework: "vitest",
      formatting: {
        indentSize: 2,
        useTabs: false,
        semicolons: true,
        singleQuote: true,
        trailingComma: "es5",
      },
    },
    project: {
      name: "kobi-project",
      description: "",
      type: "fullstack",
      structure: "src/",
    },
    custom: {},
  };
}

function parseMarkdownRules(content: string): ProjectRules {
  const rules = getDefaultRules();

  const getValue = (label: string): string | undefined => {
    const match = content.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*(.+)`, "i"));
    return match?.[1]?.trim();
  };

  const name = getValue("Name"); if (name) rules.project.name = name;
  const type = getValue("Type"); if (type) rules.project.type = type;
  const desc = getValue("Description"); if (desc) rules.project.description = desc;
  const mode = getValue("Default Mode"); if (mode) rules.agent.defaultMode = mode;
  const lang = getValue("Language"); if (lang) rules.coding.language = lang;
  const fw = getValue("Framework"); if (fw) rules.coding.framework = fw;
  const css = getValue("CSS"); if (css) rules.coding.cssFramework = css;
  const orm = getValue("ORM"); if (orm) rules.coding.orm = orm;
  const tests = getValue("Tests"); if (tests) rules.coding.testFramework = tests;
  const style = getValue("Code Style"); if (style) rules.agent.codeStyle = style;
  const autoTest = getValue("Auto Test"); if (autoTest) rules.agent.autoTest = autoTest === "true";
  const autoLint = getValue("Auto Lint"); if (autoLint) rules.agent.autoLint = autoLint === "true";

  return rules;
}

async function loadRules(): Promise<ProjectRules> {
  const mdResult = await readFile({ path: `${WORKSPACE}/kobi.md` });
  if (mdResult.success && mdResult.output) {
    return parseMarkdownRules(mdResult.output);
  }

  const jsonResult = await readFile({ path: `${WORKSPACE}/.kobi.json` });
  if (jsonResult.success && jsonResult.output) {
    try { return JSON.parse(jsonResult.output); } catch {}
  }

  return getDefaultRules();
}

function rulesToMarkdown(rules: ProjectRules): string {
  return `# Kobi Agent Rules

## Project
- **Name**: ${rules.project.name}
- **Type**: ${rules.project.type}
- **Description**: ${rules.project.description}

## Agent Settings
- **Default Mode**: ${rules.agent.defaultMode}
- **Auto Test**: ${rules.agent.autoTest}
- **Auto Lint**: ${rules.agent.autoLint}
- **Auto Snapshot**: ${rules.agent.autoSnapshot}
- **Auto Commit**: ${rules.agent.autoCommit}
- **Max Retries**: ${rules.agent.maxRetries}
- **Code Style**: ${rules.agent.codeStyle}
- **Stack**: ${rules.agent.preferredStack.join(", ")}

## Coding Standards
- **Language**: ${rules.coding.language}
- **Framework**: ${rules.coding.framework}
- **CSS**: ${rules.coding.cssFramework}
- **State**: ${rules.coding.stateManagement}
- **ORM**: ${rules.coding.orm}
- **Tests**: ${rules.coding.testFramework}

## Formatting
- **Indent**: ${rules.coding.formatting.indentSize} ${rules.coding.formatting.useTabs ? "tabs" : "spaces"}
- **Quotes**: ${rules.coding.formatting.singleQuote ? "single" : "double"}
- **Semicolons**: ${rules.coding.formatting.semicolons ? "yes" : "no"}
- **Trailing Comma**: ${rules.coding.formatting.trailingComma}

## Custom Rules
${Object.entries(rules.custom).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}
`;
}

export async function getRules(params: {}): Promise<{ success: boolean; output: string; rules?: ProjectRules }> {
  const rules = await loadRules();
  return { success: true, output: `📋 חוקי פרויקט:\n${rulesToMarkdown(rules)}`, rules };
}

export async function updateRules(params: {
  agent?: Partial<ProjectRules["agent"]>;
  coding?: Partial<ProjectRules["coding"]>;
  project?: Partial<ProjectRules["project"]>;
  custom?: Record<string, string>;
}): Promise<{ success: boolean; output: string }> {
  const rules = await loadRules();

  if (params.agent) Object.assign(rules.agent, params.agent);
  if (params.coding) Object.assign(rules.coding, params.coding);
  if (params.project) Object.assign(rules.project, params.project);
  if (params.custom) Object.assign(rules.custom, params.custom);

  await writeFile({ path: `${WORKSPACE}/.kobi.json`, content: JSON.stringify(rules, null, 2) });
  await writeFile({ path: `${WORKSPACE}/kobi.md`, content: rulesToMarkdown(rules) });

  const changed = Object.keys(params).filter(k => (params as any)[k]);
  return { success: true, output: `📋 חוקים עודכנו: ${changed.join(", ")}` };
}

export async function setCustomRule(params: {
  key: string;
  value: string;
}): Promise<{ success: boolean; output: string }> {
  const rules = await loadRules();
  rules.custom[params.key] = params.value;

  await writeFile({ path: `${WORKSPACE}/.kobi.json`, content: JSON.stringify(rules, null, 2) });
  await writeFile({ path: `${WORKSPACE}/kobi.md`, content: rulesToMarkdown(rules) });

  return { success: true, output: `📋 חוק מותאם: ${params.key} = ${params.value}` };
}

export async function getAgentContext(params: {}): Promise<{ success: boolean; output: string }> {
  const rules = await loadRules();

  const context = `Project Rules:
- Language: ${rules.coding.language}
- Framework: ${rules.coding.framework}
- CSS: ${rules.coding.cssFramework}
- ORM: ${rules.coding.orm}
- Tests: ${rules.coding.testFramework}
- Style: ${rules.agent.codeStyle}
- Preferred Stack: ${rules.agent.preferredStack.join(", ")}
- Formatting: ${rules.coding.formatting.indentSize} spaces, ${rules.coding.formatting.singleQuote ? "single" : "double"} quotes, ${rules.coding.formatting.semicolons ? "semicolons" : "no semicolons"}
${Object.entries(rules.custom).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`;

  return { success: true, output: context };
}

export async function initRules(params: {
  projectName: string;
  projectType?: string;
  description?: string;
}): Promise<{ success: boolean; output: string }> {
  const rules = getDefaultRules();
  rules.project.name = params.projectName;
  rules.project.type = params.projectType || "fullstack";
  rules.project.description = params.description || "";

  await writeFile({ path: `${WORKSPACE}/.kobi.json`, content: JSON.stringify(rules, null, 2) });
  await writeFile({ path: `${WORKSPACE}/kobi.md`, content: rulesToMarkdown(rules) });

  return { success: true, output: `📋 חוקי פרויקט אותחלו: ${params.projectName} (${rules.project.type})` };
}

export const RULES_SYNC_TOOLS = [
  {
    name: "get_rules",
    description: "קבלת חוקי הפרויקט — agent, coding, formatting, custom rules",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "update_rules",
    description: "עדכון חוקי פרויקט — agent settings, coding standards, formatting",
    input_schema: {
      type: "object" as const,
      properties: {
        agent: { type: "object", description: "הגדרות agent (defaultMode, autoTest, autoLint...)" },
        coding: { type: "object", description: "סטנדרטים (language, framework, orm...)" },
        project: { type: "object", description: "פרטי פרויקט (name, type, description)" },
        custom: { type: "object", description: "חוקים מותאמים אישית" },
      },
      required: [] as string[],
    },
  },
  {
    name: "set_custom_rule",
    description: "הגדרת חוק מותאם אישית — key/value",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "שם החוק" },
        value: { type: "string", description: "ערך החוק" },
      },
      required: ["key", "value"] as string[],
    },
  },
  {
    name: "get_agent_context",
    description: "קבלת הקשר agent — system prompt עם כל החוקים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "init_rules",
    description: "אתחול חוקי פרויקט חדש — kobi.md + .kobi.json",
    input_schema: {
      type: "object" as const,
      properties: {
        projectName: { type: "string", description: "שם הפרויקט" },
        projectType: { type: "string", description: "סוג: fullstack, api, frontend, mobile" },
        description: { type: "string", description: "תיאור הפרויקט" },
      },
      required: ["projectName"] as string[],
    },
  },
];
