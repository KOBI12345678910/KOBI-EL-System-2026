import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, readFile } from "./fileTool";

function cleanCode(response: any): string {
  return extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

export async function generateMonacoEditor(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React Monaco Editor component. Requirements:
- TypeScript support with language detection
- Dark theme matching VS Code Dark+
- Multiple tabs support
- File save handler (Ctrl+S)
- Syntax highlighting for JS/TS/JSON/CSS/HTML
- RTL-safe container
- Tailwind CSS wrapper
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate a full Monaco Editor component with tabs and file management" }],
    maxTokens: 4096,
  });
  await writeFile({ path: "src/components/editor/MonacoEditor.tsx", content: cleanCode(response) });
  return { success: true, output: "Monaco Editor component → src/components/editor/MonacoEditor.tsx" };
}

export async function generateTerminalUI(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React terminal component using xterm.js. Requirements:
- WebSocket connection to backend PTY
- Dark theme, proper font (monospace)
- Copy/paste support
- Resize handling (FitAddon)
- Multiple terminal tabs
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate an xterm.js terminal component" }],
    maxTokens: 4096,
  });
  await writeFile({ path: "src/components/terminal/Terminal.tsx", content: cleanCode(response) });
  return { success: true, output: "Terminal UI component → src/components/terminal/Terminal.tsx" };
}

export async function generateFileTree(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React file tree component. Requirements:
- Expandable/collapsible folders
- File icons by extension
- Right-click context menu (new file, rename, delete)
- Drag and drop
- Search/filter
- Dark theme, RTL-safe
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate an interactive file tree component" }],
    maxTokens: 4096,
  });
  await writeFile({ path: "src/components/explorer/FileTree.tsx", content: cleanCode(response) });
  return { success: true, output: "File Tree component → src/components/explorer/FileTree.tsx" };
}

export async function generateDiffViewer(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React diff viewer component. Requirements:
- Side-by-side and unified view modes
- Syntax highlighting
- Line numbers
- Expand/collapse unchanged sections
- Dark theme
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate a diff viewer component for code comparison" }],
    maxTokens: 4096,
  });
  await writeFile({ path: "src/components/diff/DiffViewer.tsx", content: cleanCode(response) });
  return { success: true, output: "Diff Viewer component → src/components/diff/DiffViewer.tsx" };
}

export async function generateSplitPane(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React split pane layout component. Requirements:
- Horizontal and vertical splits
- Draggable dividers
- Min/max pane sizes
- Collapse/expand panels
- Persist layout to localStorage
- Dark theme
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate a split pane layout component" }],
    maxTokens: 3000,
  });
  await writeFile({ path: "src/components/layout/SplitPane.tsx", content: cleanCode(response) });
  return { success: true, output: "Split Pane layout → src/components/layout/SplitPane.tsx" };
}

export async function generateResponsivePreview(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React responsive preview component. Requirements:
- Toggle between Mobile (375px), Tablet (768px), Desktop (1280px) viewports
- iframe-based preview with zoom controls
- Device frame mockup
- Dark theme toolbar
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate a responsive preview component with device frames" }],
    maxTokens: 3000,
  });
  await writeFile({ path: "src/components/preview/ResponsivePreview.tsx", content: cleanCode(response) });
  return { success: true, output: "Responsive Preview → src/components/preview/ResponsivePreview.tsx" };
}

export async function generateErrorOverlay(): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React error overlay component like Vite/Next.js error overlay. Requirements:
- Full screen overlay on error
- Stack trace with source code highlight
- Click to open in editor
- Dismiss button
- Dark red/black theme
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: "Generate an error overlay component" }],
    maxTokens: 3000,
  });
  await writeFile({ path: "src/components/error/ErrorOverlay.tsx", content: cleanCode(response) });
  return { success: true, output: "Error Overlay → src/components/error/ErrorOverlay.tsx" };
}

