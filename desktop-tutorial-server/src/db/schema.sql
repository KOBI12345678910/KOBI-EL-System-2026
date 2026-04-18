-- קטגוריות ספקים
CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT DEFAULT '#6366f1',
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ספקים
CREATE TABLE IF NOT EXISTS suppliers (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL,
    contact_name          TEXT,
    email                 TEXT,
    phone                 TEXT,
    category_id           INTEGER REFERENCES categories(id),
    payment_terms         TEXT DEFAULT 'shotef_plus_30',
    custom_terms_days     INTEGER,
    expected_invoice_day  INTEGER,
    notes                 TEXT,
    is_active             INTEGER DEFAULT 1,
    created_at            TEXT DEFAULT (datetime('now')),
    updated_at            TEXT DEFAULT (datetime('now'))
);

-- חשבוניות
CREATE TABLE IF NOT EXISTS invoices (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id             INTEGER NOT NULL REFERENCES suppliers(id),
    invoice_number          TEXT,
    invoice_date            TEXT NOT NULL,
    due_date                TEXT,
    amount                  REAL NOT NULL,
    amount_before_vat       REAL,
    vat_amount              REAL,
    currency                TEXT DEFAULT 'ILS',
    source                  TEXT NOT NULL DEFAULT 'manual',
    source_ref              TEXT,
    file_path               TEXT,
    status                  TEXT DEFAULT 'pending',
    approved_by             TEXT,
    approved_at             TEXT,
    notes                   TEXT,
    forwarded_to_accountant INTEGER DEFAULT 0,
    forwarded_at            TEXT,
    created_at              TEXT DEFAULT (datetime('now')),
    updated_at              TEXT DEFAULT (datetime('now'))
);

-- תשלומים
CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id),
    amount          REAL NOT NULL,
    payment_date    TEXT NOT NULL,
    payment_method  TEXT,
    reference       TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- התראות
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       INTEGER,
    message         TEXT NOT NULL,
    is_read         INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- הגדרות
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

-- אינדקסים
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- לוג תזכורות
CREATE TABLE IF NOT EXISTS reminder_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER NOT NULL REFERENCES suppliers(id),
    method          TEXT NOT NULL,
    message         TEXT,
    sent_at         TEXT DEFAULT (datetime('now'))
);

-- חשבוניות חוזרות
CREATE TABLE IF NOT EXISTS recurring_invoices (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id       INTEGER NOT NULL REFERENCES suppliers(id),
    description       TEXT,
    expected_amount   REAL NOT NULL,
    frequency         TEXT DEFAULT 'monthly',
    day_of_month      INTEGER DEFAULT 1,
    is_active         INTEGER DEFAULT 1,
    last_created_at   TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
);

-- תקציבים
CREATE TABLE IF NOT EXISTS budgets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    month           INTEGER NOT NULL,
    year            INTEGER NOT NULL,
    amount          REAL NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(category_id, month, year)
);

-- לוג פעולות
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    action          TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       INTEGER,
    details         TEXT,
    performed_by    TEXT DEFAULT 'system',
    created_at      TEXT DEFAULT (datetime('now'))
);

-- תגיות
CREATE TABLE IF NOT EXISTS tags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT DEFAULT '#6366f1'
);

-- קישור תגיות לחשבוניות
CREATE TABLE IF NOT EXISTS invoice_tags (
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (invoice_id, tag_id)
);

-- אינדקסים נוספים
CREATE INDEX IF NOT EXISTS idx_reminder_log_supplier ON reminder_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_recurring_supplier ON recurring_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- קטגוריות ברירת מחדל
INSERT OR IGNORE INTO categories (name, color) VALUES
    ('חומרי גלם', '#ef4444'),
    ('שירותים', '#3b82f6'),
    ('שכירות', '#10b981'),
    ('ציוד', '#f59e0b'),
    ('שיווק', '#8b5cf6'),
    ('הובלה', '#ec4899'),
    ('אחר', '#6b7280');
