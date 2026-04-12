# AG-X82 — GraphQL Schema + Executor (zero-dep)

**Agent:** X82
**Module:** `onyx-procurement/src/graphql/schema.js`
**Wave:** API / Gateway primitives
**Date:** 2026-04-11
**Status:** GREEN — 42/42 tests passing
**Deps added:** 0
**Rule honoured:** לא מוחקים רק משדרגים ומגדלים — frozen `ERP_SDL`,
frozen `defaultResolvers`, frozen `DEFAULT_LIMITS`; every export is
append-only.

---

## 1. Scope

Deliver a hand-rolled, zero-dependency GraphQL-compatible runtime that
can back Techno-Kol Uzi's mega-ERP without pulling the ~300 KB
`graphql-js` package into the deployment target.

Covers:

- **SDL parser** — types, inputs, enums, unions, interfaces, directive
  definitions, `extend type`, descriptions (single + block string),
  default values, bilingual Hebrew/English docstrings.
- **Query parser** — operations (query/mutation/subscription), variables,
  aliases, named fragments, inline fragments, directive applications,
  list and object literals.
- **Executor** — variable coercion, argument coercion, enum coercion,
  input-type coercion, list/non-null completion, default field
  resolver, async resolvers, subscriptions as async iterators.
- **Security** — depth limit, complexity limit, `@cost` directive cost
  analysis, all bilingual error messages.
- **Introspection** — `__schema`, `__type(name:)`, `__typename`.
- **Middleware** — Express-shaped handler for `POST /graphql` and
  `GET /graphql` (ping + query-string mode), no body-parser required.
- **ERP SDL** — frozen SDL for `Invoice`, `Supplier`, `Customer`,
  `Item`, `Employee`, `Order`, `Payment`, `Account`, plus `Node`
  interface and supporting inputs/enums.
- **Default resolvers** — stubs that read from `context.db` (Supabase
  PostgREST-compatible). All tolerate a missing `db` and return `[]`
  or `null` without throwing.

---

## 2. Files delivered

| File                                                                 | Role                 | LOC   |
|----------------------------------------------------------------------|----------------------|-------|
| `onyx-procurement/src/graphql/schema.js`                             | Runtime + ERP SDL    | ~1450 |
| `onyx-procurement/test/graphql/schema.test.js`                       | Unit test suite      | ~520  |
| `_qa-reports/AG-X82-graphql-schema.md`                               | This report          | n/a   |

Both directories (`src/graphql/` and `test/graphql/`) were new and
were created by this agent. No existing files were modified or
deleted.

---

## 3. Public API

```js
const {
  buildSchema,         // (sdl: string) -> Schema
  parseQuery,          // (query: string) -> Document
  execute,             // (schema, query, variables, context, rootValue, options) -> Promise<Result>
  createServer,        // (schema, resolvers, options) -> (req, res, next) => Promise<void>
  introspectionQuery,  // () -> SDL string
  printSchema,         // (schema) -> SDL string
  ERP_SDL,             // frozen SDL string for the built-in ERP schema
  defaultResolvers,    // frozen resolver map; reads from context.db
  GraphQLError,        // bilingual error class
  DEFAULT_LIMITS,      // { depthLimit: 10, complexityLimit: 1000, costLimit: 5000 }
  // low-level helpers
  tokenize, typeToString,
  computeDepth, computeComplexity, computeCost,
} = require('./src/graphql/schema');
```

### `execute` signature

```
execute(schema, query, variables, context, rootValue, options)
```

- `schema` — object returned by `buildSchema`.
- `query` — SDL string OR a pre-parsed document.
- `variables` — plain JS object; coerced against `operation.variables`.
- `context` — passed through to every resolver; may carry
  `{ db, user, resolvers, ... }`.
- `rootValue` — optional root for the first resolver call.
- `options` — `{ limits, operationName, includeExtensions }`.

Returns a promise of `{ data?, errors?, extensions? }`. For
subscriptions the return value is an async iterator that yields
`{ data, errors? }` for every push.

---

## 4. SDL excerpt (the frozen ERP schema)

The full ERP SDL lives in the `ERP_SDL` string export; the excerpt
below shows the core types. Every description is bilingual, Hebrew
first then English, separated by ` / `.