export async function generateSkeletonLoader(params: { componentName: string; layout?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a React skeleton/loading component. Requirements:
- Animated shimmer effect
- Match the layout described
- Dark theme (bg-gray-700/800 shimmer)
- Tailwind CSS
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: `Skeleton for "${params.componentName}" with layout: ${params.layout || "card with title, 3 lines of text, and action buttons"}` }],
    maxTokens: 2000,
  });
  const filePath = `src/components/skeleton/${params.componentName}Skeleton.tsx`;
  await writeFile({ path: filePath, content: cleanCode(response) });
  return { success: true, output: `Skeleton loader → ${filePath}` };
}

export async function generateAIForm(params: { name: string; fields: Array<{ name: string; type: string; label: string; required?: boolean; placeholder?: string; options?: string[]; validation?: string }>; submitUrl?: string }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a complete, production-ready React form component with:
- TypeScript with proper typing
- Tailwind CSS styling (dark mode compatible)
- Client-side validation (without external libraries)
- Error messages per field
- Loading state on submit
- Success/error feedback
- Accessible (proper labels, ARIA, keyboard nav)
- Mobile responsive
- Proper form state management with useState/useReducer
Respond with ONLY the TSX code.`,
    messages: [{ role: "user", content: `Generate form "${params.name}" with fields:\n${JSON.stringify(params.fields, null, 2)}\n\nSubmit: ${params.submitUrl || "console.log"}` }],
    maxTokens: 4096,
  });
  const filePath = `src/components/forms/${params.name}.tsx`;
  await writeFile({ path: filePath, content: cleanCode(response) });
  return { success: true, output: `AI-generated form → ${filePath}\nFields: ${params.fields.map(f => f.name).join(", ")}` };
}

export async function generateAIDataGrid(params: { name: string; columns: Array<{ key: string; label: string; type: string; sortable?: boolean }>; apiEndpoint: string; features?: string[] }): Promise<{ success: boolean; output: string }> {
  const features = params.features || ["pagination", "search", "sort"];
  const response = await callLLM({
    system: `Generate a complete, feature-rich React data grid/table component with:
- TypeScript
- Tailwind CSS (dark mode)
- Features: ${features.join(", ")}
- Server-side pagination via API
- Loading skeleton states
- Empty state
- Responsive (horizontal scroll on mobile)
- Keyboard navigation
- Sort indicators
Respond with ONLY the TSX code.`,
    messages: [{ role: "user", content: `Generate data grid "${params.name}":\nColumns: ${JSON.stringify(params.columns, null, 2)}\nAPI: ${params.apiEndpoint}` }],
    maxTokens: 8192,
  });
  const filePath = `src/components/tables/${params.name}.tsx`;
  await writeFile({ path: filePath, content: cleanCode(response) });
  return { success: true, output: `AI-generated data grid → ${filePath}\nColumns: ${params.columns.map(c => c.key).join(", ")}\nFeatures: ${features.join(", ")}` };
}

export async function generateSkeletonFromComponent(params: { componentFile: string }): Promise<{ success: boolean; output: string }> {
  const content = await readFile({ path: params.componentFile });
  if (!content.success) return { success: false, output: `Cannot read: ${params.componentFile}` };
  const response = await callLLM({
    system: `Generate a skeleton/loading state version of the React component.
Rules:
- Match the exact layout of the original component
- Use Tailwind animate-pulse for skeleton elements
- Replace text with gray rounded bars of appropriate width
- Replace images with gray squares
- Replace buttons with gray rounded rectangles
- Keep the same structure (flexbox, grid, spacing)
- Export as ComponentNameSkeleton
Respond with ONLY the TSX code.`,
    messages: [{ role: "user", content: `Generate skeleton for:\n\`\`\`tsx\n${content.output}\n\`\`\`` }],
    maxTokens: 4096,
  });
  const skeletonFile = params.componentFile.replace(/\.tsx$/, ".skeleton.tsx");
  await writeFile({ path: skeletonFile, content: cleanCode(response) });
  return { success: true, output: `Skeleton generated from existing component → ${skeletonFile}` };
}

