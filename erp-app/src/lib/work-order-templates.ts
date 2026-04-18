export interface WorkOrderTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  fields: {
    orderType?: string;
    department?: string;
    materialType?: string;
    estimatedHours?: number;
    machineType?: string;
    specialNotes?: string;
  };
}

export const WORK_ORDER_TEMPLATES: WorkOrderTemplate[] = [
  {
    id: "cutting-template",
    name: "תבנית חיתוך בסיסית",
    type: "cutting",
    description: "עבור עבודות חיתוך סטנדרטיות",
    fields: {
      orderType: "cutting",
      department: "cutting",
      materialType: "iron",
      estimatedHours: 2,
      machineType: "CNC Cutting",
      specialNotes: "בדוק מידות לפני התחלת העבודה"
    }
  },
  {
    id: "welding-template",
    name: "תבנית ריתוך סטנדרטית",
    type: "welding",
    description: "עבור עבודות ריתוך כלליות",
    fields: {
      orderType: "welding",
      department: "welding",
      materialType: "iron",
      estimatedHours: 3,
      machineType: "Welding Station",
      specialNotes: "וודא כי חומר הנחושת נקי לפני ריתוך"
    }
  },
  {
    id: "assembly-template",
    name: "תבנית הרכבה",
    type: "assembly",
    description: "עבור עבודות הרכבה",
    fields: {
      orderType: "assembly",
      department: "assembly",
      estimatedHours: 4,
      specialNotes: "בדוק את כל החלקים לפני הרכבה"
    }
  },
  {
    id: "glass-cutting-template",
    name: "תבנית חיתוך זכוכית",
    type: "glass_cutting",
    description: "עבור עבודות חיתוך זכוכית",
    fields: {
      orderType: "glass_cutting",
      department: "glass",
      materialType: "glass",
      estimatedHours: 1.5,
      machineType: "Glass Cutter",
      specialNotes: "השתמש בציוד בטיחות - משקפיים וכפפות"
    }
  },
  {
    id: "painting-template",
    name: "תבנית צביעה",
    type: "painting",
    description: "עבור עבודות צביעה",
    fields: {
      orderType: "painting",
      department: "painting",
      estimatedHours: 2.5,
      specialNotes: "וודא אוורור טוב בתא הצביעה"
    }
  },
  {
    id: "quality-check-template",
    name: "תבנית בדיקת איכות",
    type: "quality_check",
    description: "עבור בדיקות איכות חלקים מוגמרים",
    fields: {
      orderType: "quality_check",
      department: "quality",
      estimatedHours: 1,
      specialNotes: "בדוק מידות, צורה, וגמישות משטח"
    }
  },
  {
    id: "installation-template",
    name: "תבנית התקנה בשטח",
    type: "installation",
    description: "עבור עבודות התקנה בחוץ",
    fields: {
      orderType: "installation",
      department: "installation",
      estimatedHours: 5,
      specialNotes: "וודא רשות הציבור, בטיחות עבודה בגובה"
    }
  }
];

export function getTemplateById(id: string): WorkOrderTemplate | undefined {
  return WORK_ORDER_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByType(type: string): WorkOrderTemplate[] {
  return WORK_ORDER_TEMPLATES.filter(t => t.type === type);
}

export function applyTemplate(template: WorkOrderTemplate): Partial<any> {
  return {
    orderType: template.fields.orderType,
    department: template.fields.department,
    materialType: template.fields.materialType,
    estimatedHours: template.fields.estimatedHours,
    machineType: template.fields.machineType,
    notes: template.fields.specialNotes
  };
}
