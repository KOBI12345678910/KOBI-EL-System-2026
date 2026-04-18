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
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Customer Number *</label>
            <input
              type="text"
              value={formData.customerNumber || ""}
              onChange={(e) => handleChange("customerNumber", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Auto-generated"
              disabled
            />
          </div>
          <div>
            <label className="text-sm font-medium">Customer Name *</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleChange("customerName", e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select
              value={formData.customerType}
              onChange={(e) => handleChange("customerType", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="business">Business</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select
              value={formData.customerCategory}
              onChange={(e) => handleChange("customerCategory", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="A">A (High Value)</option>
              <option value="B">B (Medium)</option>
              <option value="C">C (Low)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Contact Person"
            value={formData.contactPerson || ""}
            onChange={(e) => handleChange("contactPerson", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone || ""}
            onChange={(e) => handleChange("phone", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="tel"
            placeholder="Mobile"
            value={formData.mobile || ""}
            onChange={(e) => handleChange("mobile", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email || ""}
            onChange={(e) => handleChange("email", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="text"
            placeholder="Website"
            value={formData.website || ""}
            onChange={(e) => handleChange("website", e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="text"
            placeholder="LinkedIn"
            value={formData.linkedin || ""}
            onChange={(e) => handleChange("linkedin", e.target.value)}
            className="border rounded px-3 py-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit & Financial</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Credit Limit (₪)</label>
            <input
              type="number"
              value={formData.creditLimit}
              onChange={(e) => handleChange("creditLimit", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Credit Terms (Days)</label>
            <input
              type="number"
              value={formData.creditTermsDays}
              onChange={(e) => handleChange("creditTermsDays", parseInt(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Special Discount %</label>
            <input
              type="number"
              step="0.01"
              value={formData.specialDiscountPct}
              onChange={(e) => handleChange("specialDiscountPct", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Custom Pricing Tier</label>
            <input
              type="text"
              value={formData.customPricingTier || ""}
              onChange={(e) => handleChange("customPricingTier", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., Premium, Standard"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Annual Revenue (₪)</label>
            <input
              type="number"
              value={formData.annualRevenue || ""}
              onChange={(e) => handleChange("annualRevenue", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">GL Account Code</label>
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
          <CardTitle>Status & Loyalty</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={formData.status}
              onChange={(e) => handleChange("status", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
              <option value="prospect">Prospect</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Loyalty Tier</label>
            <select
              value={formData.loyaltyTier}
              onChange={(e) => handleChange("loyaltyTier", e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
              <option value="platinum">Platinum</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Lifetime Value (₪)</label>
            <input
              type="number"
              value={formData.lifetimeValue || ""}
              onChange={(e) => handleChange("lifetimeValue", parseFloat(e.target.value))}
              className="w-full border rounded px-3 py-2"
              disabled
            />
          </div>
          <div>
            <label className="text-sm font-medium">Last Purchase Date</label>
            <input
              type="date"
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
          <CardTitle>Notes & Attachments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="w-full border rounded px-3 py-2 h-20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Internal Notes</label>
            <textarea
              value={formData.internalNotes || ""}
              onChange={(e) => handleChange("internalNotes", e.target.value)}
              className="w-full border rounded px-3 py-2 h-20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Tags</label>
            <input
              type="text"
              value={formData.tags || ""}
              onChange={(e) => handleChange("tags", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Comma-separated tags"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <button className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        <button className="px-6 py-2 bg-muted rounded hover:bg-muted">Cancel</button>
      </div>
    </div>
  );
}
