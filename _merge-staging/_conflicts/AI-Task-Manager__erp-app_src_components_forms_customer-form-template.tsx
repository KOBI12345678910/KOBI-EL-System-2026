/**
 * TASK 1: Customer Form Template
 * Shows all required fields for the enhanced CUSTOMERS table
 * Use this as a template for creating/editing customer records
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CustomerFormData {
  // Basic Info
  customerNumber?: string;
  customerName: string;
  customerType: "business" | "individual";
  customerCategory: "A" | "B" | "C";
  
  // Contact Info
  contactPerson?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  linkedin?: string;
  facebook?: string;
  
  // Address
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  billingAddressJson?: string;
  shippingAddressJson?: string;
  
  // Tax & Compliance
  taxId?: string;
  vatNumber?: string;
  glAccountCode?: string;
  
  // Credit & Financial
  creditLimit: number;
  creditTermsDays: number;
  specialDiscountPct: number;
  customPricingTier?: string;
  annualRevenue?: number;
  
  // Sales & History
  salespersonId?: number;
  customerSince?: string;
  lastPurchaseDate?: string;
  lifetimeValue?: number;
  loyaltyTier: "bronze" | "silver" | "gold" | "platinum";
  
  // Status & Preferences
  status: "active" | "inactive" | "blocked" | "prospect";
  communicationPref: "email" | "phone" | "sms" | "whatsapp";
  blockedReason?: string;
  blockedDate?: string;
  
  // Additional
  notes?: string;
  internalNotes?: string;
  attachmentsJson?: string;
  tags?: string;
}

export function CustomerFormTemplate() {
  const [formData, setFormData] = useState<CustomerFormData>({
    customerName: "",
    customerType: "business",
    customerCategory: "B",
    creditLimit: 0,
    creditTermsDays: 30,
    specialDiscountPct: 0,
    status: "active",
    communicationPref: "email",
    loyaltyTier: "bronze",
  });

  const handleChange = (field: keyof CustomerFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>מידע בסיסי</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">מספר לקוח *</label>
            <input
              type="text"
              value={formData.customerNumber || ""}
              onChange={(e) => handleChange("customerNumber", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="נוצר אוטומטית"
              disabled
            />
          </div>
          <div>
            <label className="text-sm font-medium">שם לקוח *</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleChange("customerName", e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">סוג</label>
            <select
              value={formData.customerType}
              onChange={(e) => handleChange("customerType", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="business">עסק</option>
              <option value="individual">פרטי</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">קטגוריה</label>
            <select
              value={formData.customerCategory}
              onChange={(e) => handleChange("customerCategory", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="A">A (ערך גבוה)</option>
              <option value="B">B (בינוני)</option>
              <option value="C">C (נמוך)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פרטי קשר</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="איש קשר"
            value={formData.contactPerson || ""}
            onChange={(e) => handleChange("contactPerson", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="tel"
            dir="ltr"
            placeholder="טלפון"
            value={formData.phone || ""}
            onChange={(e) => handleChange("phone", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="tel"
            dir="ltr"
            placeholder="נייד"
            value={formData.mobile || ""}
            onChange={(e) => handleChange("mobile", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="email"
            dir="ltr"
            placeholder="אימייל"
            value={formData.email || ""}
            onChange={(e) => handleChange("email", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="text"
            dir="ltr"
            placeholder="אתר"
            value={formData.website || ""}
            onChange={(e) => handleChange("website", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="text"
            dir="ltr"
            placeholder="לינקדאין"
            value={formData.linkedin || ""}
            onChange={(e) => handleChange("linkedin", e.target.value)}
            className="border rounded px-3 py-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>אשראי ופיננסים</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">מגבלת אשראי (₪)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.creditLimit}
              onChange={(e) => handleChange("creditLimit", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תנאי אשראי (ימים)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.creditTermsDays}
              onChange={(e) => handleChange("creditTermsDays", parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">הנחה מיוחדת %</label>
            <input
              type="number"
              dir="ltr"
              step="0.01"
              value={formData.specialDiscountPct}
              onChange={(e) => handleChange("specialDiscountPct", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">רמת תמחור מותאמת</label>
            <input
              type="text"
              value={formData.customPricingTier || ""}
              onChange={(e) => handleChange("customPricingTier", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="לדוגמה: פרימיום, סטנדרט"
            />
          </div>
          <div>
            <label className="text-sm font-medium">הכנסות שנתיות (₪)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.annualRevenue || ""}
              onChange={(e) => handleChange("annualRevenue", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">קוד חשבון GL</label>
            <input
              type="text"
              value={formData.glAccountCode || ""}
              onChange={(e) => handleChange("glAccountCode", e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>סטטוס ונאמנות</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">סטטוס</label>
            <select
              value={formData.status}
              onChange={(e) => handleChange("status", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
              <option value="blocked">חסום</option>
              <option value="prospect">לקוח פוטנציאלי</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">רמת נאמנות</label>
            <select
              value={formData.loyaltyTier}
              onChange={(e) => handleChange("loyaltyTier", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="bronze">ברונזה</option>
              <option value="silver">כסף</option>
              <option value="gold">זהב</option>
              <option value="platinum">פלטינה</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">ערך לכל החיים (₪)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.lifetimeValue || ""}
              onChange={(e) => handleChange("lifetimeValue", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
              disabled
            />
          </div>
          <div>
            <label className="text-sm font-medium">תאריך קנייה אחרון</label>
            <input
              type="date"
              dir="ltr"
              value={formData.lastPurchaseDate || ""}
              onChange={(e) => handleChange("lastPurchaseDate", e.target.value)}
              className="w-full border rounded px-3 py-2"
              disabled
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>הערות ונספחים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">הערות</label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="w-full border rounded px-3 py-2 h-20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">הערות פנימיות</label>
            <textarea
              value={formData.internalNotes || ""}
              onChange={(e) => handleChange("internalNotes", e.target.value)}
              className="w-full border rounded px-3 py-2 h-20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תגים</label>
            <input
              type="text"
              value={formData.tags || ""}
              onChange={(e) => handleChange("tags", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="תגים מופרדים בפסיק"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <button className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">שמור</button>
        <button className="px-6 py-2 bg-muted rounded hover:bg-muted">בטל</button>
      </div>
    </div>
  );
}
