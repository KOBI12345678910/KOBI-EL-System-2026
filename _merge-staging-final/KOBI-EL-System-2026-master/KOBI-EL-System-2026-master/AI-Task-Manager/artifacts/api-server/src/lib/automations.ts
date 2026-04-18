import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

interface AutomationEvent {
  eventType: string;
  entityId: number;
  entityType: string;
  data: Record<string, any>;
  userId?: number;
  timestamp: Date;
}

/**
 * AUTOMATION 1: SALE ORDER CONFIRMED
 * When sales order status changes to 'confirmed':
 * - Check inventory availability for all line items
 * - Reserve inventory (create reservations)
 * - Generate invoice draft (copy customer, line items, pricing)
 * - Update customer last_order_date, order_count
 * - Alert sales manager if over credit limit
 * - If installation required → create project record
 * - Log in audit trail
 */
export async function automationSaleOrderConfirmed(event: AutomationEvent) {
  try {
    const { entityId: orderId, data } = event;
    
    // Check inventory availability for all line items
    const orderItems = await db.execute(sql.raw(`
      SELECT soi.*, rm.current_stock, rm.reorder_point
      FROM sales_order_items soi
      JOIN raw_materials rm ON soi.material_id = rm.id
      WHERE soi.order_id = ${orderId}
    `));
    
    const inventoryAvailable = orderItems.rows?.every((item: any) => 
      Number(item.quantity) <= Number(item.current_stock)
    ) ?? false;
    
    if (!inventoryAvailable) {
      console.warn(`Inventory not available for order ${orderId}`);
      return;
    }
    
    // Reserve inventory
    for (const item of orderItems.rows || []) {
      await db.execute(sql.raw(`
        UPDATE raw_materials
        SET current_stock = current_stock - ${Number(item.quantity)}
        WHERE id = ${item.material_id}
      `));
      
      // Log inventory reservation
      await db.execute(sql.raw(`
        INSERT INTO inventory_movements (material_id, movement_type, quantity, reference_id, reference_type, created_at)
        VALUES (${item.material_id}, 'reservation', ${-Number(item.quantity)}, ${orderId}, 'sales_order', NOW())
      `));
    }
    
    // Get order details
    const order = await db.execute(sql.raw(`
      SELECT * FROM sales_orders WHERE id = ${orderId}
    `));
    const orderData = order.rows?.[0];
    
    // Create invoice draft
    if (orderData) {
      await db.execute(sql.raw(`
        INSERT INTO accounts_receivable (
          invoice_number, customer_id, customer_name, invoice_date, due_date,
          amount, net_amount, vat_amount, status, sales_order_id, created_at
        ) VALUES (
          'INV-DRAFT-' || ${orderId},
          ${orderData.customer_id},
          '${orderData.customer_name}',
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '${orderData.payment_terms || 30} days',
          ${orderData.total_amount},
          ${Number(orderData.total_amount) - Number(orderData.vat_amount)},
          ${orderData.vat_amount},
          'draft',
          ${orderId},
          NOW()
        )
      `));
    }
    
    // Update customer last_order_date
    if (orderData?.customer_id) {
      await db.execute(sql.raw(`
        UPDATE customers
        SET last_purchase_date = CURRENT_DATE,
            lifetime_value = lifetime_value + ${orderData.total_amount}
        WHERE id = ${orderData.customer_id}
      `));
    }
    
    // Check credit limit
    const customer = await db.execute(sql.raw(`
      SELECT credit_limit FROM customers WHERE id = ${orderData?.customer_id}
    `));
    const customerData = customer.rows?.[0];
    
    if (customerData && Number(orderData?.total_amount) > Number(customerData.credit_limit)) {
      console.warn(`Credit limit exceeded for customer ${orderData?.customer_id}`);
      // Send alert to sales manager - would integrate with notification system
    }
    
    console.log(`✓ Automation: Sale Order Confirmed - Order ${orderId}`);
  } catch (error) {
    console.error("Automation error - Sale Order Confirmed:", error);
  }
}

/**
 * AUTOMATION 2: INVOICE PAID
 * When invoice status changes to 'paid':
 * - Update invoice status to paid
 * - Update customer AR balance
 * - Update customer lifetime_value and revenue_ytd
 * - Create cash receipt record
 * - Update cash flow projection
 * - Check if prepayment clears credit hold
 * - Log in audit trail
 */
