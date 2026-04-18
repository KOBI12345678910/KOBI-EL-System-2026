import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Database, Users, Settings, CheckCircle2 } from "lucide-react";

export default function CRMWorkflowDiagram() {
  const [selectedFlow, setSelectedFlow] = useState("lead-lifecycle");

  return (
    <div className="space-y-6">
      {/* Lead Lifecycle */}
      {selectedFlow === "lead-lifecycle" && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              מחזור חיים ליד
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto pb-4">
              <div className="flex items-center gap-4 min-w-min">
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-blue-100 rounded-lg flex items-center justify-center border-2 border-blue-500">
                    <span className="text-sm font-bold text-center text-blue-900">NEW</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">Created</p>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-purple-100 rounded-lg flex items-center justify-center border-2 border-purple-500">
                    <span className="text-sm font-bold text-center text-purple-900">CONTACTED</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">Made Call</p>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-amber-100 rounded-lg flex items-center justify-center border-2 border-amber-500">
                    <span className="text-sm font-bold text-center text-amber-900">QUALIFIED</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">Interest</p>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-orange-100 rounded-lg flex items-center justify-center border-2 border-orange-500">
                    <span className="text-sm font-bold text-center text-orange-900">PROPOSAL</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">Sent Quote</p>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400" />
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-green-100 rounded-lg flex items-center justify-center border-2 border-green-500">
                    <span className="text-sm font-bold text-center text-green-900">WON</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">Approved</p>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t">
              <p className="text-sm text-slate-600 mb-3">כל שלב יכול לעבור ל-LOST</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-red-300 rounded"></div>
                <div className="w-16 h-12 bg-red-100 rounded-lg flex items-center justify-center border-2 border-red-500">
                  <span className="text-sm font-bold text-red-900">LOST</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignment Flow */}
      {selectedFlow === "assignment" && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              הקצאות - תור מנהל
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <div className="flex items-start gap-3">
                  <Badge className="bg-blue-600">1</Badge>
                  <div className="flex-1">
                    <p className="font-bold">ליד חדש מתקבל</p>
                    <p className="text-sm text-slate-600 mt-1">מערכת בודקת: Auto-Assign = true?</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 ml-6">
                <div className="w-1 bg-slate-300"></div>
                <div className="w-32 h-20 border-2 border-slate-400 rounded-lg flex items-center justify-center text-center text-sm font-bold bg-slate-50">
                  Auto Assign?
                </div>
              </div>
              <div className="ml-6 space-y-3">
                <div className="text-green-600 font-bold">YES</div>
                <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                  <Badge className="bg-green-600">2A</Badge>
                  <p className="font-bold mt-2">הקצה אוטומטית</p>
                  <p className="text-sm text-slate-600 mt-1">Round-robin / By Industry Rule</p>
                </div>
              </div>
              <div className="ml-6 space-y-3">
                <div className="text-red-600 font-bold">NO</div>
                <div className="p-4 bg-orange-50 rounded-lg border-l-4 border-orange-500">
                  <Badge className="bg-orange-600">2B</Badge>
                  <p className="font-bold mt-2">הוסף לתור מנהל</p>
                  <p className="text-sm text-slate-600 mt-1">המנהל יחליט מי מקבל</p>
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border-l-4 border-purple-500">
                <Badge className="bg-purple-600">3</Badge>
                <p className="font-bold mt-2">עובד מקבל הודעה</p>
                <p className="text-sm text-slate-600 mt-1">"יש לך ליד חדש, אשר או דחה תוך 3 ימים"</p>
              </div>
              <div className="flex gap-4 ml-6">
                <div className="w-1 bg-slate-300"></div>
                <div className="w-32 h-20 border-2 border-slate-400 rounded-lg flex items-center justify-center text-center text-sm font-bold bg-slate-50">
                  Accept?
                </div>
              </div>
              <div className="ml-6 space-y-3">
                <div className="text-green-600 font-bold">ACCEPT</div>
                <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                  <Badge className="bg-green-600">4A</Badge>
                  <p className="font-bold mt-2">Lead.owner_id = user</p>
                  <p className="text-sm text-slate-600 mt-1">assignment.status = "accepted"</p>
                </div>
              </div>
              <div className="ml-6 space-y-3">
                <div className="text-red-600 font-bold">REJECT</div>
                <div className="p-4 bg-red-50 rounded-lg border-l-4 border-red-500">
                  <Badge className="bg-red-600">4B</Badge>
                  <p className="font-bold mt-2">חזור לתור / הקצה לאחר</p>
                  <p className="text-sm text-slate-600 mt-1">assignment.status = "rejected"</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversion Flow */}
      {selectedFlow === "conversion" && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              המרה: ליד - לקוח
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { step: 1, title: "Lead.stage = 'WON'", desc: "הליד עבר לשלב נוכחי סגר", color: "blue" },
              { step: 2, title: "בדוק שדות חובה", desc: "וודא שכל השדות המחוייבים מלאים", color: "purple" },
              { step: 3, title: "אישור מנהל (אם צריך)", desc: "LeadApproval.create", color: "amber" },
              { step: 4, title: "Create Customer", desc: "העתק כל שדות ה-Lead", color: "orange" },
              { step: 5, title: "Link to Lead", desc: "Customer.lead_id = Lead.id", color: "green" },
              { step: 6, title: "Update Lead", desc: "Lead.converted_to_customer = Customer.id", color: "cyan" },
              { step: 7, title: "Notify Owner", desc: "שלח מייל/notification", color: "pink" },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 items-start">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-${item.color}-500`}
                >
                  {item.step}
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-bold text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Settings Flow */}
      {selectedFlow === "settings" && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              No-Code Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
              <p className="text-sm mb-3">
                <span className="font-bold">מנהל מגדיר ב-CRMSettings:</span>
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  "שדות חובה לכל סטטוס (required_fields_by_status)",
                  "סדר סטטוסים מותר (status_flow)",
                  "כללי הקצאה (assignment_rules)",
                  "כללי תזכורות (automation_rules)",
                  "כללי אישור (approval_rules)",
                  "כללי המרה (conversion_rules)",
                ].map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-amber-600">-</span>
                    <span className="text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <p className="text-sm font-bold mb-2">שמירה</p>
              <p className="text-sm text-slate-600">
                כל שינוי נשמר ישירות ב-CRMSettings entity ומתחיל להשפיע על:
              </p>
              <ul className="space-y-1 text-sm text-slate-600 mt-2 ml-4">
                <li>- לידים חדשים שנוצרים</li>
                <li>- שינויי סטטוס</li>
                <li>- הקצאות</li>
                <li>- תזכורות אוטומטיות</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Card className="border-0 shadow-lg bg-white">
        <CardContent className="p-6">
          <p className="text-sm text-slate-600 mb-3">בחר תזרים לצפייה:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { id: "lead-lifecycle", label: "מחזור חיים" },
              { id: "assignment", label: "הקצאות" },
              { id: "conversion", label: "המרה" },
              { id: "settings", label: "הגדרות" },
            ].map((flow) => (
              <button
                key={flow.id}
                onClick={() => setSelectedFlow(flow.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedFlow === flow.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {flow.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
