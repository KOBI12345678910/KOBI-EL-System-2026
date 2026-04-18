/**
 * GraphQL Schema + Executor — Unit Tests
 * Agent X82 — Kobi's mega-ERP for Techno-Kol Uzi.
 *
 * Covers:
 *   - SDL parse (types, inputs, enums, unions, interfaces, directives)
 *   - Query parse (selections, fragments, aliases, variables)
 *   - execute() simple query
 *   - execute() mutation
 *   - execute() fragment (named + inline)
 *   - execute() variables + aliases
 *   - execute() @skip / @include
 *   - depth limit enforcement
 *   - complexity limit enforcement
 *   - cost limit enforcement
 *   - introspection __schema / __type / __typename
 *   - printSchema round-trip
 *   - Hebrew descriptions survive parsing
 *
 * Run with:   node --test test/graphql/schema.test.js
 *       or:   node test/run.js --only graphql
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  buildSchema,
  execute,
  parseQuery,
  introspectionQuery,
  printSchema,
  ERP_SDL,
  defaultResolvers,
  GraphQLError,
  DEFAULT_LIMITS,
  computeDepth,
  computeComplexity,
  computeCost,
  tokenize,
} = require(path.resolve(__dirname, '..', '..', 'src', 'graphql', 'schema.js'));

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const SMALL_SDL = `
"""ספר / Book"""
type Book {
  """מזהה / ID"""
  id: ID!
  """כותרת / Title"""
  title: String!
  """מחבר / Author"""
  author: Author
  tags: [String!]!
}

type Author {
  id: ID!
  name: String!
  books: [Book!]!
}

enum Genre {
  FICTION
  NONFICTION
}

input BookFilter {
  genre: Genre
  limit: Int = 10
}

interface Node {
  id: ID!
}

union SearchResult = Book | Author

type Query {
  book(id: ID!): Book
  books(filter: BookFilter): [Book!]!
  search(q: String!): [SearchResult!]!
  hello: String!
}

type Mutation {
  addBook(title: String!, authorId: ID): Book!
}
`;

// in-memory data store for tests
function makeDataStore() {
  const authors = [
    { id: 'a1', name: 'Amos Oz', __typename: 'Author' },
    { id: 'a2', name: 'David Grossman', __typename: 'Author' },
  ];
  const books = [
    { id: 'b1', title: 'A Tale of Love and Darkness', authorId: 'a1', tags: ['memoir'] },
    { id: 'b2', title: 'To the End of the Land', authorId: 'a2', tags: ['novel'] },
  ];
  return { authors, books };
}

function makeResolvers(store) {
  return {
    Query: {
      book: (_r, args) => store.books.find((b) => b.id === args.id) || null,
      books: (_r, args) => {
        const lim = (args.filter && args.filter.limit) || 10;
        return store.books.slice(0, lim);
      },
      search: (_r, args) => {
        const q = args.q.toLowerCase();
        const out = [];
        for (const b of store.books) if (b.title.toLowerCase().indexOf(q) !== -1) out.push(Object.assign({ __typename: 'Book' }, b));
        for (const a of store.authors) if (a.name.toLowerCase().indexOf(q) !== -1) out.push(a);
        return out;
      },
      hello: () => 'shalom / שלום',
    },
    Mutation: {
      addBook: (_r, args) => {
        const row = { id: 'b' + (store.books.length + 1), title: args.title, authorId: args.authorId || null, tags: [] };
        store.books.push(row);
        return row;
      },
    },
    Book: {
      author: (b) => store.authors.find((a) => a.id === b.authorId) || null,
    },
    Author: {
      books: (a) => store.books.filter((b) => b.authorId === a.id),
    },
    SearchResult: {
      __resolveType: (v) => v.__typename || (v.title ? 'Book' : 'Author'),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. SDL PARSE
// ═══════════════════════════════════════════════════════════════

describe('SDL parser', () => {
  test('parses object types with descriptions', () => {
    const schema = buildSchema(SMALL_SDL);
    assert.ok(schema.types.Book);
    assert.equal(schema.types.Book.kind, 'OBJECT');
    assert.equal(schema.types.Book.description, 'ספר / Book');
    assert.ok(schema.types.Book.fields.title);
    assert.equal(schema.types.Book.fields.id.type.kind, 'NON_NULL');
  });

  test('parses enums and input types', () => {
    const schema = buildSchema(SMALL_SDL);
    assert.equal(schema.types.Genre.kind, 'ENUM');
    assert.ok(schema.types.Genre.values.FICTION);
    assert.equal(schema.types.BookFilter.kind, 'INPUT');
    assert.ok(schema.types.BookFilter.fields.limit.defaultValue);
  });

  test('parses union and interface', () => {
    const schema = buildSchema(SMALL_SDL);
    assert.equal(schema.types.Node.kind, 'INTERFACE');
    assert.equal(schema.types.SearchResult.kind, 'UNION');
    assert.deepEqual(schema.types.SearchResult.memberTypes, ['Book', 'Author']);
  });

  test('parses directives @skip / @include / @cost are built-in', () => {
    const schema = buildSchema(SMALL_SDL);
    assert.ok(schema.directives.skip);
    assert.ok(schema.directives.include);
    assert.ok(schema.directives.cost);
  });

  test('parses the full ERP_SDL', () => {
    const schema = buildSchema(ERP_SDL);
    assert.ok(schema.types.Invoice);
    assert.ok(schema.types.Supplier);
    assert.ok(schema.types.Customer);
    assert.ok(schema.types.Item);
    assert.ok(schema.types.Employee);
    assert.ok(schema.types.Order);
    assert.ok(schema.types.Payment);
    assert.ok(schema.types.Account);
    assert.equal(schema.queryType, 'Query');
    assert.equal(schema.mutationType, 'Mutation');
    assert.equal(schema.subscriptionType, 'Subscription');
  });

  test('ERP_SDL has bilingual descriptions', () => {
    const schema = buildSchema(ERP_SDL);
    // Invoice.status should have Hebrew "סטטוס"
    const statusDesc = schema.types.Invoice.fields.status.description;
    assert.ok(statusDesc);
    assert.ok(statusDesc.indexOf('סטטוס') !== -1, 'missing Hebrew in status description');
    assert.ok(statusDesc.indexOf('Status') !== -1, 'missing English in status description');
  });

  test('tokenizer skips comments and handles punctuators', () => {
    const toks = tokenize('# comment\ntype X { a: Int! }');
    assert.ok(toks.length > 0);
    assert.equal(toks[0].value, 'type');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. QUERY PARSE
// ═══════════════════════════════════════════════════════════════

describe('Query parser', () => {
  test('parses simple query', () => {
    const doc = parseQuery('{ hello }');
    assert.equal(doc.definitions.length, 1);
    assert.equal(doc.definitions[0].operation, 'query');
  });

  test('parses query with variables', () => {
    const doc = parseQuery('query GetBook($id: ID!) { book(id: $id) { title } }');
    const op = doc.definitions[0];
    assert.equal(op.name, 'GetBook');
    assert.equal(op.variables.length, 1);
    assert.equal(op.variables[0].name, 'id');
  });

  test('parses fragments named + inline', () => {
    const doc = parseQuery(`
      query { search(q: "oz") { ...bookFields ... on Author { name } } }
      fragment bookFields on Book { title }
    `);
    assert.equal(doc.definitions.length, 2);
    assert.equal(doc.definitions[1].kind, 'Fragment');
    assert.equal(doc.definitions[1].typeCondition, 'Book');
  });

  test('parses field aliases', () => {
    const doc = parseQuery('{ greeting: hello }');
    const field = doc.definitions[0].selectionSet.selections[0];
    assert.equal(field.alias, 'greeting');
    assert.equal(field.name, 'hello');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. EXECUTE — simple queries
// ═══════════════════════════════════════════════════════════════

describe('execute simple', () => {
  test('executes hello query', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, '{ hello }', {}, { resolvers });
    assert.equal(result.errors, undefined);
    assert.equal(result.data.hello, 'shalom / שלום');
  });

  test('executes query with args', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, '{ book(id: "b1") { id title } }', {}, { resolvers });
    assert.equal(result.data.book.id, 'b1');
    assert.equal(result.data.book.title, 'A Tale of Love and Darkness');
  });

  test('executes nested query (Book -> Author -> books)', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, `
      {
        book(id: "b1") {
          title
          author { name books { id title } }
        }
      }
    `, {}, { resolvers });
    assert.equal(result.data.book.author.name, 'Amos Oz');
    assert.equal(result.data.book.author.books.length, 1);
  });

  test('field aliases work', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, '{ greeting: hello }', {}, { resolvers });
    assert.equal(result.data.greeting, 'shalom / שלום');
    assert.equal(result.data.hello, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. EXECUTE — mutations
// ═══════════════════════════════════════════════════════════════

describe('execute mutation', () => {
  test('mutation addBook appends to store', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const before = store.books.length;
    const result = await execute(schema,
      'mutation Add($t: String!) { addBook(title: $t) { id title } }',
      { t: 'New Title' },
      { resolvers }
    );
    assert.equal(result.errors, undefined);
    assert.equal(store.books.length, before + 1);
    assert.equal(result.data.addBook.title, 'New Title');
  });

  test('ERP mutation createInvoice stub tolerates missing db', async () => {
    const schema = buildSchema(ERP_SDL);
    const result = await execute(schema, `
      mutation { createInvoice(input: {
        number: "INV-001"
        issuedAt: "2026-04-11T00:00:00Z"
        lines: [{ description: "עבודות חשמל", quantity: 1, unitPriceMinor: 10000 }]
      }) { number status } }
    `, {}, { resolvers: defaultResolvers, db: null });
    assert.equal(result.errors, undefined);
    assert.equal(result.data.createInvoice.number, 'INV-001');
    assert.equal(result.data.createInvoice.status, 'DRAFT');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. FRAGMENTS
// ═══════════════════════════════════════════════════════════════

describe('fragments', () => {
  test('named fragment spreads work', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, `
      query { book(id: "b1") { ...BookCore } }
      fragment BookCore on Book { id title tags }
    `, {}, { resolvers });
    assert.equal(result.errors, undefined);
    assert.equal(result.data.book.title, 'A Tale of Love and Darkness');
    assert.ok(Array.isArray(result.data.book.tags));
  });

  test('inline fragment on union', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, `
      {
        search(q: "oz") {
          __typename
          ... on Book { title }
          ... on Author { name }
        }
      }
    `, {}, { resolvers });
    assert.equal(result.errors, undefined);
    assert.ok(Array.isArray(result.data.search));
    const types = new Set(result.data.search.map((r) => r.__typename));
    assert.ok(types.has('Book') || types.has('Author'));
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. VARIABLES
// ═══════════════════════════════════════════════════════════════

describe('variables', () => {
  test('non-null variable enforced', async () => {
    const schema = buildSchema(SMALL_SDL);
    const resolvers = makeResolvers(makeDataStore());
    const result = await execute(schema,
      'query GetBook($id: ID!) { book(id: $id) { title } }',
      {},
      { resolvers }
    );
    assert.ok(result.errors);
    assert.ok(result.errors[0].message.indexOf('required') !== -1);
  });

  test('variable passes through to args', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema,
      'query GetBook($id: ID!) { book(id: $id) { title } }',
      { id: 'b2' },
      { resolvers }
    );
    assert.equal(result.data.book.title, 'To the End of the Land');
  });

  test('enum variable coerced', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema,
      'query Q($f: BookFilter) { books(filter: $f) { id } }',
      { f: { genre: 'FICTION', limit: 1 } },
      { resolvers }
    );
    assert.equal(result.errors, undefined);
    assert.equal(result.data.books.length, 1);
  });

  test('invalid enum rejected', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema,
      'query Q($f: BookFilter) { books(filter: $f) { id } }',
      { f: { genre: 'NOT_A_GENRE' } },
      { resolvers }
    );
    assert.ok(result.errors);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. DIRECTIVES @skip / @include
// ═══════════════════════════════════════════════════════════════

describe('directives @skip / @include', () => {
  test('@skip skips field', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, `
      query ($skip: Boolean!) { book(id: "b1") { id title @skip(if: $skip) } }
    `, { skip: true }, { resolvers });
    assert.equal(result.errors, undefined);
    assert.equal(result.data.book.title, undefined);
    assert.equal(result.data.book.id, 'b1');
  });

  test('@include excludes when false', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, `
      query ($inc: Boolean!) { book(id: "b1") { id title @include(if: $inc) } }
    `, { inc: false }, { resolvers });
    assert.equal(result.data.book.title, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. DEPTH LIMIT
// ═══════════════════════════════════════════════════════════════

describe('depth limit', () => {
  test('rejects query deeper than limit', async () => {
    const schema = buildSchema(SMALL_SDL);
    const resolvers = makeResolvers(makeDataStore());
    const result = await execute(schema, `
      { book(id: "b1") { author { books { author { books { author { name } } } } } } }
    `, {}, { resolvers }, null, { limits: { depthLimit: 3 } });
    assert.ok(result.errors);
    assert.equal(result.errors[0].extensions.code, 'DEPTH_LIMIT_EXCEEDED');
    assert.ok(result.errors[0].message_he.indexOf('עומק') !== -1);
  });

  test('accepts query within depth limit', async () => {
    const schema = buildSchema(SMALL_SDL);
    const resolvers = makeResolvers(makeDataStore());
    const result = await execute(schema,
      '{ book(id: "b1") { title author { name } } }',
      {},
      { resolvers },
      null,
      { limits: { depthLimit: 5 } }
    );
    assert.equal(result.errors, undefined);
  });

  test('default depth limit is 10', () => {
    assert.equal(DEFAULT_LIMITS.depthLimit, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. COMPLEXITY LIMIT
// ═══════════════════════════════════════════════════════════════

describe('complexity limit', () => {
  test('computes complexity', () => {
    const doc = parseQuery('{ book(id: "b1") { id title author { name } } }');
    const c = computeComplexity(doc.definitions[0].selectionSet, {}, {});
    // book + id + title + author + name = 5
    assert.equal(c, 5);
  });

  test('rejects overly complex query', async () => {
    const schema = buildSchema(SMALL_SDL);
    const resolvers = makeResolvers(makeDataStore());
    const result = await execute(schema,
      '{ book(id: "b1") { id title author { id name } } }',
      {},
      { resolvers },
      null,
      { limits: { complexityLimit: 2 } }
    );
    assert.ok(result.errors);
    assert.equal(result.errors[0].extensions.code, 'COMPLEXITY_LIMIT_EXCEEDED');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. COST LIMIT (@cost directive)
// ═══════════════════════════════════════════════════════════════

describe('cost analysis', () => {
  test('sums @cost directive values', () => {
    const schema = buildSchema(ERP_SDL);
    const doc = parseQuery('{ invoices { id lines { id } } }');
    const c = computeCost(schema, 'Query', doc.definitions[0].selectionSet, {}, {});
    // invoices @cost(5) + id (1) + lines @cost(10) + id (1) = 17
    assert.ok(c >= 17);
  });

  test('rejects when cost exceeds limit', async () => {
    const schema = buildSchema(ERP_SDL);
    const result = await execute(schema,
      '{ invoices { id lines { id } } }',
      {},
      { resolvers: defaultResolvers, db: null },
      null,
      { limits: { costLimit: 5 } }
    );
    assert.ok(result.errors);
    assert.equal(result.errors[0].extensions.code, 'COST_LIMIT_EXCEEDED');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. INTROSPECTION
// ═══════════════════════════════════════════════════════════════

describe('introspection', () => {
  test('introspectionQuery returns SDL string', () => {
    const q = introspectionQuery();
    assert.equal(typeof q, 'string');
    assert.ok(q.indexOf('__schema') !== -1);
  });

  test('__typename field on object', async () => {
    const schema = buildSchema(SMALL_SDL);
    const store = makeDataStore();
    const resolvers = makeResolvers(store);
    const result = await execute(schema, '{ book(id: "b1") { __typename id } }', {}, { resolvers });
    assert.equal(result.data.book.__typename, 'Book');
  });

  test('__schema query returns types', async () => {
    const schema = buildSchema(SMALL_SDL);
    const result = await execute(schema,
      '{ __schema { queryType { name } types { name kind } } }',
      {},
      { resolvers: makeResolvers(makeDataStore()) }
    );
    assert.equal(result.errors, undefined);
    assert.equal(result.data.__schema.queryType.name, 'Query');
    assert.ok(Array.isArray(result.data.__schema.types));
    const names = result.data.__schema.types.map((t) => t.name);
    assert.ok(names.indexOf('Book') !== -1);
    assert.ok(names.indexOf('Author') !== -1);
  });

  test('__type(name:) returns a single type', async () => {
    const schema = buildSchema(SMALL_SDL);
    const result = await execute(schema,
      '{ __type(name: "Book") { name kind } }',
      {},
      { resolvers: makeResolvers(makeDataStore()) }
    );
    assert.equal(result.errors, undefined);
    assert.equal(result.data.__type.name, 'Book');
    assert.equal(result.data.__type.kind, 'OBJECT');
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. printSchema
// ═══════════════════════════════════════════════════════════════

describe('printSchema', () => {
  test('prints types and fields', () => {
    const schema = buildSchema(SMALL_SDL);
    const sdl = printSchema(schema);
    assert.ok(sdl.indexOf('type Book') !== -1);
    assert.ok(sdl.indexOf('type Author') !== -1);
    assert.ok(sdl.indexOf('enum Genre') !== -1);
  });

  test('printed SDL re-parses', () => {
    const schema = buildSchema(SMALL_SDL);
    const sdl = printSchema(schema);
    const schema2 = buildSchema(sdl);
    assert.ok(schema2.types.Book);
    assert.ok(schema2.types.Genre);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. GraphQLError bilingual
// ═══════════════════════════════════════════════════════════════

describe('GraphQLError', () => {
  test('has bilingual messages', () => {
    const err = new GraphQLError('English', { message_he: 'עברית', code: 'TEST' });
    assert.equal(err.message, 'English');
    assert.equal(err.message_he, 'עברית');
    const j = err.toJSON();
    assert.equal(j.extensions.code, 'TEST');
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. defaultResolvers tolerate missing db
// ═══════════════════════════════════════════════════════════════

describe('defaultResolvers', () => {
  test('invoices() returns [] when db missing', async () => {
    const schema = buildSchema(ERP_SDL);
    const result = await execute(schema, '{ invoices { id } }', {}, { resolvers: defaultResolvers, db: null });
    assert.equal(result.errors, undefined);
    assert.deepEqual(result.data.invoices, []);
  });

  test('suppliers() returns [] when db missing', async () => {
    const schema = buildSchema(ERP_SDL);
    const result = await execute(schema, '{ suppliers { id name } }', {}, { resolvers: defaultResolvers, db: null });
    assert.equal(result.errors, undefined);
    assert.deepEqual(result.data.suppliers, []);
  });

  test('db stub with from().select().eq() is consumed', async () => {
    const fakeDb = {
      from: () => ({
        select: function () { return this; },
        eq: function () { return this; },
        single: function () { return this; },
        then: function (cb) { return Promise.resolve({ data: { id: 'X1', name: 'Stub Supplier', __typename: 'Supplier' } }).then(cb); },
      }),
    };
    const schema = buildSchema(ERP_SDL);
    const result = await execute(schema,
      '{ supplier(id: "X1") { id name } }',
      {},
      { resolvers: defaultResolvers, db: fakeDb }
    );
    assert.equal(result.errors, undefined);
    assert.equal(result.data.supplier.id, 'X1');
  });
});