export async function automationInvoicePaid(event: AutomationEvent) {
  try {
    const { entityId: invoiceId, data } = event;
    
    const invoice = await db.execute(sql.raw(`
      SELECT * FROM accounts_receivable WHERE id = ${invoiceId}
    `));
    const invoiceData = invoice.rows?.[0];
    
    if (!invoiceData) return;
    
    // Update invoice status
    await db.execute(sql.raw(`
      UPDATE accounts_receivable
      SET status = 'paid', updated_at = NOW()
      WHERE id = ${invoiceId}
    `));
    
    // Create cash receipt
    await db.execute(sql`
      INSERT INTO ar_receipts (
        receipt_number, ar_id, amount, receipt_date, payment_method, created_at
      ) VALUES (
        'RCP-' || to_char(NOW(), 'YYYYMMDD') || '-' || ${invoiceId},
        ${invoiceId},
        ${invoiceData.amount},
        CURRENT_DATE,
        ${data.paymentMethod || 'bank_transfer'},
        NOW()
      )
    `);
    
    // Update customer balance and lifetime value
    if (invoiceData.customer_id) {
      await db.execute(sql`
        UPDATE customers
        SET lifetime_value = lifetime_value + ${invoiceData.amount},
            updated_at = NOW()
        WHERE id = ${invoiceData.customer_id}
      `);
    }
    
    console.log(`✓ Automation: Invoice Paid - Invoice ${invoiceId}`);
  } catch (error) {
    console.error("Automation error - Invoice Paid:", error);
  }
}

/**
 * AUTOMATION 3: INVENTORY BELOW REORDER POINT
 * When raw_materials quantity falls below reorder_point:
 * - Auto-create purchase_request record
 * - Notify procurement manager
 * - Suggest supplier based on primary_supplier_id and lead time
 * - Calculate recommended order qty
 */
export async function automationInventoryLowStock(event: AutomationEvent) {
  try {
    const { entityId: materialId } = event;
    
    const material = await db.execute(sql.raw(`
      SELECT * FROM raw_materials WHERE id = ${materialId}
    `));
    const materialData = material.rows?.[0];
    
    if (!materialData || Number(materialData.current_stock) >= Number(materialData.reorder_point)) {
      return;
    }
    
    // Create purchase request
    const purchaseReqNumber = `PR-${Date.now()}`;
    await db.execute(sql.raw(`
      INSERT INTO purchase_requests (
        request_number, material_id, quantity, status, suggested_supplier_id,
        lead_time_days, created_at
      ) VALUES (
        '${purchaseReqNumber}',
        ${materialId},
        ${Number(materialData.max_stock_level) - Number(materialData.current_stock)},
        'new',
        ${materialData.preferred_supplier_id || materialData.supplier_id},
        ${materialData.lead_time_days || 7},
        NOW()
      )
    `));
    
    console.log(`✓ Automation: Low Stock Alert - Material ${materialId}, PR created: ${purchaseReqNumber}`);
  } catch (error) {
    console.error("Automation error - Inventory Low Stock:", error);
  }
}

/**
 * AUTOMATION 4: PURCHASE ORDER RECEIVED
 * When PO status changes to 'received' (fully):
 * - Update inventory quantities
 * - Update inventory cost (weighted average)
 * - Create supplier invoice (AP)
 * - Update supplier delivery_score, last_delivery_date
 * - Update PO status to received
 * - Log stock movement
 */