export async function generateErrorBoundary(): Promise<{ success: boolean; output: string }> {
  const code = [
    "import { Component, ErrorInfo, ReactNode } from 'react';",
    "",
    "interface Props { children: ReactNode; fallback?: ReactNode; onError?: (error: Error, info: ErrorInfo) => void; }",
    "interface State { hasError: boolean; error: Error | null; }",
    "",
    "export class ErrorBoundary extends Component<Props, State> {",
    "  state: State = { hasError: false, error: null };",
    "",
    "  static getDerivedStateFromError(error: Error): State {",
    "    return { hasError: true, error };",
    "  }",
    "",
    "  componentDidCatch(error: Error, info: ErrorInfo) {",
    "    console.error('ErrorBoundary caught:', error, info);",
    "    this.props.onError?.(error, info);",
    "  }",
    "",
    "  render() {",
    "    if (this.state.hasError) {",
    "      if (this.props.fallback) return this.props.fallback;",
    "      return (",
    '        <div className="min-h-[200px] flex items-center justify-center p-8">',
    '          <div className="text-center">',
    '            <div className="text-4xl mb-4">\\u26A0\\uFE0F</div>',
    '            <h2 className="text-lg font-semibold text-gray-200 mb-2">שגיאה בלתי צפויה</h2>',
    '            <p className="text-sm text-gray-400 mb-4">{this.state.error?.message || "אירעה שגיאה"}</p>',
    "            <button onClick={() => this.setState({ hasError: false, error: null })}",
    '              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">',
    "              נסה שוב",
    "            </button>",
    "          </div>",
    "        </div>",
    "      );",
    "    }",
    "    return this.props.children;",
    "  }",
    "}",
  ].join("\n");
  await writeFile({ path: "src/components/ErrorBoundary.tsx", content: code });
  return { success: true, output: "ErrorBoundary → src/components/ErrorBoundary.tsx\nFeatures: catch errors, custom fallback, onError callback, retry button, Hebrew RTL" };
}

export async function generateCommandPalette(): Promise<{ success: boolean; output: string }> {
  const BT = "`";
  const code = [
    "import { useState, useEffect, useCallback, useRef } from 'react';",
    "",
    "interface Command { id: string; label: string; shortcut?: string; icon?: string; category?: string; action: () => void; }",
    "interface Props { commands: Command[]; }",
    "",
    "export function CommandPalette({ commands }: Props) {",
    "  const [isOpen, setIsOpen] = useState(false);",
    "  const [query, setQuery] = useState('');",
    "  const [selected, setSelected] = useState(0);",
    "  const inputRef = useRef<HTMLInputElement>(null);",
    "",
    "  const filtered = commands.filter(cmd =>",
    "    cmd.label.toLowerCase().includes(query.toLowerCase()) ||",
    "    cmd.category?.toLowerCase().includes(query.toLowerCase())",
    "  );",
    "",
    "  useEffect(() => {",
    "    const handler = (e: KeyboardEvent) => {",
    "      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsOpen(prev => !prev); }",
    "      if (e.key === 'Escape') setIsOpen(false);",
    "    };",
    "    window.addEventListener('keydown', handler);",
    "    return () => window.removeEventListener('keydown', handler);",
    "  }, []);",
    "",
    "  useEffect(() => { if (isOpen) { inputRef.current?.focus(); setQuery(''); setSelected(0); } }, [isOpen]);",
    "",
    "  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {",
    "    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(prev => Math.min(prev + 1, filtered.length - 1)); }",
    "    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(prev => Math.max(prev - 1, 0)); }",
    "    else if (e.key === 'Enter' && filtered[selected]) { filtered[selected].action(); setIsOpen(false); }",
    "  }, [filtered, selected]);",
    "",
    "  if (!isOpen) return null;",
    "",
    "  return (",
    '    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">',
    '      <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />',
    '      <div className="relative w-full max-w-lg bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">',
    '        <div className="flex items-center px-4 border-b border-gray-700">',
    '          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">',
    '            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />',
    "          </svg>",
    "          <input ref={inputRef} value={query}",
    "            onChange={e => { setQuery(e.target.value); setSelected(0); }}",
    "            onKeyDown={handleKeyDown}",
    '            placeholder="הקלד פקודה..."',
    '            className="flex-1 px-3 py-3 bg-transparent text-sm outline-none text-gray-200" />',
    '          <kbd className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">ESC</kbd>',
    "        </div>",
    '        <div className="max-h-72 overflow-y-auto p-1">',
    "          {filtered.map((cmd, i) => (",
    "            <button key={cmd.id} onClick={() => { cmd.action(); setIsOpen(false); }}",
    "              className={" + BT + "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg ${",
    "                i === selected ? 'bg-blue-900/30 text-blue-400' : 'text-gray-300 hover:bg-gray-800'",
    "              }" + BT + "}>",
    '              <div className="flex items-center gap-2">',
    "                {cmd.icon && <span>{cmd.icon}</span>}",
    "                <span>{cmd.label}</span>",
    '                {cmd.category && <span className="text-xs text-gray-500">{cmd.category}</span>}',
    "              </div>",
    '              {cmd.shortcut && <kbd className="text-xs text-gray-500">{cmd.shortcut}</kbd>}',
    "            </button>",
    "          ))}",
    "          {filtered.length === 0 && (",
    '            <div className="p-4 text-center text-sm text-gray-500">לא נמצאו פקודות</div>',
    "          )}",
    "        </div>",
    "      </div>",
    "    </div>",
    "  );",
    "}",
  ].join("\n");
  await writeFile({ path: "src/components/CommandPalette.tsx", content: code });
  return { success: true, output: "CommandPalette → src/components/CommandPalette.tsx\nFeatures: Cmd+K/Ctrl+K shortcut, search, keyboard nav, categories, dark theme, Hebrew" };
}

