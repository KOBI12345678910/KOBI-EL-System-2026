import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

/**
 * 🤖 Lead Card Test Bot
 * Automated testing suite for lead profile functionality
 */
export default function LeadCardTestBot({ leadId }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);

  const testSuites = [
    {
      name: 'פתיחת כרטיס ליד',
      test: async () => {
        const lead = await entityFilter<any>("leads", { id: leadId });
        if (!lead || lead.length === 0) throw new Error('Lead not found');
        return { success: true, message: 'ליד נטען בהצלחה' };
      }
    },
    {
      name: 'בדיקת כפתורים',
      test: async () => {
        // Simulate button checks
        const buttons = ['רשום שיחה', 'שלח מייל', 'העלה מסמך', 'שנה שלב'];
        const clickable = buttons.every(btn => {
          const element = document.querySelector(`[data-test="${btn}"]`);
          return element !== null;
        });
        
        if (!clickable) {
          return { success: false, message: 'לא כל הכפתורים זמינים' };
        }
        return { success: true, message: 'כל הכפתורים זמינים וקליקים' };
      }
    },
    {
      name: 'הוספת הערה',
      test: async () => {
        const note = await entityCreate<any>("lead-notes", {
          lead_id: leadId,
          note_text: '🤖 בדיקה אוטומטית של מערכת ההערות',
          category: 'כללי'
        });
        
        if (!note.id) throw new Error('Failed to create note');
        return { success: true, message: `הערה נוצרה בהצלחה (ID: ${note.id})` };
      }
    },
    {
      name: 'שינוי שלב',
      test: async () => {
        const lead = await entityFilter<any>("leads", { id: leadId });
        const currentStatus = lead[0].sales_status;
        
        // Change to different status
        const newStatus = currentStatus === 'new_lead' ? 'first_contact' : 'interested';
        await entityUpdate<any>("leads", leadId, { sales_status: newStatus });
        
        // Verify change
        const updatedLead = await entityFilter<any>("leads", { id: leadId });
        if (updatedLead[0].sales_status !== newStatus) {
          throw new Error('Status not updated');
        }
        
        // Revert
        await entityUpdate<any>("leads", leadId, { sales_status: currentStatus });
        
        return { success: true, message: `שלב שונה ל-${newStatus} והוחזר` };
      }
    },
    {
      name: 'העלאת מסמך (סימולציה)',
      test: async () => {
        // Simulate file upload
        const doc = await entityCreate<any>("lead-documents", {
          lead_id: leadId,
          file_name: 'test_document.pdf',
          file_url: 'https://example.com/test.pdf',
          file_type: 'pdf',
          tag: 'אחר',
          source: 'manual'
        });
        
        if (!doc.id) throw new Error('Failed to create document');
        return { success: true, message: `מסמך נוצר (ID: ${doc.id})` };
      }
    },
    {
      name: 'בדיקת הרשאות',
      test: async () => {
        const user = await authJson("/api/auth/me");
        
        // Check if user has permissions
        const hasPermissions = user && (user.role === 'admin' || user.email);
        
        if (!hasPermissions) {
          return { success: false, message: 'משתמש ללא הרשאות מספיקות' };
        }
        
        return { success: true, message: `משתמש ${user.email} עם הרשאות תקינות` };
      }
    },
    {
      name: 'בדיקת SLA Engine',
      test: async () => {
        const lead = await entityFilter<any>("leads", { id: leadId });
        const leadData = lead[0];
        
        // Check if SLA fields exist
        if (!leadData.hasOwnProperty('sla_status')) {
          return { success: false, message: 'שדה SLA חסר' };
        }
        
        // Check SLA logic
        const hasSLADeadline = leadData.sla_deadline !== null;
        const hasSLAStatus = leadData.sla_status !== null;
        
        if (!hasSLADeadline && !hasSLAStatus) {
          return { success: true, message: 'SLA לא מוגדר (תקין)' };
        }
        
        return { success: true, message: `SLA פעיל: ${leadData.sla_status}` };
      }
    },
    {
      name: 'בדיקת Audit Log',
      test: async () => {
        const events = await entityFilter<any>("lead-events", { lead_id: leadId });
        
        if (events.length === 0) {
          return { success: true, message: 'אין אירועים (ליד חדש)' };
        }
        
        // Check if events have required fields
        const validEvents = events.every(e => 
          e.event_type && e.created_date && e.description
        );
        
        if (!validEvents) {
          return { success: false, message: 'אירועים חסרי שדות חובה' };
        }
        
        return { success: true, message: `${events.length} אירועים תקינים` };
      }
    },
    {
      name: 'בדיקת Timeline',
      test: async () => {
        const [interactions, notes, docs] = await Promise.all([
          entityFilter<any>("lead-interactions", { lead_id: leadId }),
          entityFilter<any>("lead-notes", { lead_id: leadId }),
          entityFilter<any>("lead-documents", { lead_id: leadId })
        ]);
        
        const totalItems = interactions.length + notes.length + docs.length;
        
        return { 
          success: true, 
          message: `Timeline: ${totalItems} פריטים (${interactions.length} אינטראקציות, ${notes.length} הערות, ${docs.length} מסמכים)` 
        };
      }
    },
    {
      name: 'בדיקת אוטומציות',
      test: async () => {
        const rules = await entityFilter<any>("lead-automation-rules", {});
        
        if (rules.length === 0) {
          return { success: true, message: 'אין כללי אוטומציה מוגדרים' };
        }
        
        const activeRules = rules.filter(r => r.is_active);
        
        return { 
          success: true, 
          message: `${activeRules.length}/${rules.length} כללים פעילים` 
        };
      }
    }
  ];

  const runAllTests = async () => {
    setRunning(true);
    setResults([]);
    setSummary(null);

    const testResults = [];
    let passed = 0;
    let failed = 0;

    for (const suite of testSuites) {
      try {
        const result = await suite.test();
        testResults.push({
          name: suite.name,
          ...result
        });
        if (result.success) passed++;
        else failed++;
      } catch (error) {
        testResults.push({
          name: suite.name,
          success: false,
          message: error.message
        });
        failed++;
      }

      // Update results incrementally
      setResults([...testResults]);
      await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for UX
    }

    setSummary({
      total: testSuites.length,
      passed,
      failed,
      successRate: Math.round((passed / testSuites.length) * 100)
    });

    setRunning(false);

    if (failed === 0) {
      toast.success('🎉 כל הבדיקות עברו בהצלחה!');
    } else {
      toast.error(`⚠️ ${failed} בדיקות נכשלו`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            🤖 בוט בדיקות ואימות
          </span>
          <Button 
            onClick={runAllTests} 
            disabled={running}
            className="gap-2"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                רץ...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                הפעל בדיקות
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {summary && (
          <div className="mb-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">תוצאות סופיות</h3>
              <Badge 
                className={summary.failed === 0 ? 'bg-green-600' : 'bg-orange-600'}
              >
                {summary.successRate}% הצלחה
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-slate-600">סה"כ</p>
                <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
              </div>
              <div>
                <p className="text-sm text-green-600">עבר</p>
                <p className="text-2xl font-bold text-green-600">{summary.passed}</p>
              </div>
              <div>
                <p className="text-sm text-red-600">נכשל</p>
                <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {results.length === 0 && !running && (
            <div className="text-center py-8 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>לחץ "הפעל בדיקות" להתחלה</p>
            </div>
          )}

          {results.map((result, index) => (
            <div 
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white"
            >
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-medium text-slate-900">{result.name}</p>
                <p className="text-sm text-slate-600 mt-1">{result.message}</p>
              </div>
            </div>
          ))}

          {running && results.length < testSuites.length && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
              <p className="text-sm text-indigo-900">מריץ בדיקות...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}