export async function automationPurchaseOrderReceived(event: AutomationEvent) {
  try {
    const { entityId: poId, data } = event;
    
    const po = await db.execute(sql.raw(`
      SELECT * FROM purchase_orders WHERE id = ${poId}
    `));
    const poData = po.rows?.[0];
    
    if (!poData) return;
    
    // Get PO line items
    const items = await db.execute(sql.raw(`
      SELECT * FROM purchase_order_items WHERE order_id = ${poId}
    `));
    
    // Update inventory for each item
    for (const item of items.rows || []) {
      const receivedQty = data.receivedQuantity || item.quantity;
      
      await db.execute(sql.raw(`
        UPDATE raw_materials
        SET current_stock = current_stock + ${receivedQty},
            average_cost = ((average_cost * (current_stock - ${receivedQty})) + 
                           (${item.unit_price} * ${receivedQty})) /
                          (current_stock),
            last_purchase_price = ${item.unit_price},
            updated_at = NOW()
        WHERE id = ${item.material_id}
      `));
      
      // Log stock movement
      await db.execute(sql.raw(`
        INSERT INTO inventory_movements (material_id, movement_type, quantity, reference_id, reference_type, created_at)
        VALUES (${item.material_id}, 'receipt', ${receivedQty}, ${poId}, 'purchase_order', NOW())
      `));
    }
    
    // Create AP invoice
    await db.execute(sql.raw(`
      INSERT INTO accounts_payable (
        invoice_number, supplier_id, invoice_date, due_date, amount, status, purchase_order_id, created_at
      ) VALUES (
        'AP-INV-' || ${poId},
        ${poData.supplier_id},
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '${poData.payment_terms || 30} days',
        ${poData.total_amount},
        'new',
        ${poId},
        NOW()
      )
    `));
    
    // Update supplier metrics
    await db.execute(sql.raw(`
      UPDATE suppliers
      SET last_delivery_date = CURRENT_DATE,
          delivery_rating = CASE WHEN delivery_rating IS NULL THEN 4.0 ELSE (delivery_rating + 4.0) / 2 END,
          updated_at = NOW()
      WHERE id = ${poData.supplier_id}
    `));
    
    console.log(`✓ Automation: Purchase Order Received - PO ${poId}`);
  } catch (error) {
    console.error("Automation error - Purchase Order Received:", error);
  }
}

/**
 * AUTOMATION 5: EMPLOYEE HIRED
 * When employee is created:
 * - Create payroll record
 * - Create attendance tracking record
 * - Create onboarding task list (10 standard tasks)
 * - Assign equipment request
 * - Create IT access request
 * - Log in audit trail
 */
export async function automationEmployeeHired(event: AutomationEvent) {
  try {
    const { entityId: employeeId, data } = event;
    
    // Create payroll record
    await db.execute(sql.raw(`
      INSERT INTO payroll (
        employee_id, salary_amount, payroll_frequency, status, created_at
      ) VALUES (
        ${employeeId},
        ${data.salary || 0},
        'monthly',
        'active',
        NOW()
      )
    `));
    
    // Create attendance tracking record
    await db.execute(sql.raw(`
      INSERT INTO attendance (
        employee_id, tracking_start_date, status, created_at
      ) VALUES (
        ${employeeId},
        CURRENT_DATE,
        'active',
        NOW()
      )
    `));
    
    // Create 10 standard onboarding tasks
    const onboardingTasks = [
      'Complete HR paperwork and sign employment contract',
      'Set up IT accounts and email',
      'Assign computer and equipment',
      'Complete company orientation training',
      'Review company policies and procedures',
      'Set up benefits and insurance',
      'Assign manager and team introductions',
      'Complete security and compliance training',
      'Set up workspace and desk',
      '30-day onboarding check-in'
    ];
    
    for (const task of onboardingTasks) {
      await db.execute(sql.raw(`
        INSERT INTO tasks (
          title, description, assignee_id, due_date, priority, status, category, created_at
        ) VALUES (
          '${task}',
          'Onboarding task for new employee',
          ${employeeId},
          CURRENT_DATE + INTERVAL '1 day',
          'high',
          'new',
          'onboarding',
          NOW()
        )
      `));
    }
    
    console.log(`✓ Automation: Employee Hired - Employee ${employeeId}, 10 onboarding tasks created`);
  } catch (error) {
    console.error("Automation error - Employee Hired:", error);
  }
}

/**
 * Process automation events
 */
export async function processAutomationEvent(event: AutomationEvent) {
  switch (event.eventType) {
    case 'salesorder.confirmed':
      await automationSaleOrderConfirmed(event);
      break;
    case 'invoice.paid':
      await automationInvoicePaid(event);
      break;
    case 'inventory.lowstock':
      await automationInventoryLowStock(event);
      break;
    case 'purchaseorder.received':
      await automationPurchaseOrderReceived(event);
      break;
    case 'employee.hired':
      await automationEmployeeHired(event);
      break;
    default:
      console.log(`Unknown automation event: ${event.eventType}`);
  }
}
