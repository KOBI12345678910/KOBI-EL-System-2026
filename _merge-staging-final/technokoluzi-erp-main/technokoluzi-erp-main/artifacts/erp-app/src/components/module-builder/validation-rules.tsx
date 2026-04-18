import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield } from 'lucide-react';

export default function ValidationRules({ open, onClose, entityType }) {
  const [rules, setRules] = useState({
    preventCloseWithoutRequired: true,
    preventConversionWithoutStage: true,
    requiredFieldsForConversion: ['phone', 'email'],
    minimumActivitiesForConversion: 1
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            חוקי ולידציה והמרה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">חוקים למעבר לליד ללקוח</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={rules.preventCloseWithoutRequired}
                    onCheckedChange={(checked) =>
                      setRules({ ...rules, preventCloseWithoutRequired: checked })
                    }
                  />
                  <div>
                    <Label>חייב למלא שדות חובה</Label>
                    <p className="text-xs text-slate-600 mt-1">
                      לא ניתן להמיר לליד ללקוח בלי שכל שדות החובה מולאו
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={rules.preventConversionWithoutStage}
                    onCheckedChange={(checked) =>
                      setRules({ ...rules, preventConversionWithoutStage: checked })
                    }
                  />
                  <div>
                    <Label>חייב להגיע לשלב מינימלי</Label>
                    <p className="text-xs text-slate-600 mt-1">
                      הליד חייב להיות לפחות בשלב "qualified" כדי לעבור ללקוח
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="block mb-2">שדות חובה להמרה:</Label>
                  <div className="space-y-2 bg-white p-3 rounded border">
                    {['phone', 'email', 'company_name', 'address_city'].map(field => (
                      <div key={field} className="flex items-center gap-2">
                        <Checkbox
                          checked={rules.requiredFieldsForConversion.includes(field)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setRules({
                                ...rules,
                                requiredFieldsForConversion: [...rules.requiredFieldsForConversion, field]
                              });
                            } else {
                              setRules({
                                ...rules,
                                requiredFieldsForConversion: rules.requiredFieldsForConversion.filter(f => f !== field)
                              });
                            }
                          }}
                        />
                        <Label className="text-sm">
                          {field === 'phone' && 'טלפון'}
                          {field === 'email' && 'אימייל'}
                          {field === 'company_name' && 'שם חברה'}
                          {field === 'address_city' && 'עיר'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">העברת נתונים אוטומטית</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>כל השדות עוברים אוטומטית ללקוח</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>היסטוריית פעילות נשמרת</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>משימות פתוחות עוברות ללקוח</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>מסמכים ונספחים עוברים ללקוח</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>סגור</Button>
            <Button className="bg-purple-600 hover:bg-purple-700">
              שמור חוקים
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}