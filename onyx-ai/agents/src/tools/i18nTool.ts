import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile, readFile, listFiles } from "./fileTool";
import { searchCode } from "./searchTool";

function stringToKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 50);
}

export async function extractStrings(params: { filePattern?: string }): Promise<{ success: boolean; output: string; strings?: Record<string, string> }> {
  const pattern = params.filePattern || "**/*.{tsx,jsx}";
  const results = await searchCode({ pattern: `["'\`]([A-Z][a-zA-Z\\s,.'!?]+)["'\`]`, filePattern: pattern });

  const strings: Record<string, string> = {};
  const lines = (results.output || "").split("\n");
  for (const line of lines) {
    const match = line.match(/["'`]([A-Z][a-zA-Z\s,.'!?]{3,})["'`]/);
    if (match) {
      const key = stringToKey(match[1]);
      strings[key] = match[1];
    }
  }

  return { success: true, output: `Extracted ${Object.keys(strings).length} translatable strings`, strings };
}

export async function generateTranslations(params: { sourceStrings: Record<string, string>; targetLanguages: string[] }): Promise<{ success: boolean; output: string; translations?: Record<string, Record<string, string>> }> {
  const translations: Record<string, Record<string, string>> = {};

  for (const lang of params.targetLanguages) {
    const response = await callLLM({
      system: `You are a professional translator. Translate all strings to ${lang}. Maintain the exact same keys. Ensure translations are natural and contextually appropriate. Respond with ONLY a JSON object mapping keys to translated strings.`,
      messages: [{ role: "user", content: `Translate to ${lang}:\n${JSON.stringify(params.sourceStrings, null, 2)}` }],
    });

    const text = extractTextContent(response.content);
    translations[lang] = extractJSON(text) || {};
  }

  return { success: true, output: `Generated translations for ${params.targetLanguages.length} languages: ${params.targetLanguages.join(", ")}`, translations };
}

export async function setupI18n(params: { languages: string[] }): Promise<{ success: boolean; output: string; files?: string[] }> {
  const languages = params.languages;
  const files: string[] = [];

  const extractResult = await extractStrings({});
  const sourceStrings = extractResult.strings || {};

  await writeFile({ path: "src/i18n/locales/en.json", content: JSON.stringify(sourceStrings, null, 2) });
  files.push("src/i18n/locales/en.json");

  const transResult = await generateTranslations({ sourceStrings, targetLanguages: languages });
  const translations = transResult.translations || {};

  for (const [lang, trans] of Object.entries(translations)) {
    await writeFile({ path: `src/i18n/locales/${lang}.json`, content: JSON.stringify(trans, null, 2) });
    files.push(`src/i18n/locales/${lang}.json`);
  }

  const configContent = `import en from './locales/en.json';
${languages.map(l => `import ${l} from './locales/${l}.json';`).join("\n")}

export type Locale = 'en' | ${languages.map(l => `'${l}'`).join(" | ")};

const translations: Record<Locale, Record<string, string>> = {
  en,
  ${languages.join(",\n  ")},
};

let currentLocale: Locale = 'en';

export function setLocale(locale: Locale) {
  currentLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = ['ar', 'he', 'fa'].includes(locale) ? 'rtl' : 'ltr';
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[currentLocale]?.[key] || translations.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(\`{{\${k}}}\`, String(v));
    }
  }
  return text;
}

export function getLocale(): Locale { return currentLocale; }
export function getAvailableLocales(): Locale[] { return ['en', ${languages.map(l => `'${l}'`).join(", ")}]; }
`;
  await writeFile({ path: "src/i18n/index.ts", content: configContent });
  files.push("src/i18n/index.ts");

  const hookContent = `import { useState, useCallback, useEffect } from 'react';
import { t, setLocale, getLocale, Locale, getAvailableLocales } from './index';

export function useTranslation() {
  const [locale, setCurrentLocale] = useState<Locale>(getLocale());
  const [, forceUpdate] = useState(0);

  const changeLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale);
    setCurrentLocale(newLocale);
    forceUpdate((n) => n + 1);
    localStorage.setItem('locale', newLocale);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale;
    if (saved && getAvailableLocales().includes(saved)) {
      changeLocale(saved);
    }
  }, [changeLocale]);

  return { t, locale, changeLocale, availableLocales: getAvailableLocales() };
}
`;
  await writeFile({ path: "src/i18n/useTranslation.ts", content: hookContent });
  files.push("src/i18n/useTranslation.ts");

  return { success: true, output: `i18n setup complete with ${files.length} files for languages: en, ${languages.join(", ")}`, files };
}

export const I18N_TOOLS = [
  { name: "extract_strings", description: "Extract translatable strings from source code (TSX/JSX files)", input_schema: { type: "object" as const, properties: { filePattern: { type: "string", description: "Glob pattern for files to scan (default: **/*.{tsx,jsx})" } }, required: [] as string[] } },
  { name: "generate_translations", description: "Generate translations for strings into target languages using AI", input_schema: { type: "object" as const, properties: { sourceStrings: { type: "object", description: "Key-value pairs of strings to translate" }, targetLanguages: { type: "array", items: { type: "string" }, description: "Target language codes (e.g. he, ar, fr, es)" } }, required: ["sourceStrings", "targetLanguages"] as string[] } },
  { name: "setup_i18n", description: "Full i18n setup: extract strings, generate translations, create config, React hook, locale files", input_schema: { type: "object" as const, properties: { languages: { type: "array", items: { type: "string" }, description: "Target language codes (e.g. ['he', 'ar'])" } }, required: ["languages"] as string[] } },
];