```graphql
"""סטטוס חשבונית / Invoice status"""
enum InvoiceStatus {
  """טיוטה / Draft"""            DRAFT
  """ממתין לאישור / Pending"""    PENDING
  """מאושר / Approved"""          APPROVED
  """נשלח / Sent"""               SENT
  """שולם / Paid"""               PAID
  """בוטל / Cancelled"""          CANCELLED
}

"""חשבונית / Invoice record"""
type Invoice implements Node {
  """מזהה חשבונית / Invoice ID"""
  id: ID!
  number: String!
  status: InvoiceStatus! @cost(value: 1)
  totalMinor: Int!
  currency: Currency!
  issuedAt: DateTime!
  dueAt: DateTime
  supplier: Supplier @cost(value: 5)
  customer: Customer @cost(value: 5)
  lines: [InvoiceLine!]! @cost(value: 10)
  approvedBy: String
  approvedAt: DateTime
  meta: JSON
}

"""שאילתות / Root Query"""
type Query {
  invoice(id: ID!): Invoice            @cost(value: 2)
  invoices(filter: InvoiceFilter): [Invoice!]!   @cost(value: 5)
  supplier(id: ID!): Supplier          @cost(value: 2)
  suppliers(filter: SupplierFilter): [Supplier!]! @cost(value: 5)
  customer(id: ID!): Customer          @cost(value: 2)
  customers(filter: CustomerFilter): [Customer!]! @cost(value: 5)
  item(id: ID!): Item                  @cost(value: 2)
  items(filter: ItemFilter): [Item!]!  @cost(value: 5)
  employee(id: ID!): Employee          @cost(value: 2)
  employees: [Employee!]!              @cost(value: 5)
  order(id: ID!): Order                @cost(value: 2)
  orders: [Order!]!                    @cost(value: 5)
  payment(id: ID!): Payment            @cost(value: 2)
  payments: [Payment!]!                @cost(value: 5)
  account(id: ID!): Account            @cost(value: 2)
  accounts: [Account!]!                @cost(value: 5)
}

"""פעולות / Root Mutation"""
type Mutation {
  createInvoice(input: CreateInvoiceInput!): Invoice!
  updateInvoice(id: ID!, input: UpdateInvoiceInput!): Invoice!
  approveInvoice(id: ID!): Invoice!
  cancelInvoice(id: ID!, reason: String): Invoice!
}

"""מנויים / Root Subscription"""
type Subscription {
  invoiceUpdated(id: ID): Invoice!
  invoiceApproved: Invoice!
}
```

Types also present in the full SDL but omitted from the excerpt:
`InvoiceLine`, `Supplier`, `Customer`, `Item`, `Employee`, `Order`,
`Payment`, `Account`, plus `Currency`, `OrderStatus`, `AccountType`
enums and their associated filter / input types.

---

## 5. Resolver pattern

Every resolver is a plain `async (source, args, context, info)` function.
The default resolver map reads from `context.db` using a Supabase-style
fluent API (`.from(table).select().eq('id', x).single()`). When `db`
is missing or throws, the resolver returns `null` / `[]` — the executor
surfaces no error to the client, honouring the "never crash" operational
posture of the ERP.

### Example — `Query.invoice`

```js
Query: {
  invoice: (_root, args, ctx) =>
    dbGetById(ctx && ctx.db, 'invoices', args.id),
}
```

### Example — `Mutation.approveInvoice`

```js
Mutation: {
  approveInvoice: async (_r, a, ctx) => {
    return dbUpdate(ctx && ctx.db, 'invoices', a.id, {
      status: 'APPROVED',
      approved_at: new Date().toISOString(),
      approved_by: (ctx && ctx.user && ctx.user.id) || 'system',
    });
  },
}
```

### Example — relationship resolver (`Invoice.supplier`)

```js
Invoice: {
  supplier: (inv, _a, ctx) =>
    inv && inv.supplier_id
      ? dbGetById(ctx && ctx.db, 'suppliers', inv.supplier_id)
      : null,
}
```

### Composing your own resolvers

```js
const { buildSchema, createServer, defaultResolvers, ERP_SDL } =
  require('./src/graphql/schema');

const schema = buildSchema(ERP_SDL);

const app = express();
app.use('/graphql', createServer(schema, {
  // Overlay only the pieces you want to override.
  // Every key NOT mentioned here falls through to defaultResolvers.
  Query: {
    invoices: async (_r, args, ctx) => customInvoiceLookup(ctx.db, args.filter),
  },
}, {
  limits: { depthLimit: 8, complexityLimit: 500, costLimit: 4000 },
  contextFactory: (req) => ({ db: req.app.locals.db, user: req.user }),
}));
```

The third argument to `createServer` is optional; defaults are sane
for the ERP.

---

## 6. Security limits

| Limit           | Default | Code                            | Hebrew key                    |
|-----------------|---------|---------------------------------|-------------------------------|
| depth           | 10      | `DEPTH_LIMIT_EXCEEDED`          | עומק השאילתה                  |
| complexity      | 1000    | `COMPLEXITY_LIMIT_EXCEEDED`     | סיבוכיות השאילתה              |
| cost (@cost)    | 5000    | `COST_LIMIT_EXCEEDED`           | עלות השאילתה                  |