export const UI_GEN_TOOLS = [
  { name: "generate_monaco_editor", description: "Generate a Monaco Editor component (VS Code-like code editor)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_terminal_ui", description: "Generate an xterm.js terminal component with WebSocket PTY", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_file_tree", description: "Generate an interactive file tree component with context menu", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_diff_viewer", description: "Generate a code diff viewer (side-by-side and unified)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_split_pane", description: "Generate a split pane layout with draggable dividers", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_responsive_preview", description: "Generate a responsive preview with Mobile/Tablet/Desktop viewports", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_error_overlay", description: "Generate an error overlay component with stack trace display", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_skeleton_loader", description: "Generate a skeleton/loading state component with shimmer animation", input_schema: { type: "object" as const, properties: { componentName: { type: "string" }, layout: { type: "string", description: "Describe the layout shape" } }, required: ["componentName"] as string[] } },
  { name: "generate_ai_form", description: "AI-generate a complete React form with validation, loading state, and error handling from field definitions", input_schema: { type: "object" as const, properties: { name: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "email", "password", "number", "select", "textarea", "checkbox", "radio", "date", "file", "phone", "url", "color"] }, label: { type: "string" }, required: { type: "boolean" }, placeholder: { type: "string" }, options: { type: "array", items: { type: "string" } }, validation: { type: "string" } } } }, submitUrl: { type: "string" } }, required: ["name", "fields"] as string[] } },
  { name: "generate_ai_data_grid", description: "AI-generate a feature-rich data grid/table with pagination, search, sort, filters from column definitions", input_schema: { type: "object" as const, properties: { name: { type: "string" }, columns: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, type: { type: "string" }, sortable: { type: "boolean" } } } }, apiEndpoint: { type: "string" }, features: { type: "array", items: { type: "string" } } }, required: ["name", "columns", "apiEndpoint"] as string[] } },
  { name: "generate_skeleton_from_component", description: "Generate a skeleton loading state from an existing React component file (analyzes layout)", input_schema: { type: "object" as const, properties: { componentFile: { type: "string", description: "Path to the existing component file" } }, required: ["componentFile"] as string[] } },
  { name: "generate_error_boundary", description: "Generate React ErrorBoundary component with retry, custom fallback, Hebrew RTL", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_command_palette", description: "Generate Cmd+K command palette component with search, keyboard nav, categories, dark theme", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];
