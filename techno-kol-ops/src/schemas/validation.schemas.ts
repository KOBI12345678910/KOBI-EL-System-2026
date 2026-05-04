import { z } from 'zod';

// Zod Validation Schemas - Agent 4 fix
// Covers 7 critical routes: employees, clients, suppliers, attendance, leads, tasks, financials

export const CreateEmployeeSchema = z.object({
    body: z.object({
          name: z.string().min(2).max(100),
          email: z.string().email(),
          phone: z.string().optional(),
          role: z.enum(['admin', 'manager', 'employee', 'viewer', 'guest']).default('employee'),
          department: z.string().optional(),
          salary: z.number().min(0).optional(),
    }),
});

export const CreateClientSchema = z.object({
    body: z.object({
          name: z.string().min(2).max(200),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          company: z.string().optional(),
          address: z.string().optional(),
    }),
});

export const CreateSupplierSchema = z.object({
    body: z.object({
          name: z.string().min(2).max(200),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          category: z.string().optional(),
    }),
});

export const CreateAttendanceSchema = z.object({
    body: z.object({
          employee_id: z.string().uuid(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          status: z.enum(['present', 'absent', 'late', 'half_day']).default('present'),
    }),
});

export const CreateLeadSchema = z.object({
    body: z.object({
          name: z.string().min(2).max(200),
          email: z.string().email().optional(),
          status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']).default('new'),
          estimated_value: z.number().min(0).optional(),
    }),
});

export const CreateTaskSchema = z.object({
    body: z.object({
          title: z.string().min(1).max(300),
          description: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
          status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
    }),
});

export const CreateFinancialSchema = z.object({
    body: z.object({
          type: z.enum(['income', 'expense']),
          amount: z.number().min(0),
          currency: z.string().length(3).default('ILS'),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          description: z.string().optional(),
    }),
});

export const PaginationSchema = z.object({
    query: z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
          order: z.enum(['asc', 'desc']).default('desc'),
    }),
});

export const IdParamSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
});
