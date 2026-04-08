import { useState } from "react";
import {
  Settings, Building2, Users, Mail, FileText, CreditCard,
  Smartphone, Landmark, CheckCircle2, XCircle, Shield, Zap,
  Store, Layers, Link2, Database, Plus, Trash2, Phone, Edit2,
  Download, Info, Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const TABS = [
  { id: "quick", label: "גישה מהירה", icon: Zap },
  { id: "business", label: "פרטי עסק", icon: Building2 },
  { id: "payments", label: "תשלומים וחשבוניות", icon: CreditCard },
  { id: "users", label: "משתמשים והרשאות", icon: Users },
  { id: "store", label: "חנות מודולים", icon: Store },
  { id: "modules", label: "ניהול מודולים", icon: Layers },
  { id: "tax", label: "חיבור לרשות המסים", icon: Shield },
  { id: "all", label: "אסיפת ההגדרות", icon: Database },
];

const COMPANY = {
  name: "טכנו כל עוזי מסגרות ברזל ואלומיניום",
  shortName: "טכנו כל עוזי",
  taxId: "054227129",
  email: "support@technokoluzi.com",
  phone: "0778048340",
};

export default function AccountingSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("quick");
  const [businessName, setBusinessName] = useState(COMPANY.shortName);
  const [businessId, setBusinessId] = useState(COMPANY.taxId);
  const [email, setEmail] = useState(COMPANY.email);
  const [smsNumber, setSmsNumber] = useState("052-3266996");
  const [vatDisplay, setVatDisplay] = useState("before");
  const [standingOrderMethod, setStandingOrderMethod] = useState("auto");
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [addEmailDialogOpen, setAddEmailDialogOpen] = useState(false);
  const [addPhoneDialogOpen, setAddPhoneDialogOpen] = useState(false);
  const [addBusinessDialogOpen, setAddBusinessDialogOpen] = useState(false);

  const [users] = useState([
    { id: 1, name: "לינה", email: "lina@ojalvo.co.il", role: "בעלים", extraPerms: 0 },
    { id: 2, name: "support@technokoluzi.com", email: "support@technokoluzi.com", role: "בעלים", extraPerms: 1 },
    { id: 3, name: "קובי אלקים (את/ה)", email: "kobi.elikayam@technokoluzi.com", role: "בעלים", extraPerms: 0 },
    { id: 4, name: "קורין ענבר", email: "korin@technokoluzi.com", role: "בעלים", extraPerms: 0 },
  ]);

  const [authorizedEmails] = useState(["lina@ojalvo.co.il"]);
  const [authorizedPhones] = useState(["052-3266996"]);
  const [authorizedBusinesses] = useState([
    { name: "אודלנו אברהם ואייל לוי יועצי מס", id: "004804688" },
    { name: "אוזיה אוטומציה", id: "313130080" },
  ]);

  const [accountingFirm] = useState("אודלנו אברהם ואייל לוי יועצי מס");

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-muted-foreground" /> הגדרות חשבונאות
        </h1>
        <p className="text-muted-foreground mt-1">הגדרות מערכת הנהלת חשבונות</p>
      </div>

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-slate-700 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-slate-700/50"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "quick" && (
        <div className="space-y-4 sm:space-y-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-400" />פרטי עסק</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>שם העסק</Label><Input value={businessName} onChange={e => setBusinessName(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>ח.פ. / עוסק מורשה</Label><Input value={businessId} onChange={e => setBusinessId(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              </div>
              <Button size="sm">שמור שינויים</Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-5 h-5 text-purple-400" />ניהול משתמשים והרשאות</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">כמות משתמשים פעילים</p>
                  <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{users.length}</p>
                </div>
                <Button variant="outline" className="border-slate-600" onClick={() => setActiveTab("users")}>ניהול משתמשים</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="w-5 h-5 text-green-400" />מיילים יוצאים</CardTitle></CardHeader>
            <CardContent>
              <div><Label>כתובת אימייל לשליחה</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="bg-slate-800 border-slate-700 mt-1" /></div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-5 h-5 text-orange-400" />הנהלת החשבונות של העסק</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">שם</p>
              <div className="flex items-center justify-between mt-1 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">{accountingFirm}</span>
                  <Info className="w-4 h-4 text-blue-400" />
                </div>
                <button className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">הגדרות נוספות</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>הצגת סכומים</Label>
                <Select value={vatDisplay} onValueChange={setVatDisplay}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="before">לפני מע"מ</SelectItem>
                    <SelectItem value="after">אחרי מע"מ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>שיטת חיוב הוראות קבע</Label>
                <Select value={standingOrderMethod} onValueChange={setStandingOrderMethod}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="auto">אוטומטי</SelectItem>
                    <SelectItem value="manual">ידני</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>מספר לשליחת SMS</Label>
                <Input value={smsNumber} onChange={e => setSmsNumber(e.target.value)} className="bg-slate-800 border-slate-700 mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link2 className="w-5 h-5 text-cyan-400" />סטטוס חיבור לשירותים</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-sm text-foreground font-medium">חיבור לרשות המסים</p>
                    <p className="text-xs text-muted-foreground">שידור חשבוניות אוטומטי</p>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />פעיל
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-sm text-foreground font-medium">סליקת אשראי בחשבון</p>
                    <p className="text-xs text-muted-foreground">מסוף: 1234567 | מסוף: 7654321</p>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />פעילה
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <Landmark className="w-5 h-5 text-orange-400" />
                  <div>
                    <p className="text-sm text-foreground font-medium">גבייה באמצעות מס"ב</p>
                    <p className="text-xs text-muted-foreground">שידור אוטומטי</p>
                  </div>
                </div>
                <Badge className="bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />ללא
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "business" && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader><CardTitle className="text-base">פרטי עסק מלאים</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>שם העסק</Label><Input value={businessName} onChange={e => setBusinessName(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              <div><Label>ח.פ.</Label><Input value={businessId} onChange={e => setBusinessId(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              <div><Label>אימייל</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              <div><Label>טלפון</Label><Input value={COMPANY.phone} readOnly className="bg-slate-800 border-slate-700" /></div>
            </div>
            <Button>שמור</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "users" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              ניהול משתמשים ({COMPANY.name})
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" className="border-slate-600">...</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => setAddUserDialogOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />הוספת משתמש/ת
              </Button>
            </div>
          </div>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">משתמשים בעסק</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="p-3 text-right text-muted-foreground">שם</th>
                    <th className="p-3 text-right text-muted-foreground">מייל</th>
                    <th className="p-3 text-right text-muted-foreground">הרשאה</th>
                    <th className="p-3 text-right text-muted-foreground">הרשאות נוספות</th>
                    <th className="p-3 text-center text-muted-foreground w-[100px]">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="p-3 text-foreground font-medium">{user.name}</td>
                      <td className="p-3 text-slate-300">{user.email}</td>
                      <td className="p-3"><Badge variant="outline" className="border-slate-600">{user.role}</Badge></td>
                      <td className="p-3 text-slate-300">{user.extraPerms}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <button className="p-1.5 rounded hover:bg-slate-700 text-muted-foreground hover:text-foreground"><Edit2 className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded hover:bg-slate-700 text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded hover:bg-slate-700 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => setAddUserDialogOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />הוספת משתמש/ת
          </Button>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">הנהלת החשבונות של העסק</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">שם</p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-foreground">{accountingFirm}</span>
                  <Info className="w-4 h-4 text-blue-400" />
                </div>
                <button className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">מיילים מורשים לשליחת הוצאות</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                כתובות אלה מורשות לשלוח הוצאות דרך המייל.
                <br />בנוסף, כל המשתמשים בעסק מורשים גם כן, ללא תלות ברשימה.
              </p>
              {authorizedEmails.map((em, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="text-sm text-muted-foreground">מייל</div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{em}</span>
                    <button className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => setAddEmailDialogOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />הוספת מייל מורשה
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">מספרים מורשים לשליחת הוצאות</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">מספרים אלה מורשים לשלוח הוצאות דרך בוט ה-WhatsApp.</p>
              {authorizedPhones.map((ph, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="text-sm text-muted-foreground">מספר</div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{ph}</span>
                    <button className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => setAddPhoneDialogOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />הוספת מספר מורשה
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">עסקים מורשים לשליחת מסמכים</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                עסקים אלה מורשים לשלוח מסמכים ישירות אל מודול ההוצאות.
                <br />יכולת זו מאפשרת לספקים שלכם המשתמשים בסאמיט, להעביר לכם הוצאות בלי לשלוח מייל, בדרך קסם.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="p-2 text-right text-muted-foreground">שם העסק</th>
                    <th className="p-2 text-right text-muted-foreground">מספר עוסק</th>
                    <th className="p-2 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {authorizedBusinesses.map((biz, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="p-2 text-foreground">{biz.name}</td>
                      <td className="p-2 text-slate-300">{biz.id}</td>
                      <td className="p-2"><button className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="outline" className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={() => setAddBusinessDialogOpen(true)}>
                <Plus className="w-4 h-4 ml-2" />הוספת עסק מורשה לשליחת מסמכים
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4 sm:space-y-6">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-base">תשלומים וחשבוניות</CardTitle></CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground text-sm">תשלום צפוי ב-01/04/2026</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-lg sm:text-2xl font-bold text-foreground">₪125 + מע"מ</div>
                  <Button variant="link" className="text-blue-400">הצגת פירוט חיוב מלא</Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">חשבוניות</h3>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div>
                    <div className="text-muted-foreground text-sm">חשבוניות המערכת נשלחות למייל של העסק:</div>
                    <div className="text-foreground font-medium mt-1">{COMPANY.email}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">פרטי עסק</div>
                    <div className="text-foreground font-medium mt-1">{COMPANY.email}</div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="text-muted-foreground text-sm">חשבונית אחרונה</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-foreground font-medium">חשבונית מס/קבלה / 279303 | 01/03/2026</span>
                    <Button variant="link" className="text-blue-400">הורדה כ-PDF | היסטוריית חשבוניות מלאה</Button>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div className="text-muted-foreground text-sm">אמצעי תשלום</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-foreground font-medium">כרטיס אשראי 6156 עם תוקף 05/2031</span>
                    <div className="flex gap-2">
                      <Button variant="link" className="text-blue-400">עדכון אמצעי תשלום</Button>
                      <Button variant="link" className="text-blue-400">עדכון תוקף</Button>
                      <Button variant="link" className="text-red-400">הסרת אמצעי תשלום</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "tax" && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-5 h-5 text-blue-400" />חיבור לרשות המסים</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <p className="text-foreground font-medium">שידור חשבוניות אוטומטי לרשות המסים</p>
                <p className="text-sm text-muted-foreground mt-1">חיבור ישיר למערכת e-Invoice של רשות המסים</p>
              </div>
              <Badge className="bg-green-500/20 text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />מחובר
              </Badge>
            </div>
            <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
              <p className="text-sm text-blue-200">
                המערכת משדרת חשבוניות מס אוטומטית לרשות המסים בהתאם לתקנות.
                כל חשבונית שנוצרת מקבלת מספר הקצאה ייחודי.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "store" && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="w-5 h-5 text-emerald-400" />חנות מודולים</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {["PayPal", "Bit", "Apple Pay", "Google Pay", "סליקת אשראי", "מס\"ב"].map(mod => (
                <div key={mod} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
                  <div className="text-foreground font-medium mb-2">{mod}</div>
                  <Button variant="outline" size="sm" className="border-slate-600">הפעלה</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!["quick", "business", "users", "payments", "tax", "store"].includes(activeTab) && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            {(() => {
              const tab = TABS.find(t => t.id === activeTab);
              const TabIcon = tab?.icon || Settings;
              return (
                <>
                  <TabIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg">{tab?.label}</p>
                  <p className="text-sm mt-1">הגדרות {tab?.label} יוצגו כאן</p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוספת משתמש/ת</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>שם</Label><Input placeholder="שם מלא" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label>אימייל</Label><Input type="email" placeholder="email@example.com" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div>
              <Label>הרשאה</Label>
              <Select defaultValue="viewer">
                <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="owner">בעלים</SelectItem>
                  <SelectItem value="admin">מנהל</SelectItem>
                  <SelectItem value="editor">עורך</SelectItem>
                  <SelectItem value="viewer">צופה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => { setAddUserDialogOpen(false); toast({ title: "משתמש נוסף" }); }}>
              <Plus className="w-4 h-4 ml-2" />הוסף משתמש
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addEmailDialogOpen} onOpenChange={setAddEmailDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוספת מייל מורשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>כתובת מייל</Label><Input type="email" placeholder="email@example.com" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => { setAddEmailDialogOpen(false); toast({ title: "מייל נוסף" }); }}>
              <Plus className="w-4 h-4 ml-2" />הוסף
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addPhoneDialogOpen} onOpenChange={setAddPhoneDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוספת מספר מורשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>מספר טלפון</Label><Input type="tel" placeholder="052-1234567" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => { setAddPhoneDialogOpen(false); toast({ title: "מספר נוסף" }); }}>
              <Plus className="w-4 h-4 ml-2" />הוסף
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addBusinessDialogOpen} onOpenChange={setAddBusinessDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוספת עסק מורשה לשליחת מסמכים</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>שם העסק</Label><Input placeholder="שם העסק" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <div><Label>מספר עוסק</Label><Input placeholder="מספר עוסק מורשה" className="bg-slate-800 border-slate-700 mt-1" /></div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-foreground" onClick={() => { setAddBusinessDialogOpen(false); toast({ title: "עסק נוסף" }); }}>
              <Plus className="w-4 h-4 ml-2" />הוסף עסק
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-8 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "settings_log",
              label: "שינויי הגדרות",
              icon: "documents",
              endpoint: "/api/audit-logs?entityType=settings&limit=5",
              columns: [
                { key: "fieldName", label: "שדה" },
                { key: "oldValue", label: "ערך ישן" },
                { key: "newValue", label: "ערך חדש" },
                { key: "createdAt", label: "תאריך" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="accounting-settings" />
      </div>
    </div>
  );
}
