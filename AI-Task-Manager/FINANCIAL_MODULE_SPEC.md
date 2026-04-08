# Financial Module - Full Specification

## Database Architecture

### Core Entities (14 tables)

#### 1. customers
| Field | Type |
|---|---|
| id | uuid |
| customer_number | string |
| full_name | string |
| phone | string |
| email | string |
| company_name | string |
| tax_id | string |
| address | string |
| city | string |
| zip_code | string |
| notes | text |
| status_id | fk_statuses |
| created_at | datetime |
| updated_at | datetime |

#### 2. suppliers
| Field | Type |
|---|---|
| id | uuid |
| supplier_number | string |
| full_name | string |
| company_name | string |
| phone | string |
| email | string |
| tax_id | string |
| address | string |
| city | string |
| zip_code | string |
| notes | text |
| status_id | fk_statuses |
| created_at | datetime |
| updated_at | datetime |

#### 3. document_types
Seed values: receipt, invoice, invoice_receipt, payment_request, expense_invoice, expense_receipt, credit_note, other_document, recurring_document_template

#### 4. statuses
Seed values: draft, pending, open, paid, partially_paid, cancelled, archived, failed, recurring_active, recurring_paused

#### 5. documents (CENTRAL TABLE)
| Field | Type |
|---|---|
| id | uuid |
| document_number | string |
| document_type_id | fk_document_types |
| direction | enum[income, expense] |
| customer_id | nullable_fk_customers |
| supplier_id | nullable_fk_suppliers |
| issue_date | date |
| due_date | date |
| reference_number | string |
| title | string |
| description | text |
| currency | string |
| subtotal_amount | decimal |
| tax_amount | decimal |
| total_amount | decimal |
| paid_amount | decimal |
| balance_due | decimal |
| payment_method_id | nullable_fk_payment_methods |
| status_id | fk_statuses |
| is_recurring_template | boolean |
| parent_recurring_id | nullable_fk_recurring_documents |
| created_by | string |
| created_at | datetime |
| updated_at | datetime |

Rules:
- direction=income → customer_id required
- direction=expense → supplier_id required
- document_type_id required
- status_id required

#### 6. document_links
| Field | Type |
|---|---|
| id | uuid |
| source_document_id | fk_documents |
| target_document_id | fk_documents |
| link_type | enum[based_on, converted_to, paid_by, receipt_for, related_to, attachment_reference] |
| notes | text |
| created_at | datetime |

#### 7. attachments
| Field | Type |
|---|---|
| id | uuid |
| document_id | fk_documents |
| file_name | string |
| file_url | string |
| file_type | string |
| uploaded_at | datetime |
| uploaded_by | string |

#### 8. payment_methods
Seed values: cash, credit_card, bank_transfer, check, standing_order, masav, other

#### 9. payments
| Field | Type |
|---|---|
| id | uuid |
| document_id | fk_documents |
| payment_method_id | fk_payment_methods |
| payment_date | date |
| amount | decimal |
| reference_number | string |
| external_transaction_id | string |
| status_id | fk_statuses |
| notes | text |
| created_at | datetime |

Rules:
- Every payment must be linked to a document
- Payment updates paid_amount and balance_due on document

#### 10. recurring_documents
| Field | Type |
|---|---|
| id | uuid |
| template_document_id | fk_documents |
| frequency | enum[daily, weekly, monthly, yearly] |
| interval_value | integer |
| next_run_date | date |
| end_date | nullable_date |
| auto_send | boolean |
| status_id | fk_statuses |
| created_at | datetime |
| updated_at | datetime |

#### 11. standing_orders
| Field | Type |
|---|---|
| id | uuid |
| customer_id | fk_customers |
| related_document_id | nullable_fk_documents |
| amount | decimal |
| frequency | enum[monthly, bi_monthly, yearly] |
| start_date | date |
| end_date | nullable_date |
| status_id | fk_statuses |
| notes | text |
| created_at | datetime |

#### 12. credit_transactions
| Field | Type |
|---|---|
| id | uuid |
| customer_id | nullable_fk_customers |
| document_id | nullable_fk_documents |
| transaction_date | date |
| amount | decimal |
| transaction_code | string |
| provider_reference | string |
| status_id | fk_statuses |
| notes | text |
| created_at | datetime |

#### 13. categories
| Field | Type |
|---|---|
| id | uuid |
| name | string |
| direction | enum[income, expense] |
| parent_category_id | nullable_fk_categories |
| is_active | boolean |

#### 14. activity_logs
| Field | Type |
|---|---|
| id | uuid |
| entity_type | string |
| entity_id | uuid |
| action_type | enum[created, updated, deleted, linked, unlinked, uploaded_file, payment_recorded, status_changed] |
| old_value_json | json |
| new_value_json | json |
| actor | string |
| created_at | datetime |

---

## Relationships

- customers → has_many: documents, standing_orders, credit_transactions
- suppliers → has_many: documents
- documents → belongs_to: document_types, statuses, customers, suppliers, payment_methods
- documents → has_many: attachments, payments, activity_logs, outgoing_links, incoming_links
- recurring_documents → belongs_to: template_document
- payments → belongs_to: documents, payment_methods, statuses

---

## Business Rules

### Documents
- Income document must be linked to customer
- Expense document must be linked to supplier
- Document number unique per document type
- Status auto-updates based on payment

### Payments
- Full payment → status = paid
- Partial payment → status = partially_paid
- Balance 0 → balance_due = 0

### Document Links
- Payment request → Invoice
- Invoice → Receipt
- Document → Payment document

### Attachments
- Multiple files per document
- Displayed inside document screen

### Recurring
- Must be created from template_document
- Each run creates new document in documents table

---

## App Structure (10 Modules)

### 1. Dashboard
- Quick Actions: 9 buttons
- Modules Grid: 8 modules
- Summary Widgets: 5 widgets

### 2. Customers
- customers_list (table + actions)
- customer_create_form (10 fields)
- customer_profile (5 sections: details, documents, standing_orders, credit_transactions, activity_log)

### 3. Suppliers
- suppliers_list (table + actions)
- supplier_create_form (10 fields)
- supplier_profile (3 sections: details, expenses, activity_log)

### 4. Income
- income_documents_list (5 filters, 10 columns, 5 actions)
- income_document_create (12 fields)
- income_document_details (5 sections: info, links, attachments, payments, activity_log)

### 5. Expenses
- expenses_documents_list (4 filters, 7 columns, 5 actions)
- expense_upload_form (7 fields)
- expense_document_details (5 sections: info, attachments, links, payments, activity_log)

### 6. Accounting
- accounting_overview (4 widgets)
- document_relations_screen (source, target, type)
- reconciliation_screen (match, mark paid, mark partial)

### 7. Credit Clearing
- credit_transactions_list (6 columns)
- create_credit_charge (5 fields)

### 8. Standing Orders
- standing_orders_list (6 columns)
- create_standing_order (8 fields)

### 9. Recurring Documents
- recurring_templates_list (5 columns)
- create_recurring_template (7 fields)

### 10. Settings
- TBD

---

## Build Order

### Phase 1 - Foundation
statuses, document_types, payment_methods, categories

### Phase 2 - Core Entities
customers, suppliers, documents

### Phase 3 - Extensions
attachments, document_links, payments, activity_logs

### Phase 4 - Advanced Modules
recurring_documents, standing_orders, credit_transactions

### Phase 5 - UI
dashboard, list_pages, detail_pages, create_forms

### Phase 6 - Automation
status_auto_update, recurring_generation, payment_matching, activity_logging
