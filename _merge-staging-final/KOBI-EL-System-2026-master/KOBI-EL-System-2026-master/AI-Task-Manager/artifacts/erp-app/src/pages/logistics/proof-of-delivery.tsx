import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, Camera, PenLine, MapPin, Clock, Eye, Plus, AlertCircle, Package, FileCheck, User } from "lucide-react";

const API = "/api";

interface POD {
  id: number;
  delivery_id?: number;
  delivery_note_id?: number;
  signature_data?: string;
  photo_urls?: string[] | string;
  gps_lat?: number;
  gps_lng?: number;
  captured_at?: string;
  captured_by_name?: string;
  receiver_name?: string;
  notes?: string;
  is_verified?: boolean;
}

export default function ProofOfDelivery() {
  const [pods, setPods] = useState<POD[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedPod, setSelectedPod] = useState<POD | null>(null);
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captureForm, setCaptureForm] = useState({
    delivery_id: "", delivery_note_id: "", receiver_name: "", captured_by_name: "",
    gps_lat: "32.0853", gps_lng: "34.7818", notes: "", photo_urls: [] as string[],
  });

  useEffect(() => { loadPods(); }, []);

  async function loadPods() {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/proof-of-delivery`);
      if (r.ok) setPods(await r.json());
    } catch {}
    setLoading(false);
  }

  function getPhotoUrls(pod: POD): string[] {
    if (!pod.photo_urls) return [];
    if (Array.isArray(pod.photo_urls)) return pod.photo_urls;
    try { return JSON.parse(pod.photo_urls as string); } catch { return []; }
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasSig(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function stopDraw() { setIsDrawing(false); }

  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  function getSignatureData(): string {
    const canvas = canvasRef.current;
    if (!canvas || !hasSig) return "";
    return canvas.toDataURL("image/png");
  }

  async function submitPOD() {
    const signatureData = getSignatureData();
    const payload = { ...captureForm, signature_data: signatureData };
    try {
      const r = await authFetch(`${API}/proof-of-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setShowCaptureDialog(false);
        setCaptureForm({ delivery_id: "", delivery_note_id: "", receiver_name: "", captured_by_name: "", gps_lat: "32.0853", gps_lng: "34.7818", notes: "", photo_urls: [] });
        clearSig();
        loadPods();
      }
    } catch {}
  }

  async function verifyPod(id: number) {
    try {
      const r = await authFetch(`${API}/proof-of-delivery/${id}/verify`, { method: "PUT" });
      if (r.ok) loadPods();
    } catch {}
  }

  async function getGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setCaptureForm(f => ({ ...f, gps_lat: String(pos.coords.latitude), gps_lng: String(pos.coords.longitude) })),
      () => {}
    );
  }

  const filtered = pods.filter(p =>
    !search || [p.receiver_name, p.captured_by_name, String(p.delivery_id)].some(v => v?.includes(search))
  );

  const verifiedCount = pods.filter(p => p.is_verified).length;
  const pendingCount = pods.filter(p => !p.is_verified).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הוכחת מסירה (POD)</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הוכחות מסירה עם חתימה, תמונה ו-GPS</p>
        </div>
        <Button size="sm" className="bg-primary" onClick={() => setShowCaptureDialog(true)}>
          <Plus className="w-4 h-4 ml-1" />קלוט POD
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <FileCheck className="w-8 h-8 text-blue-400" />
            <div><div className="text-2xl font-bold text-foreground">{pods.length}</div><div className="text-xs text-muted-foreground">סה"כ PODs</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div><div className="text-2xl font-bold text-foreground">{verifiedCount}</div><div className="text-xs text-muted-foreground">מאומתים</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-yellow-400" />
            <div><div className="text-2xl font-bold text-foreground">{pendingCount}</div><div className="text-xs text-muted-foreground">ממתינים לאימות</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <PenLine className="w-8 h-8 text-purple-400" />
            <div><div className="text-2xl font-bold text-foreground">{pods.filter(p => p.signature_data).length}</div><div className="text-xs text-muted-foreground">עם חתימה</div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש לפי שם מקבל, נהג, מזהה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין הוכחות מסירה</p>
              <p className="text-sm mt-1">לחץ על "קלוט POD" כדי להתחיל</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(pod => (
                <div key={pod.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:bg-card/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${pod.signature_data ? 'bg-green-500/20' : 'bg-gray-500/20'}`}>
                      <PenLine className={`w-5 h-5 ${pod.signature_data ? 'text-green-400' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <div className="font-medium text-foreground text-sm">
                        {pod.receiver_name || "נמען לא ידוע"}
                        {pod.is_verified && <Badge className="bg-green-500/20 text-green-300 mr-2 text-xs">מאומת</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        {pod.delivery_id && <span>משלוח #{pod.delivery_id}</span>}
                        {pod.captured_by_name && <span><User className="w-3 h-3 inline ml-1" />{pod.captured_by_name}</span>}
                        {pod.captured_at && <span><Clock className="w-3 h-3 inline ml-1" />{new Date(pod.captured_at).toLocaleDateString("he-IL")}</span>}
                        {pod.gps_lat && pod.gps_lng && <span><MapPin className="w-3 h-3 inline ml-1" />{Number(pod.gps_lat).toFixed(3)}, {Number(pod.gps_lng).toFixed(3)}</span>}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {pod.signature_data && <Badge className="bg-blue-500/20 text-blue-300 text-xs">חתימה</Badge>}
                        {getPhotoUrls(pod).length > 0 && <Badge className="bg-purple-500/20 text-purple-300 text-xs"><Camera className="w-3 h-3 ml-1" />{getPhotoUrls(pod).length} תמונות</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedPod(pod); setShowViewDialog(true); }}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {!pod.is_verified && (
                      <Button variant="ghost" size="sm" onClick={() => verifyPod(pod.id)} className="text-green-400 hover:text-green-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCaptureDialog} onOpenChange={setShowCaptureDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>קלוט הוכחת מסירה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-muted-foreground">מזהה משלוח</label>
                <Input value={captureForm.delivery_id} onChange={e => setCaptureForm(f => ({ ...f, delivery_id: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">מזהה תעודת משלוח</label>
                <Input value={captureForm.delivery_note_id} onChange={e => setCaptureForm(f => ({ ...f, delivery_note_id: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">שם המקבל</label>
              <Input value={captureForm.receiver_name} onChange={e => setCaptureForm(f => ({ ...f, receiver_name: e.target.value }))} placeholder="שם מלא" className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">שם הנהג/שליח</label>
              <Input value={captureForm.captured_by_name} onChange={e => setCaptureForm(f => ({ ...f, captured_by_name: e.target.value }))} placeholder="שם הנהג" className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">מיקום GPS</label>
              <div className="flex gap-2">
                <Input value={captureForm.gps_lat} onChange={e => setCaptureForm(f => ({ ...f, gps_lat: e.target.value }))} placeholder="קו רוחב" className="flex-1" />
                <Input value={captureForm.gps_lng} onChange={e => setCaptureForm(f => ({ ...f, gps_lng: e.target.value }))} placeholder="קו אורך" className="flex-1" />
                <Button variant="outline" size="sm" onClick={getGps} className="shrink-0">
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">חתימה דיגיטלית</label>
              <div className="border border-border rounded-lg overflow-hidden bg-background/30">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={120}
                  className="w-full touch-none cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                />
              </div>
              <div className="flex gap-2 mt-1">
                <Button variant="outline" size="sm" onClick={clearSig}>נקה חתימה</Button>
                {hasSig && <Badge className="bg-green-500/20 text-green-300 self-center">חתימה נקלטה</Badge>}
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">הערות</label>
              <Input value={captureForm.notes} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות מסירה" className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowCaptureDialog(false)}>ביטול</Button>
              <Button onClick={submitPOD} className="bg-primary"><FileCheck className="w-4 h-4 ml-1" />שמור POD</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>פרטי הוכחת מסירה #{selectedPod?.id}</DialogTitle></DialogHeader>
          {selectedPod && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">נמען:</span> <span className="text-foreground">{selectedPod.receiver_name || "—"}</span></div>
                <div><span className="text-muted-foreground">נקלט ע"י:</span> <span className="text-foreground">{selectedPod.captured_by_name || "—"}</span></div>
                <div><span className="text-muted-foreground">תאריך:</span> <span className="text-foreground">{selectedPod.captured_at ? new Date(selectedPod.captured_at).toLocaleString("he-IL") : "—"}</span></div>
                <div><span className="text-muted-foreground">GPS:</span> <span className="text-foreground">{selectedPod.gps_lat ? `${Number(selectedPod.gps_lat).toFixed(4)}, ${Number(selectedPod.gps_lng).toFixed(4)}` : "—"}</span></div>
                {selectedPod.notes && <div className="col-span-2"><span className="text-muted-foreground">הערות:</span> <span className="text-foreground">{selectedPod.notes}</span></div>}
              </div>
              {selectedPod.signature_data && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">חתימה:</div>
                  <div className="border border-border rounded-lg p-2 bg-background/30">
                    <img src={selectedPod.signature_data} alt="חתימה" className="w-full max-h-24 object-contain" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">סטטוס:</span>
                <Badge className={selectedPod.is_verified ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>
                  {selectedPod.is_verified ? "מאומת" : "ממתין לאימות"}
                </Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
