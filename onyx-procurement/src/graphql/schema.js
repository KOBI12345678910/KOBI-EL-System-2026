/**
 * GraphQL Schema + Executor — Zero-dependency GraphQL-like runtime.
 *
 * Agent X82 — Kobi's mega-ERP for Techno-Kol Uzi.
 * Wave: API / Gateway primitives.
 *
 * Zero runtime dependencies. Pure CommonJS. Node >= 16.
 * Bilingual: Hebrew descriptions are preserved alongside English.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 *
 * ════════════════════════════════════════════════════════════════════
 * What this module is / מה המודול הזה
 * ════════════════════════════════════════════════════════════════════
 *
 * A minimal, hand-rolled GraphQL-compatible runtime built with Node
 * built-ins only. It is *not* a drop-in replacement for `graphql-js`
 * but covers the subset that the ERP backend actually uses:
 *
 *   SDL parser   — types, inputs, enums, unions, interfaces,
 *                  directives, descriptions, default values
 *   Executor     — queries / mutations / subscriptions with
 *                  variables, aliases, fragments (named + inline),
 *                  @skip / @include, enum coercion, input types,
 *                  list/non-null coercion
 *   Middleware   — Express-compatible handler for POST /graphql
 *   Security     — depth limit, complexity limit, cost analysis
 *   Introspection — __schema, __type (minimal)
 *
 * Why reinvent this? Techno-Kol Uzi's deployment target has no
 * external npm install at runtime, and the full `graphql` package is
 * ~300 KB of surface area. This module is ~1400 LoC of pure JS.
 *
 * ════════════════════════════════════════════════════════════════════
 * Public API / API ציבורי
 * ════════════════════════════════════════════════════════════════════
 *
 *   const {
 *     buildSchema,         // (sdl) -> Schema
 *     execute,             // (schema, query, variables, context, rootValue) -> Promise<result>
 *     createServer,        // (schema, resolvers, options) -> (req, res, next)
 *     introspectionQuery,  // () -> SDL string for introspection
 *     printSchema,         // (schema) -> SDL string
 *     ERP_SDL,             // built-in ERP SDL (Invoice/Supplier/...)
 *     defaultResolvers,    // stub resolvers that read from context.db
 *     GraphQLError,        // error class with bilingual messages
 *   } = require('./src/graphql/schema');
 *
 * ════════════════════════════════════════════════════════════════════
 * Security limits / מגבלות אבטחה
 * ════════════════════════════════════════════════════════════════════
 *
 *   depthLimit       — maximum selection-set depth (default 10)
 *   complexityLimit  — maximum weighted field count (default 1000)
 *   costLimit        — maximum integer cost from @cost(value:N) (default 5000)
 *
 * Violations raise `GraphQLError` with both English and Hebrew
 * messages attached.
 *
 * ════════════════════════════════════════════════════════════════════
 * Never delete / לא מוחקים
 * ════════════════════════════════════════════════════════════════════
 *
 * All constants and type definitions below are `Object.freeze()`-ed
 * and exported by reference, so callers can *extend* the ERP SDL but
 * never overwrite or shrink it.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
// 1. ERRORS / שגיאות
// ══════════════════════════════════════════════════════════════════

class GraphQLError extends Error {
  constructor(message, options) {
    super(message);
    this.name = 'GraphQLError';
    const opts = options || {};
    this.message_he = opts.message_he || message;
    this.path = opts.path || null;
    this.locations = opts.locations || null;
    this.extensions = opts.extensions || {};
    this.code = opts.code || 'GRAPHQL_ERROR';
  }
  toJSON() {
    const out = { message: this.message };
    if (this.message_he) out.message_he = this.message_he;
    if (this.path) out.path = this.path;
    if (this.locations) out.locations = this.locations;
    if (this.code) {
      out.extensions = Object.assign({ code: this.code }, this.extensions);
    } else if (this.extensions && Object.keys(this.extensions).length) {
      out.extensions = this.extensions;
    }
    return out;
  }
}

// ══════════════════════════════════════════════════════════════════
// 2. LEXER / מנתח לקסיקלי
// ══════════════════════════════════════════════════════════════════
//
// Token kinds:
//   PUNCT     — { } ( ) [ ] ! : , = | & @ $ ... .
//   NAME      — identifier
//   INT / FLOAT / STRING / BLOCK_STRING
//   EOF
//
// Whitespace and commas are insignificant. BOM and comments (#...) skipped.

const TOK = Object.freeze({
  PUNCT: 'PUNCT',
  NAME: 'NAME',
  INT: 'INT',
  FLOAT: 'FLOAT',
  STRING: 'STRING',
  BLOCK_STRING: 'BLOCK_STRING',
  EOF: 'EOF',
});

function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = source.length;

  function advance(ch) {
    if (ch === '\n') { line++; col = 1; } else { col++; }
  }

  while (i < n) {
    const c = source[i];
    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === ',' || c === '\uFEFF') {
      i++; col++; continue;
    }
    if (c === '\n') { i++; line++; col = 1; continue; }
    // comment
    if (c === '#') {
      while (i < n && source[i] !== '\n') { i++; }
      continue;
    }
    // punctuators
    if ('{}()[]!:=|&@$'.indexOf(c) !== -1) {
      tokens.push({ kind: TOK.PUNCT, value: c, line, col });
      i++; col++; continue;
    }
    // spread "..."
    if (c === '.' && source[i + 1] === '.' && source[i + 2] === '.') {
      tokens.push({ kind: TOK.PUNCT, value: '...', line, col });
      i += 3; col += 3; continue;
    }
    // block string """...""" — supports escapes \""" only
    if (c === '"' && source[i + 1] === '"' && source[i + 2] === '"') {
      const startLine = line, startCol = col;
      i += 3; col += 3;
      let buf = '';
      while (i < n) {
        if (source[i] === '\\' && source[i + 1] === '"' && source[i + 2] === '"' && source[i + 3] === '"') {
          buf += '"""'; i += 4; col += 4; continue;
        }
        if (source[i] === '"' && source[i + 1] === '"' && source[i + 2] === '"') {
          i += 3; col += 3;
          tokens.push({ kind: TOK.BLOCK_STRING, value: dedentBlock(buf), line: startLine, col: startCol });
          buf = null; break;
        }
        advance(source[i]);
        buf += source[i++];
      }
      if (buf !== null) throw new GraphQLError('Unterminated block string', { message_he: 'מחרוזת בלוק לא סגורה', code: 'SYNTAX_ERROR' });
      continue;
    }
    // string
    if (c === '"') {
      const startLine = line, startCol = col;
      i++; col++;
      let buf = '';
      while (i < n && source[i] !== '"' && source[i] !== '\n') {
        if (source[i] === '\\') {
          const esc = source[i + 1];
          if (esc === 'n') { buf += '\n'; i += 2; col += 2; continue; }
          if (esc === 't') { buf += '\t'; i += 2; col += 2; continue; }
          if (esc === 'r') { buf += '\r'; i += 2; col += 2; continue; }
          if (esc === '"') { buf += '"'; i += 2; col += 2; continue; }
          if (esc === '\\') { buf += '\\'; i += 2; col += 2; continue; }
          if (esc === '/') { buf += '/'; i += 2; col += 2; continue; }
          if (esc === 'b') { buf += '\b'; i += 2; col += 2; continue; }
          if (esc === 'f') { buf += '\f'; i += 2; col += 2; continue; }
          if (esc === 'u') {
            const hex = source.slice(i + 2, i + 6);
            buf += String.fromCharCode(parseInt(hex, 16));
            i += 6; col += 6; continue;
          }
          buf += esc; i += 2; col += 2; continue;
        }
        buf += source[i++]; col++;
      }
      if (source[i] !== '"') throw new GraphQLError('Unterminated string', { message_he: 'מחרוזת לא סגורה', code: 'SYNTAX_ERROR' });
      i++; col++;
      tokens.push({ kind: TOK.STRING, value: buf, line: startLine, col: startCol });
      continue;
    }
    // number
    if (c === '-' || (c >= '0' && c <= '9')) {
      const startLine = line, startCol = col;
      let j = i;
      if (source[j] === '-') j++;
      while (j < n && source[j] >= '0' && source[j] <= '9') j++;
      let isFloat = false;
      if (source[j] === '.') { isFloat = true; j++; while (j < n && source[j] >= '0' && source[j] <= '9') j++; }
      if (source[j] === 'e' || source[j] === 'E') {
        isFloat = true; j++;
        if (source[j] === '+' || source[j] === '-') j++;
        while (j < n && source[j] >= '0' && source[j] <= '9') j++;
      }
      const text = source.slice(i, j);
      const cols = j - i;
      tokens.push({ kind: isFloat ? TOK.FLOAT : TOK.INT, value: text, line: startLine, col: startCol });
      i = j; col += cols; continue;
    }
    // name
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      const startLine = line, startCol = col;
      let j = i + 1;
      while (j < n && ((source[j] >= 'a' && source[j] <= 'z') || (source[j] >= 'A' && source[j] <= 'Z') || (source[j] >= '0' && source[j] <= '9') || source[j] === '_')) j++;
      tokens.push({ kind: TOK.NAME, value: source.slice(i, j), line: startLine, col: startCol });
      col += (j - i); i = j; continue;
    }
    throw new GraphQLError('Unexpected char: ' + c + ' at line ' + line + ' col ' + col, {
      message_he: 'תו בלתי צפוי: ' + c, code: 'SYNTAX_ERROR',
    });
  }
  tokens.push({ kind: TOK.EOF, value: '', line, col });
  return tokens;
}

function dedentBlock(raw) {
  const lines = raw.split('\n');
  let common = Infinity;
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    const m = line.match(/^(\s*)\S/);
    if (m) common = Math.min(common, m[1].length);
  }
  if (common < Infinity && common > 0) {
    for (let k = 1; k < lines.length; k++) lines[k] = lines[k].slice(common);
  }
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════
// 3. SDL PARSER / מנתח SDL
// ══════════════════════════════════════════════════════════════════
//
// Produces a schema object of shape:
//   {
//     types: { [name]: TypeDef },
//     directives: { [name]: DirectiveDef },
//     queryType, mutationType, subscriptionType,
//     sdl: <original string>,
//   }
//
// TypeDef kinds: 'OBJECT', 'INPUT', 'ENUM', 'UNION', 'INTERFACE', 'SCALAR'

function makeParser(tokens) {
  let pos = 0;
  function peek() { return tokens[pos]; }
  function peekAt(offset) { return tokens[pos + offset]; }
  function next() { return tokens[pos++]; }
  function expect(kind, value) {
    const t = tokens[pos];
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new GraphQLError(
        'Expected ' + kind + (value ? ' "' + value + '"' : '') + ' got ' + t.kind + ' "' + t.value + '" at line ' + t.line,
        { message_he: 'צפוי ' + kind + ' התקבל ' + t.kind, code: 'SYNTAX_ERROR' }
      );
    }
    return tokens[pos++];
  }
  function consume(kind, value) {
    const t = tokens[pos];
    if (t.kind === kind && (value === undefined || t.value === value)) { pos++; return true; }
    return false;
  }
  function at(kind, value) {
    const t = tokens[pos];
    return t.kind === kind && (value === undefined || t.value === value);
  }
  return { peek, peekAt, next, expect, consume, at, pos: () => pos };
}

function parseSDL(source) {
  const tokens = tokenize(source);
  const p = makeParser(tokens);
  const types = Object.create(null);
  const directives = Object.create(null);
  let queryType = 'Query';
  let mutationType = null;
  let subscriptionType = null;

  function parseDescription() {
    if (p.at(TOK.STRING) || p.at(TOK.BLOCK_STRING)) {
      return p.next().value;
    }
    return null;
  }

  function parseDirectiveApplications() {
    const list = [];
    while (p.at(TOK.PUNCT, '@')) {
      p.next();
      const name = p.expect(TOK.NAME).value;
      const args = {};
      if (p.consume(TOK.PUNCT, '(')) {
        while (!p.at(TOK.PUNCT, ')')) {
          const argName = p.expect(TOK.NAME).value;
          p.expect(TOK.PUNCT, ':');
          args[argName] = parseValue();
        }
        p.expect(TOK.PUNCT, ')');
      }
      list.push({ name, args });
    }
    return list;
  }

  function parseType() {
    let inner;
    if (p.consume(TOK.PUNCT, '[')) {
      inner = { kind: 'LIST', ofType: parseType() };
      p.expect(TOK.PUNCT, ']');
    } else {
      const name = p.expect(TOK.NAME).value;
      inner = { kind: 'NAMED', name };
    }
    if (p.consume(TOK.PUNCT, '!')) inner = { kind: 'NON_NULL', ofType: inner };
    return inner;
  }

  function parseValue() {
    const t = p.peek();
    if (t.kind === TOK.INT) { p.next(); return { kind: 'IntValue', value: t.value }; }
    if (t.kind === TOK.FLOAT) { p.next(); return { kind: 'FloatValue', value: t.value }; }
    if (t.kind === TOK.STRING || t.kind === TOK.BLOCK_STRING) { p.next(); return { kind: 'StringValue', value: t.value }; }
    if (t.kind === TOK.NAME) {
      p.next();
      if (t.value === 'true' || t.value === 'false') return { kind: 'BooleanValue', value: t.value === 'true' };
      if (t.value === 'null') return { kind: 'NullValue' };
      return { kind: 'EnumValue', value: t.value };
    }
    if (t.kind === TOK.PUNCT && t.value === '$') {
      p.next();
      const name = p.expect(TOK.NAME).value;
      return { kind: 'Variable', name };
    }
    if (t.kind === TOK.PUNCT && t.value === '[') {
      p.next();
      const values = [];
      while (!p.at(TOK.PUNCT, ']')) values.push(parseValue());
      p.expect(TOK.PUNCT, ']');
      return { kind: 'ListValue', values };
    }
    if (t.kind === TOK.PUNCT && t.value === '{') {
      p.next();
      const fields = {};
      while (!p.at(TOK.PUNCT, '}')) {
        const name = p.expect(TOK.NAME).value;
        p.expect(TOK.PUNCT, ':');
        fields[name] = parseValue();
      }
      p.expect(TOK.PUNCT, '}');
      return { kind: 'ObjectValue', fields };
    }
    throw new GraphQLError('Unexpected value token ' + t.value, { message_he: 'ערך בלתי צפוי', code: 'SYNTAX_ERROR' });
  }

  function parseFieldDef(ownerName) {
    const description = parseDescription();
    const name = p.expect(TOK.NAME).value;
    const args = [];
    if (p.consume(TOK.PUNCT, '(')) {
      while (!p.at(TOK.PUNCT, ')')) {
        const argDesc = parseDescription();
        const argName = p.expect(TOK.NAME).value;
        p.expect(TOK.PUNCT, ':');
        const argType = parseType();
        let defaultValue = undefined;
        if (p.consume(TOK.PUNCT, '=')) defaultValue = parseValue();
        const argDirectives = parseDirectiveApplications();
        args.push({ name: argName, type: argType, defaultValue, description: argDesc, directives: argDirectives });
      }
      p.expect(TOK.PUNCT, ')');
    }
    p.expect(TOK.PUNCT, ':');
    const type = parseType();
    const fieldDirectives = parseDirectiveApplications();
    return { name, type, args, description, directives: fieldDirectives, ownerName };
  }

  function parseInputFieldDef() {
    const description = parseDescription();
    const name = p.expect(TOK.NAME).value;
    p.expect(TOK.PUNCT, ':');
    const type = parseType();
    let defaultValue = undefined;
    if (p.consume(TOK.PUNCT, '=')) defaultValue = parseValue();
    const fieldDirectives = parseDirectiveApplications();
    return { name, type, defaultValue, description, directives: fieldDirectives };
  }

  function parseObjectType(description) {
    p.next(); // "type"
    const name = p.expect(TOK.NAME).value;
    const interfaces = [];
    if (p.at(TOK.NAME) && p.peek().value === 'implements') {
      p.next();
      interfaces.push(p.expect(TOK.NAME).value);
      while (p.consume(TOK.PUNCT, '&')) interfaces.push(p.expect(TOK.NAME).value);
    }
    const typeDirectives = parseDirectiveApplications();
    const fields = {};
    if (p.consume(TOK.PUNCT, '{')) {
      while (!p.at(TOK.PUNCT, '}')) {
        const f = parseFieldDef(name);
        fields[f.name] = f;
      }
      p.expect(TOK.PUNCT, '}');
    }
    types[name] = Object.freeze({
      kind: 'OBJECT', name, description, interfaces, fields, directives: typeDirectives,
    });
  }

  function parseInputType(description) {
    p.next(); // "input"
    const name = p.expect(TOK.NAME).value;
    const typeDirectives = parseDirectiveApplications();
    const fields = {};
    if (p.consume(TOK.PUNCT, '{')) {
      while (!p.at(TOK.PUNCT, '}')) {
        const f = parseInputFieldDef();
        fields[f.name] = f;
      }
      p.expect(TOK.PUNCT, '}');
    }
    types[name] = Object.freeze({
      kind: 'INPUT', name, description, fields, directives: typeDirectives,
    });
  }

  function parseEnumType(description) {
    p.next(); // "enum"
    const name = p.expect(TOK.NAME).value;
    const typeDirectives = parseDirectiveApplications();
    const values = {};
    if (p.consume(TOK.PUNCT, '{')) {
      while (!p.at(TOK.PUNCT, '}')) {
        const vDesc = parseDescription();
        const vName = p.expect(TOK.NAME).value;
        const vDirectives = parseDirectiveApplications();
        values[vName] = { name: vName, description: vDesc, directives: vDirectives };
      }
      p.expect(TOK.PUNCT, '}');
    }
    types[name] = Object.freeze({
      kind: 'ENUM', name, description, values, directives: typeDirectives,
    });
  }

  function parseUnionType(description) {
    p.next(); // "union"
    const name = p.expect(TOK.NAME).value;
    const typeDirectives = parseDirectiveApplications();
    const memberTypes = [];
    if (p.consume(TOK.PUNCT, '=')) {
      p.consume(TOK.PUNCT, '|');
      memberTypes.push(p.expect(TOK.NAME).value);
      while (p.consume(TOK.PUNCT, '|')) memberTypes.push(p.expect(TOK.NAME).value);
    }
    types[name] = Object.freeze({
      kind: 'UNION', name, description, memberTypes, directives: typeDirectives,
    });
  }

  function parseInterfaceType(description) {
    p.next(); // "interface"
    const name = p.expect(TOK.NAME).value;
    const typeDirectives = parseDirectiveApplications();
    const fields = {};
    if (p.consume(TOK.PUNCT, '{')) {
      while (!p.at(TOK.PUNCT, '}')) {
        const f = parseFieldDef(name);
        fields[f.name] = f;
      }
      p.expect(TOK.PUNCT, '}');
    }
    types[name] = Object.freeze({
      kind: 'INTERFACE', name, description, fields, directives: typeDirectives,
    });
  }

  function parseScalarType(description) {
    p.next(); // "scalar"
    const name = p.expect(TOK.NAME).value;
    const typeDirectives = parseDirectiveApplications();
    types[name] = Object.freeze({
      kind: 'SCALAR', name, description, directives: typeDirectives,
    });
  }

  function parseDirectiveDef(description) {
    p.next(); // "directive"
    p.expect(TOK.PUNCT, '@');
    const name = p.expect(TOK.NAME).value;
    const args = [];
    if (p.consume(TOK.PUNCT, '(')) {
      while (!p.at(TOK.PUNCT, ')')) {
        const argDesc = parseDescription();
        const argName = p.expect(TOK.NAME).value;
        p.expect(TOK.PUNCT, ':');
        const argType = parseType();
        let defaultValue = undefined;
        if (p.consume(TOK.PUNCT, '=')) defaultValue = parseValue();
        args.push({ name: argName, type: argType, defaultValue, description: argDesc });
      }
      p.expect(TOK.PUNCT, ')');
    }
    let repeatable = false;
    if (p.at(TOK.NAME) && p.peek().value === 'repeatable') { p.next(); repeatable = true; }
    if (p.at(TOK.NAME) && p.peek().value === 'on') p.next();
    const locations = [];
    p.consume(TOK.PUNCT, '|');
    if (p.at(TOK.NAME)) {
      locations.push(p.expect(TOK.NAME).value);
      while (p.consume(TOK.PUNCT, '|')) locations.push(p.expect(TOK.NAME).value);
    }
    directives[name] = Object.freeze({ name, description, args, locations, repeatable });
  }

  function parseSchemaDef() {
    p.next(); // "schema"
    parseDirectiveApplications();
    p.expect(TOK.PUNCT, '{');
    while (!p.at(TOK.PUNCT, '}')) {
      const op = p.expect(TOK.NAME).value;
      p.expect(TOK.PUNCT, ':');
      const tn = p.expect(TOK.NAME).value;
      if (op === 'query') queryType = tn;
      else if (op === 'mutation') mutationType = tn;
      else if (op === 'subscription') subscriptionType = tn;
    }
    p.expect(TOK.PUNCT, '}');
  }

  while (!p.at(TOK.EOF)) {
    const desc = parseDescription();
    const t = p.peek();
    if (t.kind !== TOK.NAME) {
      throw new GraphQLError('Unexpected token at top level: ' + t.value, { message_he: 'אסימון בלתי צפוי', code: 'SYNTAX_ERROR' });
    }
    if (t.value === 'type') parseObjectType(desc);
    else if (t.value === 'input') parseInputType(desc);
    else if (t.value === 'enum') parseEnumType(desc);
    else if (t.value === 'union') parseUnionType(desc);
    else if (t.value === 'interface') parseInterfaceType(desc);
    else if (t.value === 'scalar') parseScalarType(desc);
    else if (t.value === 'directive') parseDirectiveDef(desc);
    else if (t.value === 'schema') parseSchemaDef();
    else if (t.value === 'extend') {
      p.next();
      const inner = p.peek().value;
      // For "extend" we just re-parse and merge fields into existing type.
      if (inner === 'type') {
        p.next();
        const name = p.expect(TOK.NAME).value;
        parseDirectiveApplications();
        const fields = {};
        if (p.consume(TOK.PUNCT, '{')) {
          while (!p.at(TOK.PUNCT, '}')) {
            const f = parseFieldDef(name);
            fields[f.name] = f;
          }
          p.expect(TOK.PUNCT, '}');
        }
        const existing = types[name];
        if (existing) {
          const merged = Object.assign({}, existing.fields, fields);
          types[name] = Object.freeze(Object.assign({}, existing, { fields: merged }));
        }
      } else {
        throw new GraphQLError('Unsupported extend target: ' + inner, { message_he: 'הרחבה לא נתמכת', code: 'SYNTAX_ERROR' });
      }
    } else {
      throw new GraphQLError('Unknown definition keyword: ' + t.value, { message_he: 'מילת מפתח לא מוכרת', code: 'SYNTAX_ERROR' });
    }
  }

  // Auto-detect Mutation / Subscription root types when not explicitly
  // declared via `schema { ... }`.  GraphQL convention: a top-level type
  // named "Mutation" or "Subscription" is the implicit root.
  if (!mutationType && types.Mutation && types.Mutation.kind === 'OBJECT') {
    mutationType = 'Mutation';
  }
  if (!subscriptionType && types.Subscription && types.Subscription.kind === 'OBJECT') {
    subscriptionType = 'Subscription';
  }

  // Built-in scalars if not declared
  const builtinScalars = ['String', 'Int', 'Float', 'Boolean', 'ID', 'JSON', 'DateTime'];
  for (const s of builtinScalars) {
    if (!types[s]) types[s] = Object.freeze({ kind: 'SCALAR', name: s, description: null, directives: [] });
  }
  // Built-in directives if not declared
  if (!directives.skip) directives.skip = Object.freeze({
    name: 'skip', args: [{ name: 'if', type: { kind: 'NON_NULL', ofType: { kind: 'NAMED', name: 'Boolean' } } }],
    locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], repeatable: false, description: null,
  });
  if (!directives.include) directives.include = Object.freeze({
    name: 'include', args: [{ name: 'if', type: { kind: 'NON_NULL', ofType: { kind: 'NAMED', name: 'Boolean' } } }],
    locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], repeatable: false, description: null,
  });
  if (!directives.cost) directives.cost = Object.freeze({
    name: 'cost', args: [{ name: 'value', type: { kind: 'NON_NULL', ofType: { kind: 'NAMED', name: 'Int' } }, defaultValue: { kind: 'IntValue', value: '1' } }],
    locations: ['FIELD_DEFINITION'], repeatable: false, description: null,
  });

  return {
    types,
    directives,
    queryType,
    mutationType,
    subscriptionType,
    sdl: source,
  };
}

function buildSchema(sdl) {
  if (typeof sdl !== 'string') {
    throw new GraphQLError('buildSchema expects SDL string', { message_he: 'buildSchema דורש מחרוזת SDL', code: 'ARGUMENT_ERROR' });
  }
  return parseSDL(sdl);
}

// ══════════════════════════════════════════════════════════════════
// 4. QUERY PARSER / מנתח שאילתה
// ══════════════════════════════════════════════════════════════════
//
// Produces a document:
//   { definitions: [OperationDef | FragmentDef] }
//
// OperationDef: { kind:'Operation', operation, name?, variables:[], selectionSet }
// FragmentDef:  { kind:'Fragment', name, typeCondition, selectionSet }

function parseQuery(source) {
  const tokens = tokenize(source);
  const p = makeParser(tokens);
  const definitions = [];

  function parseSelectionSet() {
    p.expect(TOK.PUNCT, '{');
    const selections = [];
    while (!p.at(TOK.PUNCT, '}')) selections.push(parseSelection());
    p.expect(TOK.PUNCT, '}');
    return { kind: 'SelectionSet', selections };
  }

  function parseSelection() {
    if (p.at(TOK.PUNCT, '...')) {
      p.next();
      if (p.at(TOK.NAME) && p.peek().value !== 'on') {
        const name = p.expect(TOK.NAME).value;
        const directives = parseDirectives();
        return { kind: 'FragmentSpread', name, directives };
      }
      let typeCondition = null;
      if (p.at(TOK.NAME) && p.peek().value === 'on') {
        p.next();
        typeCondition = p.expect(TOK.NAME).value;
      }
      const directives = parseDirectives();
      const selectionSet = parseSelectionSet();
      return { kind: 'InlineFragment', typeCondition, directives, selectionSet };
    }
    return parseField();
  }

  function parseField() {
    let alias = null;
    let name = p.expect(TOK.NAME).value;
    if (p.consume(TOK.PUNCT, ':')) { alias = name; name = p.expect(TOK.NAME).value; }
    const args = {};
    if (p.consume(TOK.PUNCT, '(')) {
      while (!p.at(TOK.PUNCT, ')')) {
        const argName = p.expect(TOK.NAME).value;
        p.expect(TOK.PUNCT, ':');
        args[argName] = parseValue();
      }
      p.expect(TOK.PUNCT, ')');
    }
    const directives = parseDirectives();
    let selectionSet = null;
    if (p.at(TOK.PUNCT, '{')) selectionSet = parseSelectionSet();
    return { kind: 'Field', alias, name, args, directives, selectionSet };
  }

  function parseDirectives() {
    const list = [];
    while (p.at(TOK.PUNCT, '@')) {
      p.next();
      const name = p.expect(TOK.NAME).value;
      const args = {};
      if (p.consume(TOK.PUNCT, '(')) {
        while (!p.at(TOK.PUNCT, ')')) {
          const argName = p.expect(TOK.NAME).value;
          p.expect(TOK.PUNCT, ':');
          args[argName] = parseValue();
        }
        p.expect(TOK.PUNCT, ')');
      }
      list.push({ name, args });
    }
    return list;
  }

  function parseValue() {
    const t = p.peek();
    if (t.kind === TOK.INT) { p.next(); return { kind: 'IntValue', value: t.value }; }
    if (t.kind === TOK.FLOAT) { p.next(); return { kind: 'FloatValue', value: t.value }; }
    if (t.kind === TOK.STRING || t.kind === TOK.BLOCK_STRING) { p.next(); return { kind: 'StringValue', value: t.value }; }
    if (t.kind === TOK.NAME) {
      p.next();
      if (t.value === 'true' || t.value === 'false') return { kind: 'BooleanValue', value: t.value === 'true' };
      if (t.value === 'null') return { kind: 'NullValue' };
      return { kind: 'EnumValue', value: t.value };
    }
    if (t.kind === TOK.PUNCT && t.value === '$') {
      p.next();
      const name = p.expect(TOK.NAME).value;
      return { kind: 'Variable', name };
    }
    if (t.kind === TOK.PUNCT && t.value === '[') {
      p.next();
      const values = [];
      while (!p.at(TOK.PUNCT, ']')) values.push(parseValue());
      p.expect(TOK.PUNCT, ']');
      return { kind: 'ListValue', values };
    }
    if (t.kind === TOK.PUNCT && t.value === '{') {
      p.next();
      const fields = {};
      while (!p.at(TOK.PUNCT, '}')) {
        const name = p.expect(TOK.NAME).value;
        p.expect(TOK.PUNCT, ':');
        fields[name] = parseValue();
      }
      p.expect(TOK.PUNCT, '}');
      return { kind: 'ObjectValue', fields };
    }
    throw new GraphQLError('Unexpected value token ' + t.value, { message_he: 'ערך בלתי צפוי', code: 'SYNTAX_ERROR' });
  }

  function parseType() {
    let inner;
    if (p.consume(TOK.PUNCT, '[')) {
      inner = { kind: 'LIST', ofType: parseType() };
      p.expect(TOK.PUNCT, ']');
    } else {
      const name = p.expect(TOK.NAME).value;
      inner = { kind: 'NAMED', name };
    }
    if (p.consume(TOK.PUNCT, '!')) inner = { kind: 'NON_NULL', ofType: inner };
    return inner;
  }

  function parseVariableDefs() {
    const defs = [];
    if (!p.consume(TOK.PUNCT, '(')) return defs;
    while (!p.at(TOK.PUNCT, ')')) {
      p.expect(TOK.PUNCT, '$');
      const name = p.expect(TOK.NAME).value;
      p.expect(TOK.PUNCT, ':');
      const type = parseType();
      let defaultValue = undefined;
      if (p.consume(TOK.PUNCT, '=')) defaultValue = parseValue();
      defs.push({ name, type, defaultValue });
    }
    p.expect(TOK.PUNCT, ')');
    return defs;
  }

  while (!p.at(TOK.EOF)) {
    const t = p.peek();
    if (t.kind === TOK.PUNCT && t.value === '{') {
      const selectionSet = parseSelectionSet();
      definitions.push({ kind: 'Operation', operation: 'query', name: null, variables: [], directives: [], selectionSet });
    } else if (t.kind === TOK.NAME) {
      if (t.value === 'query' || t.value === 'mutation' || t.value === 'subscription') {
        const operation = p.next().value;
        let name = null;
        if (p.at(TOK.NAME)) name = p.next().value;
        const variables = parseVariableDefs();
        const directives = parseDirectives();
        const selectionSet = parseSelectionSet();
        definitions.push({ kind: 'Operation', operation, name, variables, directives, selectionSet });
      } else if (t.value === 'fragment') {
        p.next();
        const name = p.expect(TOK.NAME).value;
        if (!p.at(TOK.NAME) || p.peek().value !== 'on') throw new GraphQLError('Expected "on" in fragment', { message_he: 'חסר "on" בפרגמנט', code: 'SYNTAX_ERROR' });
        p.next();
        const typeCondition = p.expect(TOK.NAME).value;
        const directives = parseDirectives();
        const selectionSet = parseSelectionSet();
        definitions.push({ kind: 'Fragment', name, typeCondition, directives, selectionSet });
      } else {
        throw new GraphQLError('Unexpected keyword: ' + t.value, { message_he: 'מילת מפתח בלתי צפויה', code: 'SYNTAX_ERROR' });
      }
    } else {
      throw new GraphQLError('Unexpected token at top level', { message_he: 'אסימון בלתי צפוי', code: 'SYNTAX_ERROR' });
    }
  }
  return { definitions };
}

// ══════════════════════════════════════════════════════════════════
// 5. VALUE / TYPE COERCION
// ══════════════════════════════════════════════════════════════════

function typeToString(t) {
  if (!t) return '';
  if (t.kind === 'NON_NULL') return typeToString(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + typeToString(t.ofType) + ']';
  return t.name;
}

function namedType(t) {
  if (!t) return null;
  if (t.kind === 'NAMED') return t.name;
  return namedType(t.ofType);
}

function isNonNull(t) { return t && t.kind === 'NON_NULL'; }
function isListType(t) { return t && t.kind === 'LIST'; }

function valueFromAST(node, typeRef, schema, variables) {
  if (!node) return undefined;
  if (node.kind === 'Variable') {
    if (variables && Object.prototype.hasOwnProperty.call(variables, node.name)) return variables[node.name];
    return undefined;
  }
  if (node.kind === 'NullValue') return null;
  if (isNonNull(typeRef)) return valueFromAST(node, typeRef.ofType, schema, variables);
  if (isListType(typeRef)) {
    const inner = typeRef.ofType;
    if (node.kind === 'ListValue') return node.values.map((v) => valueFromAST(v, inner, schema, variables));
    return [valueFromAST(node, inner, schema, variables)];
  }
  const tName = namedType(typeRef);
  const td = schema.types[tName];
  if (!td) {
    // unknown — return raw
    if (node.kind === 'StringValue') return node.value;
    if (node.kind === 'IntValue') return parseInt(node.value, 10);
    if (node.kind === 'FloatValue') return parseFloat(node.value);
    if (node.kind === 'BooleanValue') return node.value;
    if (node.kind === 'EnumValue') return node.value;
    return null;
  }
  if (td.kind === 'SCALAR') {
    if (tName === 'Int') {
      if (node.kind === 'IntValue') return parseInt(node.value, 10);
      throw new GraphQLError('Expected Int, got ' + node.kind, { message_he: 'צפוי Int', code: 'COERCION_ERROR' });
    }
    if (tName === 'Float') {
      if (node.kind === 'FloatValue' || node.kind === 'IntValue') return parseFloat(node.value);
      throw new GraphQLError('Expected Float', { message_he: 'צפוי Float', code: 'COERCION_ERROR' });
    }
    if (tName === 'String' || tName === 'ID' || tName === 'DateTime') {
      if (node.kind === 'StringValue') return node.value;
      if (tName === 'ID' && node.kind === 'IntValue') return node.value;
      throw new GraphQLError('Expected ' + tName, { message_he: 'צפוי ' + tName, code: 'COERCION_ERROR' });
    }
    if (tName === 'Boolean') {
      if (node.kind === 'BooleanValue') return node.value;
      throw new GraphQLError('Expected Boolean', { message_he: 'צפוי Boolean', code: 'COERCION_ERROR' });
    }
    if (tName === 'JSON') {
      return literalToJS(node);
    }
    // custom scalar — pass literal through
    return literalToJS(node);
  }
  if (td.kind === 'ENUM') {
    if (node.kind === 'EnumValue' || node.kind === 'StringValue') {
      const v = node.value;
      if (!td.values[v]) {
        throw new GraphQLError('Invalid enum value "' + v + '" for ' + tName, {
          message_he: 'ערך enum לא חוקי "' + v + '"', code: 'COERCION_ERROR',
        });
      }
      return v;
    }
    throw new GraphQLError('Expected enum ' + tName, { message_he: 'צפוי enum', code: 'COERCION_ERROR' });
  }
  if (td.kind === 'INPUT') {
    if (node.kind !== 'ObjectValue') {
      throw new GraphQLError('Expected input object ' + tName, { message_he: 'צפוי אובייקט קלט', code: 'COERCION_ERROR' });
    }
    const obj = {};
    for (const fieldName in td.fields) {
      const fdef = td.fields[fieldName];
      if (Object.prototype.hasOwnProperty.call(node.fields, fieldName)) {
        obj[fieldName] = valueFromAST(node.fields[fieldName], fdef.type, schema, variables);
      } else if (fdef.defaultValue !== undefined) {
        obj[fieldName] = valueFromAST(fdef.defaultValue, fdef.type, schema, variables);
      } else if (isNonNull(fdef.type)) {
        throw new GraphQLError('Missing required input field "' + fieldName + '" on ' + tName, {
          message_he: 'חסר שדה חובה בקלט "' + fieldName + '"', code: 'COERCION_ERROR',
        });
      }
    }
    return obj;
  }
  return null;
}

function literalToJS(node) {
  if (!node) return null;
  switch (node.kind) {
    case 'IntValue': return parseInt(node.value, 10);
    case 'FloatValue': return parseFloat(node.value);
    case 'StringValue': return node.value;
    case 'BooleanValue': return node.value;
    case 'NullValue': return null;
    case 'EnumValue': return node.value;
    case 'ListValue': return node.values.map(literalToJS);
    case 'ObjectValue': {
      const out = {};
      for (const k in node.fields) out[k] = literalToJS(node.fields[k]);
      return out;
    }
    default: return null;
  }
}

function coerceVariables(schema, operation, variableValues) {
  const coerced = {};
  const given = variableValues || {};
  for (const def of operation.variables) {
    const hasValue = Object.prototype.hasOwnProperty.call(given, def.name);
    if (!hasValue) {
      if (def.defaultValue !== undefined) {
        coerced[def.name] = valueFromAST(def.defaultValue, def.type, schema, given);
      } else if (isNonNull(def.type)) {
        throw new GraphQLError('Variable "$' + def.name + '" of required type was not provided', {
          message_he: 'משתנה "$' + def.name + '" חובה לא סופק', code: 'VARIABLE_ERROR',
        });
      } else {
        coerced[def.name] = undefined;
      }
    } else {
      coerced[def.name] = coerceJSValue(given[def.name], def.type, schema, def.name);
    }
  }
  return coerced;
}

function coerceJSValue(value, typeRef, schema, path) {
  if (value === null || value === undefined) {
    if (isNonNull(typeRef)) throw new GraphQLError('Null for non-null type at ' + path, { message_he: 'ערך null לשדה חובה', code: 'COERCION_ERROR' });
    return value === undefined ? undefined : null;
  }
  if (isNonNull(typeRef)) return coerceJSValue(value, typeRef.ofType, schema, path);
  if (isListType(typeRef)) {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v, idx) => coerceJSValue(v, typeRef.ofType, schema, path + '[' + idx + ']'));
  }
  const tName = namedType(typeRef);
  const td = schema.types[tName];
  if (!td) return value;
  if (td.kind === 'SCALAR') {
    if (tName === 'Int') {
      const n = parseInt(value, 10);
      if (Number.isNaN(n)) throw new GraphQLError('Expected Int at ' + path, { message_he: 'צפוי Int', code: 'COERCION_ERROR' });
      return n;
    }
    if (tName === 'Float') {
      const n = parseFloat(value);
      if (Number.isNaN(n)) throw new GraphQLError('Expected Float at ' + path, { message_he: 'צפוי Float', code: 'COERCION_ERROR' });
      return n;
    }
    if (tName === 'Boolean') return !!value;
    return value;
  }
  if (td.kind === 'ENUM') {
    if (!td.values[value]) throw new GraphQLError('Invalid enum value "' + value + '" for ' + tName + ' at ' + path, { message_he: 'ערך enum לא חוקי', code: 'COERCION_ERROR' });
    return value;
  }
  if (td.kind === 'INPUT') {
    if (typeof value !== 'object') throw new GraphQLError('Expected object for ' + tName + ' at ' + path, { message_he: 'צפוי אובייקט', code: 'COERCION_ERROR' });
    const out = {};
    for (const fn in td.fields) {
      const fdef = td.fields[fn];
      if (Object.prototype.hasOwnProperty.call(value, fn)) {
        out[fn] = coerceJSValue(value[fn], fdef.type, schema, path + '.' + fn);
      } else if (fdef.defaultValue !== undefined) {
        out[fn] = valueFromAST(fdef.defaultValue, fdef.type, schema, {});
      } else if (isNonNull(fdef.type)) {
        throw new GraphQLError('Missing required field "' + fn + '" at ' + path, { message_he: 'חסר שדה חובה', code: 'COERCION_ERROR' });
      }
    }
    return out;
  }
  return value;
}

function coerceArguments(fieldDef, argNodes, schema, variables) {
  const result = {};
  if (!fieldDef.args) return result;
  for (const argDef of fieldDef.args) {
    if (Object.prototype.hasOwnProperty.call(argNodes, argDef.name)) {
      result[argDef.name] = valueFromAST(argNodes[argDef.name], argDef.type, schema, variables);
    } else if (argDef.defaultValue !== undefined) {
      result[argDef.name] = valueFromAST(argDef.defaultValue, argDef.type, schema, variables);
    } else if (isNonNull(argDef.type)) {
      throw new GraphQLError('Missing required argument "' + argDef.name + '"', {
        message_he: 'חסר ארגומנט חובה "' + argDef.name + '"', code: 'ARGUMENT_ERROR',
      });
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// 6. SECURITY / אבטחה — depth, complexity, cost
// ══════════════════════════════════════════════════════════════════

function shouldInclude(directives, variables) {
  if (!directives) return true;
  for (const d of directives) {
    if (d.name === 'skip') {
      const v = d.args.if;
      const bv = valueFromAST(v, { kind: 'NAMED', name: 'Boolean' }, { types: {} }, variables);
      if (bv === true) return false;
    } else if (d.name === 'include') {
      const v = d.args.if;
      const bv = valueFromAST(v, { kind: 'NAMED', name: 'Boolean' }, { types: {} }, variables);
      if (bv === false) return false;
    }
  }
  return true;
}

function computeDepth(selectionSet, fragments, variables, current) {
  if (!selectionSet) return current;
  let max = current;
  for (const sel of selectionSet.selections) {
    if (!shouldInclude(sel.directives, variables)) continue;
    if (sel.kind === 'Field') {
      const childDepth = sel.selectionSet
        ? computeDepth(sel.selectionSet, fragments, variables, current + 1)
        : current + 1;
      if (childDepth > max) max = childDepth;
    } else if (sel.kind === 'InlineFragment') {
      const childDepth = computeDepth(sel.selectionSet, fragments, variables, current);
      if (childDepth > max) max = childDepth;
    } else if (sel.kind === 'FragmentSpread') {
      const frag = fragments[sel.name];
      if (frag) {
        const childDepth = computeDepth(frag.selectionSet, fragments, variables, current);
        if (childDepth > max) max = childDepth;
      }
    }
  }
  return max;
}

function computeComplexity(selectionSet, fragments, variables) {
  if (!selectionSet) return 0;
  let total = 0;
  for (const sel of selectionSet.selections) {
    if (!shouldInclude(sel.directives, variables)) continue;
    if (sel.kind === 'Field') {
      total += 1;
      if (sel.selectionSet) total += computeComplexity(sel.selectionSet, fragments, variables);
    } else if (sel.kind === 'InlineFragment') {
      total += computeComplexity(sel.selectionSet, fragments, variables);
    } else if (sel.kind === 'FragmentSpread') {
      const frag = fragments[sel.name];
      if (frag) total += computeComplexity(frag.selectionSet, fragments, variables);
    }
  }
  return total;
}

function computeCost(schema, typeName, selectionSet, fragments, variables) {
  if (!selectionSet) return 0;
  const td = schema.types[typeName];
  if (!td || td.kind !== 'OBJECT') return 0;
  let total = 0;
  for (const sel of selectionSet.selections) {
    if (!shouldInclude(sel.directives, variables)) continue;
    if (sel.kind === 'Field') {
      const fdef = td.fields[sel.name];
      if (fdef) {
        let fieldCost = 1;
        const costDir = (fdef.directives || []).find((d) => d.name === 'cost');
        if (costDir && costDir.args && costDir.args.value) {
          const v = literalToJS(costDir.args.value);
          if (typeof v === 'number') fieldCost = v;
          else if (typeof v === 'string') fieldCost = parseInt(v, 10) || 1;
        }
        total += fieldCost;
        if (sel.selectionSet) {
          const innerName = namedType(fdef.type);
          total += computeCost(schema, innerName, sel.selectionSet, fragments, variables);
        }
      }
    } else if (sel.kind === 'InlineFragment') {
      const inner = sel.typeCondition || typeName;
      total += computeCost(schema, inner, sel.selectionSet, fragments, variables);
    } else if (sel.kind === 'FragmentSpread') {
      const frag = fragments[sel.name];
      if (frag) total += computeCost(schema, frag.typeCondition, frag.selectionSet, fragments, variables);
    }
  }
  return total;
}

// ══════════════════════════════════════════════════════════════════
// 7. EXECUTOR / מבצע שאילתות
// ══════════════════════════════════════════════════════════════════

const DEFAULT_LIMITS = Object.freeze({
  depthLimit: 10,
  complexityLimit: 1000,
  costLimit: 5000,
});

async function execute(schema, query, variables, context, rootValue, options) {
  options = options || {};
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
  const resolvers = (context && context.resolvers) || options.resolvers || {};

  let document;
  try {
    document = typeof query === 'string' ? parseQuery(query) : query;
  } catch (err) {
    return { errors: [toErr(err)] };
  }

  const operations = document.definitions.filter((d) => d.kind === 'Operation');
  const fragments = {};
  for (const def of document.definitions) if (def.kind === 'Fragment') fragments[def.name] = def;

  let operation;
  if (options.operationName) {
    operation = operations.find((op) => op.name === options.operationName);
    if (!operation) return { errors: [toErr(new GraphQLError('Unknown operation "' + options.operationName + '"', { message_he: 'פעולה לא מוכרת', code: 'OPERATION_NOT_FOUND' }))] };
  } else if (operations.length === 1) {
    operation = operations[0];
  } else if (operations.length > 1) {
    return { errors: [toErr(new GraphQLError('Must provide operationName for multiple operations', { message_he: 'יש לציין operationName', code: 'OPERATION_AMBIGUOUS' }))] };
  } else {
    return { errors: [toErr(new GraphQLError('No operation in document', { message_he: 'אין פעולה במסמך', code: 'NO_OPERATION' }))] };
  }

  let coercedVars;
  try { coercedVars = coerceVariables(schema, operation, variables); }
  catch (err) { return { errors: [toErr(err)] }; }

  // Security checks
  const depth = computeDepth(operation.selectionSet, fragments, coercedVars, 0);
  if (depth > limits.depthLimit) {
    return { errors: [toErr(new GraphQLError(
      'Query depth ' + depth + ' exceeds limit ' + limits.depthLimit,
      { message_he: 'עומק השאילתה ' + depth + ' חורג מהמגבלה ' + limits.depthLimit, code: 'DEPTH_LIMIT_EXCEEDED' }
    ))] };
  }
  const complexity = computeComplexity(operation.selectionSet, fragments, coercedVars);
  if (complexity > limits.complexityLimit) {
    return { errors: [toErr(new GraphQLError(
      'Query complexity ' + complexity + ' exceeds limit ' + limits.complexityLimit,
      { message_he: 'סיבוכיות השאילתה ' + complexity + ' חורגת מהמגבלה ' + limits.complexityLimit, code: 'COMPLEXITY_LIMIT_EXCEEDED' }
    ))] };
  }
  const opTypeName = operation.operation === 'mutation' ? schema.mutationType
    : operation.operation === 'subscription' ? schema.subscriptionType
      : schema.queryType;
  const cost = computeCost(schema, opTypeName, operation.selectionSet, fragments, coercedVars);
  if (cost > limits.costLimit) {
    return { errors: [toErr(new GraphQLError(
      'Query cost ' + cost + ' exceeds limit ' + limits.costLimit,
      { message_he: 'עלות השאילתה ' + cost + ' חורגת מהמגבלה ' + limits.costLimit, code: 'COST_LIMIT_EXCEEDED' }
    ))] };
  }

  const execCtx = {
    schema,
    fragments,
    variables: coercedVars,
    context: context || {},
    resolvers,
    errors: [],
    limits,
    extensions: { depth, complexity, cost },
  };

  if (operation.operation === 'subscription') {
    return executeSubscription(execCtx, operation, rootValue);
  }
  try {
    const data = await executeSelectionSet(
      execCtx,
      opTypeName,
      operation.selectionSet,
      rootValue || {},
      []
    );
    const out = { data };
    if (execCtx.errors.length) out.errors = execCtx.errors.map(toErr);
    if (options.includeExtensions !== false) out.extensions = execCtx.extensions;
    return out;
  } catch (err) {
    return { errors: [toErr(err)] };
  }
}

function toErr(err) {
  if (err instanceof GraphQLError) return err.toJSON();
  return { message: err.message || String(err), extensions: { code: 'INTERNAL_ERROR' } };
}

async function executeSelectionSet(execCtx, typeName, selectionSet, source, path) {
  if (typeName === '__Schema' || typeName === '__Type') {
    // introspection handled in-line
  }
  const fields = collectFields(execCtx, typeName, selectionSet, {});
  const result = {};
  for (const responseKey in fields) {
    const fieldNodes = fields[responseKey];
    const fieldNode = fieldNodes[0];
    const value = await resolveField(execCtx, typeName, source, fieldNodes, path.concat(responseKey));
    result[responseKey] = value;
  }
  return result;
}

function collectFields(execCtx, typeName, selectionSet, visited) {
  const groups = {};
  if (!selectionSet) return groups;
  for (const sel of selectionSet.selections) {
    if (!shouldInclude(sel.directives, execCtx.variables)) continue;
    if (sel.kind === 'Field') {
      const key = sel.alias || sel.name;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sel);
    } else if (sel.kind === 'InlineFragment') {
      const cond = sel.typeCondition;
      if (!cond || fragmentMatches(execCtx.schema, cond, typeName)) {
        const sub = collectFields(execCtx, typeName, sel.selectionSet, visited);
        for (const k in sub) {
          if (!groups[k]) groups[k] = [];
          groups[k].push.apply(groups[k], sub[k]);
        }
      }
    } else if (sel.kind === 'FragmentSpread') {
      if (visited[sel.name]) continue;
      visited[sel.name] = true;
      const frag = execCtx.fragments[sel.name];
      if (frag && fragmentMatches(execCtx.schema, frag.typeCondition, typeName)) {
        const sub = collectFields(execCtx, typeName, frag.selectionSet, visited);
        for (const k in sub) {
          if (!groups[k]) groups[k] = [];
          groups[k].push.apply(groups[k], sub[k]);
        }
      }
    }
  }
  return groups;
}

function fragmentMatches(schema, fragTypeName, actualTypeName) {
  if (fragTypeName === actualTypeName) return true;
  const frag = schema.types[fragTypeName];
  const actual = schema.types[actualTypeName];
  if (!frag || !actual) return false;
  if (frag.kind === 'INTERFACE' && actual.kind === 'OBJECT') {
    return (actual.interfaces || []).indexOf(fragTypeName) !== -1;
  }
  if (frag.kind === 'UNION' && actual.kind === 'OBJECT') {
    return (frag.memberTypes || []).indexOf(actualTypeName) !== -1;
  }
  return false;
}

async function resolveField(execCtx, parentTypeName, source, fieldNodes, path) {
  const fieldNode = fieldNodes[0];
  const fieldName = fieldNode.name;

  // Introspection fields
  if (fieldName === '__typename') return parentTypeName;
  if (fieldName === '__schema' && parentTypeName === execCtx.schema.queryType) {
    return resolveIntrospectionSchema(execCtx, fieldNode, path);
  }
  if (fieldName === '__type' && parentTypeName === execCtx.schema.queryType) {
    const args = coerceArguments({ args: [{ name: 'name', type: { kind: 'NON_NULL', ofType: { kind: 'NAMED', name: 'String' } } }] }, fieldNode.args, execCtx.schema, execCtx.variables);
    return resolveIntrospectionType(execCtx, args.name, fieldNode, path);
  }

  const parentType = execCtx.schema.types[parentTypeName];
  if (!parentType || !parentType.fields || !parentType.fields[fieldName]) {
    execCtx.errors.push(new GraphQLError(
      'Cannot query field "' + fieldName + '" on type "' + parentTypeName + '"',
      { message_he: 'לא ניתן לבקש שדה "' + fieldName + '" על טיפוס "' + parentTypeName + '"', code: 'FIELD_NOT_FOUND', path }
    ));
    return null;
  }
  const fieldDef = parentType.fields[fieldName];
  let args;
  try { args = coerceArguments(fieldDef, fieldNode.args, execCtx.schema, execCtx.variables); }
  catch (err) { execCtx.errors.push(Object.assign(err, { path })); return null; }

  const resolver = getResolver(execCtx.resolvers, parentTypeName, fieldName);
  let result;
  try {
    if (resolver) {
      result = await resolver(source, args, execCtx.context, { fieldName, parentType: parentTypeName, path });
    } else {
      result = defaultFieldResolver(source, fieldName);
    }
  } catch (err) {
    execCtx.errors.push(new GraphQLError(err.message || String(err), {
      message_he: err.message_he || err.message, code: err.code || 'RESOLVER_ERROR', path,
    }));
    return null;
  }
  return completeValue(execCtx, fieldDef.type, fieldNodes, result, path);
}

function getResolver(resolvers, typeName, fieldName) {
  if (!resolvers) return null;
  const typeRes = resolvers[typeName];
  if (typeRes && typeof typeRes[fieldName] === 'function') return typeRes[fieldName];
  return null;
}

function defaultFieldResolver(source, fieldName) {
  if (source === null || source === undefined) return null;
  if (typeof source[fieldName] === 'function') return source[fieldName]();
  return source[fieldName];
}

async function completeValue(execCtx, typeRef, fieldNodes, result, path) {
  if (isNonNull(typeRef)) {
    const v = await completeValue(execCtx, typeRef.ofType, fieldNodes, result, path);
    if (v === null || v === undefined) {
      execCtx.errors.push(new GraphQLError(
        'Null returned for non-null field at ' + path.join('.'),
        { message_he: 'null עבור שדה חובה', code: 'NULL_IN_NON_NULL', path }
      ));
      return null;
    }
    return v;
  }
  if (result === null || result === undefined) return null;
  if (isListType(typeRef)) {
    if (!Array.isArray(result)) return [];
    const out = [];
    for (let i = 0; i < result.length; i++) {
      out.push(await completeValue(execCtx, typeRef.ofType, fieldNodes, result[i], path.concat(i)));
    }
    return out;
  }
  const tName = namedType(typeRef);
  const td = execCtx.schema.types[tName];
  if (!td) return result;
  if (td.kind === 'SCALAR') return serializeScalar(tName, result);
  if (td.kind === 'ENUM') return result;
  if (td.kind === 'OBJECT') {
    const subSet = mergeSelectionSets(fieldNodes);
    return executeSelectionSet(execCtx, tName, subSet, result, path);
  }
  if (td.kind === 'INTERFACE' || td.kind === 'UNION') {
    const runtimeType = resolveAbstractType(execCtx, td, result);
    const subSet = mergeSelectionSets(fieldNodes);
    return executeSelectionSet(execCtx, runtimeType, subSet, result, path);
  }
  return result;
}

function resolveAbstractType(execCtx, td, result) {
  if (result && result.__typename) return result.__typename;
  const resolver = execCtx.resolvers && execCtx.resolvers[td.name] && execCtx.resolvers[td.name].__resolveType;
  if (typeof resolver === 'function') return resolver(result, execCtx.context);
  if (td.kind === 'UNION' && td.memberTypes && td.memberTypes.length) return td.memberTypes[0];
  return td.name;
}

function mergeSelectionSets(fieldNodes) {
  const selections = [];
  for (const fn of fieldNodes) {
    if (fn.selectionSet && fn.selectionSet.selections) {
      selections.push.apply(selections, fn.selectionSet.selections);
    }
  }
  return { kind: 'SelectionSet', selections };
}

function serializeScalar(name, v) {
  if (v === null || v === undefined) return null;
  switch (name) {
    case 'Int': {
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'Float': {
      const n = typeof v === 'number' ? v : parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'String':
    case 'ID':
      return String(v);
    case 'Boolean':
      return !!v;
    case 'DateTime':
      return v instanceof Date ? v.toISOString() : String(v);
    case 'JSON':
      return v;
    default:
      return v;
  }
}

// ══════════════════════════════════════════════════════════════════
// 8. SUBSCRIPTIONS / מנויים — async iterator
// ══════════════════════════════════════════════════════════════════

async function executeSubscription(execCtx, operation, rootValue) {
  const typeName = execCtx.schema.subscriptionType;
  if (!typeName) return { errors: [toErr(new GraphQLError('Subscriptions not supported by schema', { message_he: 'מנויים לא נתמכים', code: 'SUBSCRIPTION_UNSUPPORTED' }))] };
  const parentType = execCtx.schema.types[typeName];
  const fields = collectFields(execCtx, typeName, operation.selectionSet, {});
  const keys = Object.keys(fields);
  if (keys.length !== 1) {
    return { errors: [toErr(new GraphQLError('Subscription must select exactly one field', { message_he: 'מנוי חייב לבחור שדה אחד בדיוק', code: 'SUBSCRIPTION_FIELD_COUNT' }))] };
  }
  const responseKey = keys[0];
  const fieldNode = fields[responseKey][0];
  const fieldName = fieldNode.name;
  const fieldDef = parentType.fields[fieldName];
  if (!fieldDef) {
    return { errors: [toErr(new GraphQLError('Unknown subscription field "' + fieldName + '"', { message_he: 'שדה מנוי לא ידוע', code: 'SUBSCRIPTION_FIELD_UNKNOWN' }))] };
  }
  let args;
  try { args = coerceArguments(fieldDef, fieldNode.args, execCtx.schema, execCtx.variables); }
  catch (err) { return { errors: [toErr(err)] }; }
  const subscribeFn = getResolver(execCtx.resolvers, typeName, fieldName) ||
    (execCtx.resolvers && execCtx.resolvers.Subscription && execCtx.resolvers.Subscription[fieldName]);
  if (typeof subscribeFn !== 'function') {
    // return an empty async iterator
    return asyncIterator([]);
  }
  const iter = await subscribeFn(rootValue || {}, args, execCtx.context, { fieldName, parentType: typeName });
  if (iter && typeof iter[Symbol.asyncIterator] === 'function') {
    // wrap so each payload is mapped through completion
    return (async function* () {
      for await (const payload of iter) {
        const data = await executeSelectionSet(execCtx, typeName, operation.selectionSet, payload, []);
        const out = { data };
        if (execCtx.errors.length) out.errors = execCtx.errors.map(toErr);
        yield out;
      }
    })();
  }
  return asyncIterator([iter]);
}

function asyncIterator(values) {
  let i = 0;
  return {
    next() { return Promise.resolve({ value: values[i], done: i++ >= values.length }); },
    return() { return Promise.resolve({ value: undefined, done: true }); },
    [Symbol.asyncIterator]() { return this; },
  };
}

// ══════════════════════════════════════════════════════════════════
// 9. INTROSPECTION / אינטרוספקציה
// ══════════════════════════════════════════════════════════════════

function introspectionQuery() {
  return `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          kind
          name
          description
          fields { name description }
          enumValues { name description }
        }
      }
    }
  `;
}

function resolveIntrospectionSchema(execCtx, fieldNode, path) {
  const schema = execCtx.schema;
  const typesList = Object.keys(schema.types).map((n) => introspectType(schema.types[n]));
  return {
    queryType: { name: schema.queryType, kind: 'OBJECT' },
    mutationType: schema.mutationType ? { name: schema.mutationType, kind: 'OBJECT' } : null,
    subscriptionType: schema.subscriptionType ? { name: schema.subscriptionType, kind: 'OBJECT' } : null,
    types: typesList,
    directives: Object.keys(schema.directives).map((n) => ({
      name: schema.directives[n].name,
      description: schema.directives[n].description,
      locations: schema.directives[n].locations,
    })),
  };
}

function resolveIntrospectionType(execCtx, name, fieldNode, path) {
  const td = execCtx.schema.types[name];
  if (!td) return null;
  return introspectType(td);
}

function introspectType(td) {
  const obj = { kind: td.kind, name: td.name, description: td.description || null };
  if (td.fields) {
    obj.fields = Object.keys(td.fields).map((fn) => {
      const f = td.fields[fn];
      return {
        name: f.name,
        description: f.description || null,
        type: { kind: 'NAMED', name: typeToString(f.type) },
        args: (f.args || []).map((a) => ({ name: a.name, description: a.description || null, type: { kind: 'NAMED', name: typeToString(a.type) } })),
      };
    });
  }
  if (td.values) {
    obj.enumValues = Object.keys(td.values).map((vn) => ({ name: vn, description: td.values[vn].description || null }));
  }
  if (td.interfaces) obj.interfaces = td.interfaces.map((n) => ({ name: n }));
  if (td.memberTypes) obj.possibleTypes = td.memberTypes.map((n) => ({ name: n }));
  return obj;
}

// ══════════════════════════════════════════════════════════════════
// 10. PRINT SCHEMA / הדפסת סכמה ל-SDL
// ══════════════════════════════════════════════════════════════════

function printSchema(schema) {
  const lines = [];
  const order = ['SCALAR', 'ENUM', 'INTERFACE', 'UNION', 'INPUT', 'OBJECT'];
  const printedSchema = (schema.queryType && schema.queryType !== 'Query') || schema.mutationType || schema.subscriptionType;
  if (printedSchema) {
    lines.push('schema {');
    lines.push('  query: ' + schema.queryType);
    if (schema.mutationType) lines.push('  mutation: ' + schema.mutationType);
    if (schema.subscriptionType) lines.push('  subscription: ' + schema.subscriptionType);
    lines.push('}');
    lines.push('');
  }
  for (const kind of order) {
    for (const name in schema.types) {
      const td = schema.types[name];
      if (td.kind !== kind) continue;
      if (name.startsWith('__')) continue;
      if (td.description) lines.push('"""' + td.description + '"""');
      if (td.kind === 'SCALAR') {
        if (['String', 'Int', 'Float', 'Boolean', 'ID'].indexOf(name) !== -1) continue;
        lines.push('scalar ' + name);
      } else if (td.kind === 'ENUM') {
        lines.push('enum ' + name + ' {');
        for (const vn in td.values) {
          const v = td.values[vn];
          if (v.description) lines.push('  """' + v.description + '"""');
          lines.push('  ' + vn);
        }
        lines.push('}');
      } else if (td.kind === 'UNION') {
        lines.push('union ' + name + ' = ' + (td.memberTypes || []).join(' | '));
      } else if (td.kind === 'INTERFACE') {
        lines.push('interface ' + name + ' {');
        for (const fn in td.fields) lines.push('  ' + printField(td.fields[fn]));
        lines.push('}');
      } else if (td.kind === 'INPUT') {
        lines.push('input ' + name + ' {');
        for (const fn in td.fields) {
          const f = td.fields[fn];
          if (f.description) lines.push('  """' + f.description + '"""');
          lines.push('  ' + f.name + ': ' + typeToString(f.type));
        }
        lines.push('}');
      } else if (td.kind === 'OBJECT') {
        const impls = td.interfaces && td.interfaces.length ? ' implements ' + td.interfaces.join(' & ') : '';
        lines.push('type ' + name + impls + ' {');
        for (const fn in td.fields) {
          const f = td.fields[fn];
          if (f.description) lines.push('  """' + f.description + '"""');
          lines.push('  ' + printField(f));
        }
        lines.push('}');
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function printField(f) {
  let out = f.name;
  if (f.args && f.args.length) {
    out += '(' + f.args.map((a) => a.name + ': ' + typeToString(a.type)).join(', ') + ')';
  }
  out += ': ' + typeToString(f.type);
  return out;
}

// ══════════════════════════════════════════════════════════════════
// 11. BUILT-IN ERP SCHEMA / סכמת ERP מובנית
// ══════════════════════════════════════════════════════════════════
//
// Bilingual descriptions — Hebrew first, then English.
//
// NOTE: per "never delete" rule, any caller may extend this SDL by
// appending new types or `extend type` blocks, but must not remove
// fields. The frozen `ERP_SDL` export is string-concatenatable.

const ERP_SDL = `
"""תאריך-זמן ISO-8601 / ISO-8601 DateTime"""
scalar DateTime

"""ערך JSON גולמי / Arbitrary JSON value"""
scalar JSON

"""הגדרת עלות השאילתה / Query cost annotation"""
directive @cost(value: Int! = 1) on FIELD_DEFINITION

"""סטטוס חשבונית / Invoice status"""
enum InvoiceStatus {
  """טיוטה / Draft"""
  DRAFT
  """ממתין לאישור / Pending approval"""
  PENDING
  """מאושר / Approved"""
  APPROVED
  """נשלח / Sent"""
  SENT
  """שולם / Paid"""
  PAID
  """בוטל / Cancelled"""
  CANCELLED
}

"""סטטוס הזמנה / Order status"""
enum OrderStatus {
  """חדש / New"""
  NEW
  """מעובד / Processing"""
  PROCESSING
  """נשלח / Shipped"""
  SHIPPED
  """נמסר / Delivered"""
  DELIVERED
  """בוטל / Cancelled"""
  CANCELLED
}

"""סוג חשבון בספר הראשי / GL account type"""
enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

"""מטבע / Currency code (ISO 4217)"""
enum Currency {
  ILS
  USD
  EUR
  GBP
}

"""ישות בעלת זיהוי / Anything with an ID"""
interface Node {
  """מזהה ייחודי / Unique identifier"""
  id: ID!
}

"""חשבונית / Invoice record"""
type Invoice implements Node {
  """מזהה חשבונית / Invoice ID"""
  id: ID!
  """מספר חשבונית / Invoice number"""
  number: String!
  """סטטוס / Status"""
  status: InvoiceStatus! @cost(value: 1)
  """סכום כולל (אגורות/cents) / Total amount in minor units"""
  totalMinor: Int!
  """מטבע / Currency"""
  currency: Currency!
  """תאריך הנפקה / Issue date"""
  issuedAt: DateTime!
  """תאריך פירעון / Due date"""
  dueAt: DateTime
  """ספק קשור / Linked supplier"""
  supplier: Supplier @cost(value: 5)
  """לקוח קשור / Linked customer"""
  customer: Customer @cost(value: 5)
  """שורות חשבונית / Invoice line items"""
  lines: [InvoiceLine!]! @cost(value: 10)
  """הערות / Notes"""
  notes: String
  """מזהה משתמש שאישר / Approver user ID"""
  approvedBy: String
  """תאריך אישור / Approval timestamp"""
  approvedAt: DateTime
  """מטא-דאטה גולמית / Raw metadata"""
  meta: JSON
}

"""שורת חשבונית / Invoice line"""
type InvoiceLine {
  """מזהה שורה / Line ID"""
  id: ID!
  """תיאור / Description"""
  description: String!
  """כמות / Quantity"""
  quantity: Float!
  """מחיר יחידה (אגורות) / Unit price in minor units"""
  unitPriceMinor: Int!
  """סכום שורה (אגורות) / Line total in minor units"""
  totalMinor: Int!
  """שיעור מע"מ באחוזים / VAT percent"""
  vatPercent: Float
  """פריט מקושר / Linked item"""
  item: Item
}

"""ספק / Supplier / vendor"""
type Supplier implements Node {
  """מזהה ספק / Supplier ID"""
  id: ID!
  """שם / Legal name"""
  name: String!
  """מספר עוסק מורשה / Tax ID (ח.פ)"""
  taxId: String
  """אימייל / Email"""
  email: String
  """טלפון / Phone"""
  phone: String
  """כתובת / Address"""
  address: String
  """חשבוניות / Related invoices"""
  invoices(filter: InvoiceFilter): [Invoice!]! @cost(value: 10)
  """דירוג ספק / Supplier score"""
  score: Float
  """הערות / Notes"""
  notes: String
}

"""לקוח / Customer"""
type Customer implements Node {
  """מזהה לקוח / Customer ID"""
  id: ID!
  """שם / Name"""
  name: String!
  """אימייל / Email"""
  email: String
  """טלפון / Phone"""
  phone: String
  """מספר עוסק / Tax ID"""
  taxId: String
  """חשבוניות / Invoices"""
  invoices(filter: InvoiceFilter): [Invoice!]! @cost(value: 10)
  """הזמנות / Orders"""
  orders: [Order!]! @cost(value: 10)
  """יתרה לתשלום / Outstanding balance in minor units"""
  outstandingMinor: Int
}

"""פריט / Catalog item"""
type Item implements Node {
  """מזהה פריט / Item ID"""
  id: ID!
  """קוד פריט / SKU"""
  sku: String!
  """שם / Name"""
  name: String!
  """תיאור / Description"""
  description: String
  """מחיר יחידה (אגורות) / Unit price in minor units"""
  unitPriceMinor: Int!
  """כמות במלאי / Stock quantity"""
  stockQty: Int
  """קטגוריה / Category"""
  category: String
  """פעיל / Active flag"""
  active: Boolean!
}

"""עובד / Employee"""
type Employee implements Node {
  """מזהה עובד / Employee ID"""
  id: ID!
  """תעודת זהות / National ID"""
  nationalId: String
  """שם פרטי / First name"""
  firstName: String!
  """שם משפחה / Last name"""
  lastName: String!
  """תפקיד / Role"""
  role: String
  """אימייל / Email"""
  email: String
  """שכר ברוטו (אגורות) / Gross salary minor"""
  grossSalaryMinor: Int
  """תאריך התחלת עבודה / Start date"""
  startedAt: DateTime
  """פעיל / Active"""
  active: Boolean!
}

"""הזמנה / Order"""
type Order implements Node {
  """מזהה הזמנה / Order ID"""
  id: ID!
  """מספר הזמנה / Order number"""
  number: String!
  """סטטוס / Status"""
  status: OrderStatus!
  """לקוח / Customer"""
  customer: Customer @cost(value: 5)
  """סכום כולל (אגורות) / Total in minor units"""
  totalMinor: Int!
  """שורות / Line items"""
  lines: [InvoiceLine!]! @cost(value: 10)
  """תאריך יצירה / Created at"""
  createdAt: DateTime!
}

"""תשלום / Payment"""
type Payment implements Node {
  """מזהה תשלום / Payment ID"""
  id: ID!
  """חשבונית קשורה / Linked invoice"""
  invoice: Invoice @cost(value: 5)
  """סכום (אגורות) / Amount in minor units"""
  amountMinor: Int!
  """מטבע / Currency"""
  currency: Currency!
  """אמצעי תשלום / Method"""
  method: String!
  """תאריך / Paid at"""
  paidAt: DateTime!
  """הערה / Reference"""
  reference: String
}

"""חשבון ספר ראשי / GL account"""
type Account implements Node {
  """מזהה חשבון / Account ID"""
  id: ID!
  """קוד חשבון / Account code"""
  code: String!
  """שם חשבון / Account name"""
  name: String!
  """סוג חשבון / Account type"""
  type: AccountType!
  """יתרה (אגורות) / Balance in minor units"""
  balanceMinor: Int!
  """מטבע / Currency"""
  currency: Currency!
  """פעיל / Active"""
  active: Boolean!
}

"""מסנן חשבונית / Invoice filter input"""
input InvoiceFilter {
  """סטטוס / Status"""
  status: InvoiceStatus
  """מזהה ספק / Supplier ID"""
  supplierId: ID
  """מזהה לקוח / Customer ID"""
  customerId: ID
  """מתאריך / Issued from"""
  issuedFrom: DateTime
  """עד תאריך / Issued to"""
  issuedTo: DateTime
  """מטבע / Currency"""
  currency: Currency
  """גבול רשומות / Limit"""
  limit: Int = 50
  """היסט / Offset"""
  offset: Int = 0
}

"""מסנן ספקים / Supplier filter"""
input SupplierFilter {
  """חיפוש טקסט / Text search"""
  search: String
  """מזהה מס / Tax ID"""
  taxId: String
  limit: Int = 50
  offset: Int = 0
}

"""מסנן לקוחות / Customer filter"""
input CustomerFilter {
  """חיפוש טקסט / Text search"""
  search: String
  limit: Int = 50
  offset: Int = 0
}

"""מסנן פריטים / Item filter"""
input ItemFilter {
  """חיפוש טקסט / Text search"""
  search: String
  """קטגוריה / Category"""
  category: String
  """פעיל בלבד / Active only"""
  activeOnly: Boolean = true
  limit: Int = 50
  offset: Int = 0
}

"""שורת חשבונית קלט / Invoice line input"""
input InvoiceLineInput {
  description: String!
  quantity: Float!
  unitPriceMinor: Int!
  vatPercent: Float
  itemId: ID
}

"""חשבונית חדשה / New invoice input"""
input CreateInvoiceInput {
  number: String!
  currency: Currency = ILS
  supplierId: ID
  customerId: ID
  issuedAt: DateTime!
  dueAt: DateTime
  lines: [InvoiceLineInput!]!
  notes: String
}

"""עדכון חשבונית / Invoice update input"""
input UpdateInvoiceInput {
  number: String
  status: InvoiceStatus
  currency: Currency
  supplierId: ID
  customerId: ID
  dueAt: DateTime
  lines: [InvoiceLineInput!]
  notes: String
}

"""שאילתות / Root Query"""
type Query {
  """חשבונית לפי מזהה / Invoice by ID"""
  invoice(id: ID!): Invoice @cost(value: 2)
  """חשבוניות עם מסנן / Invoices list with filter"""
  invoices(filter: InvoiceFilter): [Invoice!]! @cost(value: 5)
  """ספק לפי מזהה / Supplier by ID"""
  supplier(id: ID!): Supplier @cost(value: 2)
  """ספקים עם מסנן / Suppliers list with filter"""
  suppliers(filter: SupplierFilter): [Supplier!]! @cost(value: 5)
  """לקוח לפי מזהה / Customer by ID"""
  customer(id: ID!): Customer @cost(value: 2)
  """לקוחות עם מסנן / Customers list with filter"""
  customers(filter: CustomerFilter): [Customer!]! @cost(value: 5)
  """פריט לפי מזהה / Item by ID"""
  item(id: ID!): Item @cost(value: 2)
  """פריטים עם מסנן / Items list with filter"""
  items(filter: ItemFilter): [Item!]! @cost(value: 5)
  """עובד לפי מזהה / Employee by ID"""
  employee(id: ID!): Employee @cost(value: 2)
  """כל העובדים / All employees"""
  employees: [Employee!]! @cost(value: 5)
  """הזמנה לפי מזהה / Order by ID"""
  order(id: ID!): Order @cost(value: 2)
  """הזמנות / Orders list"""
  orders: [Order!]! @cost(value: 5)
  """תשלום / Payment by ID"""
  payment(id: ID!): Payment @cost(value: 2)
  """תשלומים / Payments list"""
  payments: [Payment!]! @cost(value: 5)
  """חשבון ספר ראשי / Account by ID"""
  account(id: ID!): Account @cost(value: 2)
  """כל החשבונות / All accounts"""
  accounts: [Account!]! @cost(value: 5)
}

"""פעולות / Root Mutation"""
type Mutation {
  """יצירת חשבונית / Create invoice"""
  createInvoice(input: CreateInvoiceInput!): Invoice!
  """עדכון חשבונית / Update invoice"""
  updateInvoice(id: ID!, input: UpdateInvoiceInput!): Invoice!
  """אישור חשבונית / Approve invoice"""
  approveInvoice(id: ID!): Invoice!
  """ביטול חשבונית / Cancel invoice"""
  cancelInvoice(id: ID!, reason: String): Invoice!
}

"""מנויים / Root Subscription"""
type Subscription {
  """חשבונית עודכנה / Invoice updated event"""
  invoiceUpdated(id: ID): Invoice!
  """חשבונית אושרה / Invoice approved event"""
  invoiceApproved: Invoice!
}
`;

Object.freeze(ERP_SDL);

// ══════════════════════════════════════════════════════════════════
// 12. DEFAULT RESOLVERS / רזולברים ברירת מחדל
// ══════════════════════════════════════════════════════════════════
//
// Stubbed to read from context.db (Supabase-compatible). Tolerates
// a missing db by returning null / [] and never throwing.

async function dbSelect(db, table, filter) {
  if (!db || typeof db.from !== 'function') return [];
  try {
    let q = db.from(table).select('*');
    if (filter && typeof filter === 'object') {
      for (const k in filter) {
        if (filter[k] === undefined || filter[k] === null) continue;
        if (typeof q.eq === 'function') q = q.eq(k, filter[k]);
      }
    }
    const res = await (typeof q.then === 'function' ? q : Promise.resolve(q));
    if (res && res.data) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  } catch (_e) {
    return [];
  }
}

async function dbGetById(db, table, id) {
  if (!db || typeof db.from !== 'function') return null;
  try {
    let q = db.from(table).select('*');
    if (typeof q.eq === 'function') q = q.eq('id', id);
    if (typeof q.single === 'function') q = q.single();
    const res = await (typeof q.then === 'function' ? q : Promise.resolve(q));
    if (res && res.data) return res.data;
    return null;
  } catch (_e) {
    return null;
  }
}

async function dbInsert(db, table, row) {
  if (!db || typeof db.from !== 'function') {
    return Object.assign({ id: 'stub-' + Math.random().toString(36).slice(2, 10) }, row);
  }
  try {
    let q = db.from(table).insert(row);
    if (typeof q.select === 'function') q = q.select();
    if (typeof q.single === 'function') q = q.single();
    const res = await (typeof q.then === 'function' ? q : Promise.resolve(q));
    if (res && res.data) return res.data;
    return row;
  } catch (_e) {
    return row;
  }
}

async function dbUpdate(db, table, id, patch) {
  if (!db || typeof db.from !== 'function') {
    return Object.assign({ id }, patch);
  }
  try {
    let q = db.from(table).update(patch);
    if (typeof q.eq === 'function') q = q.eq('id', id);
    if (typeof q.select === 'function') q = q.select();
    if (typeof q.single === 'function') q = q.single();
    const res = await (typeof q.then === 'function' ? q : Promise.resolve(q));
    if (res && res.data) return res.data;
    return Object.assign({ id }, patch);
  } catch (_e) {
    return Object.assign({ id }, patch);
  }
}

const defaultResolvers = Object.freeze({
  Query: {
    invoice: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'invoices', a.id),
    invoices: (_r, a, ctx) => dbSelect(ctx && ctx.db, 'invoices', a.filter || {}),
    supplier: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'suppliers', a.id),
    suppliers: (_r, a, ctx) => dbSelect(ctx && ctx.db, 'suppliers', a.filter || {}),
    customer: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'customers', a.id),
    customers: (_r, a, ctx) => dbSelect(ctx && ctx.db, 'customers', a.filter || {}),
    item: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'items', a.id),
    items: (_r, a, ctx) => dbSelect(ctx && ctx.db, 'items', a.filter || {}),
    employee: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'employees', a.id),
    employees: (_r, _a, ctx) => dbSelect(ctx && ctx.db, 'employees', {}),
    order: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'orders', a.id),
    orders: (_r, _a, ctx) => dbSelect(ctx && ctx.db, 'orders', {}),
    payment: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'payments', a.id),
    payments: (_r, _a, ctx) => dbSelect(ctx && ctx.db, 'payments', {}),
    account: (_r, a, ctx) => dbGetById(ctx && ctx.db, 'accounts', a.id),
    accounts: (_r, _a, ctx) => dbSelect(ctx && ctx.db, 'accounts', {}),
  },
  Mutation: {
    createInvoice: async (_r, a, ctx) => {
      const row = Object.assign({
        number: a.input.number,
        status: 'DRAFT',
        currency: a.input.currency || 'ILS',
        issuedAt: a.input.issuedAt,
        dueAt: a.input.dueAt || null,
        supplier_id: a.input.supplierId || null,
        customer_id: a.input.customerId || null,
        notes: a.input.notes || null,
      });
      return dbInsert(ctx && ctx.db, 'invoices', row);
    },
    updateInvoice: (_r, a, ctx) => dbUpdate(ctx && ctx.db, 'invoices', a.id, a.input),
    approveInvoice: async (_r, a, ctx) => {
      return dbUpdate(ctx && ctx.db, 'invoices', a.id, {
        status: 'APPROVED',
        approved_at: new Date().toISOString(),
        approved_by: (ctx && ctx.user && ctx.user.id) || 'system',
      });
    },
    cancelInvoice: (_r, a, ctx) => dbUpdate(ctx && ctx.db, 'invoices', a.id, {
      status: 'CANCELLED',
      notes: a.reason || null,
    }),
  },
  Invoice: {
    supplier: (inv, _a, ctx) => inv && inv.supplier_id ? dbGetById(ctx && ctx.db, 'suppliers', inv.supplier_id) : null,
    customer: (inv, _a, ctx) => inv && inv.customer_id ? dbGetById(ctx && ctx.db, 'customers', inv.customer_id) : null,
    lines: (inv, _a, ctx) => inv && inv.id ? dbSelect(ctx && ctx.db, 'invoice_lines', { invoice_id: inv.id }) : [],
  },
  Supplier: {
    invoices: (s, a, ctx) => s && s.id ? dbSelect(ctx && ctx.db, 'invoices', Object.assign({ supplier_id: s.id }, a.filter || {})) : [],
  },
  Customer: {
    invoices: (c, a, ctx) => c && c.id ? dbSelect(ctx && ctx.db, 'invoices', Object.assign({ customer_id: c.id }, a.filter || {})) : [],
    orders: (c, _a, ctx) => c && c.id ? dbSelect(ctx && ctx.db, 'orders', { customer_id: c.id }) : [],
  },
  Node: {
    __resolveType: (v) => {
      if (!v) return null;
      if (v.__typename) return v.__typename;
      if (v.number && v.status && v.totalMinor !== undefined) return 'Invoice';
      if (v.taxId && v.name) return 'Supplier';
      if (v.sku) return 'Item';
      if (v.code && v.type) return 'Account';
      if (v.firstName && v.lastName) return 'Employee';
      return null;
    },
  },
});

// ══════════════════════════════════════════════════════════════════
// 13. EXPRESS MIDDLEWARE / middleware ל-Express
// ══════════════════════════════════════════════════════════════════

function createServer(schema, resolvers, options) {
  options = options || {};
  const mergedResolvers = Object.assign({}, defaultResolvers, resolvers || {});
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});

  return async function graphqlMiddleware(req, res, next) {
    try {
      if (req.method === 'GET') {
        // simple schema ping
        if (options.disableGet) {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: 'GET disabled', message_he: 'GET מושבת' }] }));
          return;
        }
        const q = (req.query && req.query.query) || null;
        if (!q) {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({
            message: 'onyx-procurement GraphQL / שירות GraphQL של onyx-procurement',
            schema: schema.queryType,
            limits,
          }));
          return;
        }
        const vars = req.query.variables ? JSON.parse(req.query.variables) : {};
        const ctx = Object.assign({ resolvers: mergedResolvers }, (options.contextFactory ? options.contextFactory(req) : {}), { req });
        const result = await execute(schema, q, vars, ctx, null, { limits, operationName: req.query.operationName, includeExtensions: options.includeExtensions });
        res.statusCode = result.errors ? 200 : 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(result));
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ errors: [{ message: 'Method not allowed', message_he: 'שיטה לא מותרת' }] }));
        return;
      }
      let body = req.body;
      if (!body) body = await readBody(req);
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_e) { body = {}; }
      }
      const q = body && body.query;
      const vars = (body && body.variables) || {};
      const opName = body && body.operationName;
      if (!q) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ errors: [{ message: 'Missing query', message_he: 'חסרה שאילתה' }] }));
        return;
      }
      const ctx = Object.assign({ resolvers: mergedResolvers }, (options.contextFactory ? options.contextFactory(req) : {}), { req });
      const result = await execute(schema, q, vars, ctx, null, { limits, operationName: opName, includeExtensions: options.includeExtensions });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (err) {
      if (typeof next === 'function') return next(err);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ errors: [{ message: err.message, message_he: err.message_he || err.message }] }));
    }
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding && req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ══════════════════════════════════════════════════════════════════
// 14. EXPORTS
// ══════════════════════════════════════════════════════════════════

module.exports = {
  buildSchema,
  parseQuery,
  parseSDL,
  execute,
  createServer,
  introspectionQuery,
  printSchema,
  ERP_SDL,
  defaultResolvers,
  GraphQLError,
  DEFAULT_LIMITS,
  // low-level helpers, exported for tests / composition
  tokenize,
  typeToString,
  computeDepth,
  computeComplexity,
  computeCost,
};
