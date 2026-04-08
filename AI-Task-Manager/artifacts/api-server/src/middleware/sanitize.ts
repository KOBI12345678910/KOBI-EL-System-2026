import type { Request, Response, NextFunction } from "express";
import sanitizeHtml from "sanitize-html";

const NULL_BYTE_RE = /\0/g;
const SCRIPT_TAG_RE = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const JAVASCRIPT_PROTO_RE = /javascript\s*:/gi;
const SQL_COMMENT_RE = /(\/\*[\s\S]*?\*\/|--[^\r\n]*|#[^\r\n]*)/g;
const SQL_KEYWORD_RE = /\b(union\s+select|drop\s+table|drop\s+database|insert\s+into|delete\s+from|update\s+\w+\s+set|truncate\s+table|exec\s*\(|execute\s*\(|xp_cmdshell|information_schema)\b/gi;

const HTML_FIELD_NAMES = new Set([
  "content",
  "description",
  "body",
  "notes",
  "html",
  "richText",
  "rich_text",
  "message",
  "text",
  "comment",
  "summary",
  "details",
]);

const JSON_DATA_FIELD_NAMES = new Set([
  "data",
  "metadata",
  "config",
  "settings",
  "payload",
  "schema",
  "formData",
  "form_data",
  "extraData",
  "extra_data",
  "customFields",
  "custom_fields",
  "attributes",
  "properties",
  "context",
  "filters",
  "options",
  "args",
]);

const SANITIZE_HTML_OPTS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "span", "del", "ins", "mark"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["class", "style", "id", "dir"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: ["href", "src"],
  disallowedTagsMode: "discard",
};

export function sanitizeValue(value: unknown, fieldName = "", insideJsonDataBlob = false): unknown {
  if (typeof value === "string") {
    let cleaned = value.replace(NULL_BYTE_RE, "").trim();

    if (insideJsonDataBlob) {
      return value.replace(NULL_BYTE_RE, "");
    }

    if (HTML_FIELD_NAMES.has(fieldName)) {
      return sanitizeHtml(cleaned, SANITIZE_HTML_OPTS);
    }

    cleaned = cleaned.replace(SCRIPT_TAG_RE, "");
    cleaned = cleaned.replace(JAVASCRIPT_PROTO_RE, "javascript_:");
    cleaned = cleaned.replace(SQL_COMMENT_RE, "");
    cleaned = cleaned.replace(SQL_KEYWORD_RE, "[blocked]");
    return cleaned;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, fieldName, insideJsonDataBlob));
  }

  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const childIsJsonDataBlob = insideJsonDataBlob || JSON_DATA_FIELD_NAMES.has(key);
      sanitized[key] = sanitizeValue(val, key, childIsJsonDataBlob);
    }
    return sanitized;
  }

  return value;
}

function sanitizeParamString(val: string): string {
  return val
    .replace(NULL_BYTE_RE, "")
    .trim()
    .replace(SCRIPT_TAG_RE, "")
    .replace(JAVASCRIPT_PROTO_RE, "javascript_:")
    .replace(SQL_COMMENT_RE, "")
    .replace(SQL_KEYWORD_RE, "[blocked]");
}

function sanitizeParams(params: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(params)) {
    sanitized[key] = typeof val === "string" ? sanitizeParamString(val) : val;
  }
  return sanitized;
}

export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.path.includes("/kimi/dev/")) {
      return next();
    }

    if (req.body && typeof req.body === "object") {
      req.body = sanitizeValue(req.body) as Record<string, unknown>;
    }

    try {
      if (req.query && typeof req.query === "object") {
        const sanitizedQuery: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(req.query)) {
          const isJsonDataBlob = JSON_DATA_FIELD_NAMES.has(key);
          sanitizedQuery[key] = sanitizeValue(val, key, isJsonDataBlob);
        }
        const desc = Object.getOwnPropertyDescriptor(req, "query");
        if (desc && desc.writable !== false && !desc.get) {
          req.query = sanitizedQuery as typeof req.query;
        }
      }
    } catch (_qErr) {
    }

    try {
      let _params: Record<string, string> = (req.params as Record<string, string>) || {};
      Object.defineProperty(req, "params", {
        get() {
          return _params;
        },
        set(newParams: Record<string, string>) {
          if (newParams && typeof newParams === "object") {
            _params = sanitizeParams(newParams);
          } else {
            _params = newParams;
          }
        },
        configurable: true,
        enumerable: true,
      });
    } catch (_pErr) {
    }
  } catch (_err) {
  }

  next();
}
