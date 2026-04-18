# Hebrew Full-Text Search Implementation

## Overview
To support full-text search on Hebrew text in the database, create GIN indexes on searchable columns for tables: `customers`, `employees`, `work_orders`, and `inventory`.

## Prerequisites
- PostgreSQL 10+ with Hebrew locale support
- Drizzle ORM schema files updated with `deleted_at` columns

## Setup Instructions

### 1. Create GIN Indexes for Hebrew Text Search

Run these SQL commands in PostgreSQL:

```sql
-- Customers table - search by name, contact person, email, city
CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers 
USING GIN (to_tsvector('hebrew', coalesce(customer_name, '') || ' ' || coalesce(contact_person, '') || ' ' || coalesce(email, '') || ' ' || coalesce(city, '')));

-- Employees table - search by name, email, phone, department
CREATE INDEX IF NOT EXISTS idx_employees_fts ON employees 
USING GIN (to_tsvector('hebrew', coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(department, '')));

-- Work Orders table (production_work_orders) - search by order number, description
CREATE INDEX IF NOT EXISTS idx_work_orders_fts ON production_work_orders 
USING GIN (to_tsvector('hebrew', coalesce(order_number, '') || ' ' || coalesce(description, '')));

-- Inventory table - search by item code, name, category
CREATE INDEX IF NOT EXISTS idx_inventory_fts ON inventory 
USING GIN (to_tsvector('hebrew', coalesce(item_code, '') || ' ' || coalesce(name, '') || ' ' || coalesce(category, '')));
```

### 2. Query Examples

Search for customers by name (Hebrew text):

```sql
SELECT * FROM customers 
WHERE to_tsvector('hebrew', customer_name) @@ plainto_tsquery('hebrew', 'חברת בנייה');
```

Search for employees by name or department:

```sql
SELECT * FROM employees 
WHERE to_tsvector('hebrew', full_name || ' ' || department) @@ plainto_tsquery('hebrew', 'משה ייצור');
```

### 3. API Endpoint Integration

To add FTS search endpoints, use the pattern:

```typescript
// GET /api/customers/search?q=query
app.get("/customers/search", async (req, res) => {
  const query = req.query.q as string;
  const results = await db.execute(sql`
    SELECT * FROM customers 
    WHERE to_tsvector('hebrew', customer_name || ' ' || contact_person) 
    @@ plainto_tsquery('hebrew', ${query})
    AND deleted_at IS NULL
    LIMIT 20
  `);
  res.json(results.rows);
});
```

### 4. Maintenance

Regenerate indexes after major data changes:

```sql
REINDEX INDEX idx_customers_fts;
REINDEX INDEX idx_employees_fts;
REINDEX INDEX idx_work_orders_fts;
REINDEX INDEX idx_inventory_fts;
```

## Notes
- Hebrew locale in PostgreSQL requires: `CREATE COLLATION hebrew (locale = 'he_IL.UTF-8')`
- GIN indexes are optimized for read-heavy search operations
- Include `deleted_at IS NULL` in all WHERE clauses to support soft deletes
- For production, consider using Elasticsearch or Meilisearch for advanced full-text search

## References
- [PostgreSQL Full-Text Search Docs](https://www.postgresql.org/docs/current/textsearch.html)
- [Hebrew Support in PostgreSQL](https://www.postgresql.org/docs/current/locale.html)