**Depth** counts nested selection sets (`{ a { b { c } } }` = 3).

**Complexity** is the total number of selected fields after `@skip` /
`@include` filtering and fragment inlining. Cheap but catches
"laundry-list" queries.

**Cost** walks the selection set against the schema and sums each
field's `@cost(value: N)` directive. Fields without a directive
contribute `1`. This is the knob the DBA tunes — e.g. `Invoice.lines`
and `Supplier.invoices` carry `@cost(10)` to discourage N+1 fan-out
queries without explicit pagination.

All three limits are enforced **before** any resolver runs. Violations
are returned as structured errors with both `message` (English) and
`message_he` (Hebrew) fields, plus `extensions.code` for machine use.

### Default built-in directives

- `@skip(if: Boolean!)` — standard, on FIELD/FRAGMENT_SPREAD/INLINE_FRAGMENT
- `@include(if: Boolean!)` — standard
- `@cost(value: Int! = 1)` — FIELD_DEFINITION, used by the cost analyser

The built-ins are installed by `buildSchema` even if the SDL omits
them, so caller SDL can rely on their presence.

---

## 7. Test coverage

42 tests, grouped into 14 suites. All green, run under `node --test`.

```
ℹ tests 42
ℹ pass 42
ℹ fail 0
ℹ duration_ms ~150
```

Suites:

1. **SDL parser** — object types, enums/inputs, unions/interfaces,
   built-in directives, full ERP_SDL parse, bilingual descriptions
   survive tokenisation, comment stripping.
2. **Query parser** — simple query, variables, named + inline
   fragments, field aliases.
3. **execute simple** — single field, args, nested selection, aliases.
4. **execute mutation** — small SDL `addBook`, ERP `createInvoice`
   with missing `db` (stub path).
5. **fragments** — named spread + inline on union with `__typename`.
6. **variables** — non-null enforcement, value passthrough, nested
   enum coercion inside input type, invalid enum rejection.
7. **directives @skip / @include** — both directions.
8. **depth limit** — reject, accept, default value assertion.
9. **complexity limit** — compute then reject.
10. **cost analysis** — sum `@cost` then reject.
11. **introspection** — `__schema`, `__type`, `__typename`.
12. **printSchema** — output contains expected types, re-parses cleanly.
13. **GraphQLError** — bilingual messages preserved through `toJSON`.
14. **defaultResolvers** — tolerate missing `db`, consume a Supabase-
    shaped `from().select().eq().single()` promise chain.

### Running the tests

```
cd onyx-procurement
node --test test/graphql/schema.test.js
```

---

## 8. Hebrew glossary (מונחון)

Terms used in SDL descriptions, error messages, and resolver comments.

| English              | Hebrew                 | Context                                   |
|----------------------|------------------------|-------------------------------------------|
| Invoice              | חשבונית                | `Invoice`                                 |
| Supplier             | ספק                    | `Supplier`                                |
| Customer             | לקוח                   | `Customer`                                |
| Item                 | פריט                   | `Item`                                    |
| Employee             | עובד                   | `Employee`                                |
| Order                | הזמנה                  | `Order`                                   |
| Payment              | תשלום                  | `Payment`                                 |
| Account (GL)         | חשבון ספר ראשי         | `Account`                                 |
| Invoice line         | שורת חשבונית           | `InvoiceLine`                             |
| Status               | סטטוס                  | enum labels                               |
| Draft                | טיוטה                  | `InvoiceStatus.DRAFT`                     |
| Pending approval     | ממתין לאישור           | `InvoiceStatus.PENDING`                   |
| Approved             | מאושר                  | `InvoiceStatus.APPROVED`                  |
| Sent                 | נשלח                   | `InvoiceStatus.SENT`                      |
| Paid                 | שולם                   | `InvoiceStatus.PAID`                      |
| Cancelled            | בוטל                   | `InvoiceStatus.CANCELLED`                 |
| Currency             | מטבע                   | `Currency` enum                           |
| Total amount         | סכום כולל              | `totalMinor` field                        |
| Minor units          | אגורות / cents         | convention across ERP                     |
| Issue date           | תאריך הנפקה            | `issuedAt` field                          |
| Due date             | תאריך פירעון           | `dueAt` field                             |
| Tax ID (ח.פ)         | מספר עוסק מורשה        | `Supplier.taxId`                          |
| National ID          | תעודת זהות             | `Employee.nationalId`                     |
| Gross salary         | שכר ברוטו              | `Employee.grossSalaryMinor`               |
| Balance              | יתרה                   | `Account.balanceMinor`                    |
| Outstanding balance  | יתרה לתשלום            | `Customer.outstandingMinor`               |
| Filter               | מסנן                   | `*Filter` input types                     |
| Query                | שאילתה                 | operation                                 |
| Mutation             | פעולה                  | operation                                 |
| Subscription         | מנוי                   | operation                                 |
| Query depth          | עומק שאילתה            | `DEPTH_LIMIT_EXCEEDED`                    |
| Query complexity     | סיבוכיות שאילתה        | `COMPLEXITY_LIMIT_EXCEEDED`               |
| Query cost           | עלות שאילתה            | `COST_LIMIT_EXCEEDED`                     |
| Required field       | שדה חובה               | coercion errors                           |
| Missing              | חסר                    | error message prefix                      |
| Unexpected token     | אסימון בלתי צפוי       | syntax error                              |
| Unknown operation    | פעולה לא מוכרת         | `OPERATION_NOT_FOUND`                     |
| Invalid enum value   | ערך enum לא חוקי       | `COERCION_ERROR`                          |
| Null in non-null     | null עבור שדה חובה     | `NULL_IN_NON_NULL`                        |
| Introspection        | אינטרוספקציה           | `__schema`, `__type`                      |
| Schema               | סכמה                   | root of everything                        |
| Shalom               | שלום                   | smoke-test greeting                       |

---

## 9. Integration notes

### Mounting under onyx-procurement's Express app

```js
// onyx-procurement/server.js (existing file — do NOT replace wholesale)
const { buildSchema, createServer, ERP_SDL, defaultResolvers } =
  require('./src/graphql/schema');

const schema = buildSchema(ERP_SDL);

app.use('/graphql', createServer(schema, defaultResolvers, {
  // Supabase client injected via app.locals.db by the bootstrap layer.
  contextFactory: (req) => ({
    db: req.app.locals.db,
    user: req.user,
  }),
  // Tight defaults — tune per environment.
  limits: {
    depthLimit: 10,
    complexityLimit: 500,
    costLimit: 2000,
  },
  includeExtensions: process.env.NODE_ENV !== 'production',
}));
```

The middleware returns **200** for successful requests and for
GraphQL errors (standard GraphQL convention — spec-compliant clients
inspect the `errors` field). Transport errors (bad JSON, wrong
method) return **400** / **405** with a bilingual error body.

### Extending the schema without breaking the frozen SDL

The rule is *never delete, only upgrade*. To add fields:

```js
const { buildSchema, ERP_SDL } = require('./src/graphql/schema');

const extendedSDL = ERP_SDL + `
  extend type Invoice {
    """שלב אישור / Approval step"""
    approvalStep: Int
  }
`;

const schema = buildSchema(extendedSDL);
```

`buildSchema` handles `extend type` by merging new fields into the
existing frozen type (a new frozen object is produced — the original
is never mutated).

---

## 10. Known limitations (intentional, not bugs)

- **No fragment variable validation** — fragments may reference
  variables the operation did not declare; we surface the failure
  only at execute-time.
- **No custom scalar serialisers** — `DateTime` and `JSON` round-trip
  verbatim. If you need a parser/serialiser, wire it through the
  resolver layer.
- **Subscriptions have no built-in pub/sub** — the subscription
  resolver must return an async iterator. Pair with
  `onyx-procurement/src/realtime/` for the pub/sub side.
- **Introspection is partial** — `__schema`/`__type` return enough
  for GraphiQL autocomplete and tooling but omit some uncommon fields
  (`isDeprecated`, `deprecationReason`). The SDL parser preserves
  everything in-memory, so these can be added without schema changes.
- **No query caching** — every call re-parses. Wrap `parseQuery` in a
  `Map` if hot queries dominate the workload.

These are explicit trade-offs to stay under the zero-dep budget.
Every one can be upgraded in place without breaking callers.

---

## 11. Compliance with the mega-ERP rules

| Rule                                           | Status                                                        |
|------------------------------------------------|---------------------------------------------------------------|
| לא מוחקים רק משדרגים ומגדלים                    | Honoured — all exports frozen, `extend type` supported       |
| Zero external runtime deps                     | Honoured — `node:` built-ins only (none actually needed)     |
| Node >= 16                                     | Honoured — uses only ES2020+ and `async/await`               |
| Bilingual Hebrew + English                     | Honoured — descriptions, errors, glossary                    |
| No existing file deleted / mutated              | Honoured — two new files, one new report                     |

---

## 12. Follow-up agents (suggested)

- **AG-X83** — GraphiQL HTML playground mounted at `/graphql/ui`
  (10 LoC, zero deps).
- **AG-X84** — `persistedQueries` hash-map with LRU eviction.
- **AG-X85** — DataLoader-style batching helper layered over the
  existing resolvers to kill N+1.
- **AG-X86** — schema diff tool that compares two SDL strings and
  flags breaking changes (forbidden by the "never delete" rule).

---

**End of AG-X82 report.**
