// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 8
// FIELD INTELLIGENCE — Fleet GPS · Photo AI · Knowledge Base ·
// Predictive Maintenance · Employee Wellness
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, addVat, vatOf, clamp, daysAgo, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");

["fleet", "photoai", "knowledge", "maintenance", "wellness"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// FLEET GPS — Real-time vehicle tracking
// ═══════════════════════════════════════

class FleetGPS {
  constructor(memory) {
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "fleet", "state.json");
    this.data = load(this.file, {
      vehicles: [],
      tracks: {},          // vehicleId → array of {lat, lng, speed, heading, t}
      trips: [],           // completed trips with km, duration, fuel
      alerts: [],          // speeding, idle, geofence violations
      geofences: [
        { id: "gf1", name: "מפעל ריבל 37", lat: 32.0573, lng: 34.7702, radiusMeters: 200 },
      ],
      stats: { totalKm: 0, totalFuel: 0, totalCO2: 0, alertsThisMonth: 0 },
    });
  }
  save() { save(this.file, this.data); }

  registerVehicle(data) {
    const v = {
      id: `VEH-${uid()}`,
      plateNumber: data.plateNumber,
      type: data.type || "van",
      model: data.model || "",
      driver: data.driver || null,
      currentLocation: null,
      lastSeen: null,
      status: "idle",     // idle, moving, parked, offline
      fuelLevel: 100,
      odometer: data.odometer || 0,
      maxSpeedKmh: data.maxSpeedKmh || 90,
      registeredAt: now(),
    };
    this.data.vehicles.push(v);
    this.save();
    log("FLEET", `🚐 רכב נרשם: ${v.plateNumber}`);
    return v;
  }

  recordPosition(vehicleId, lat, lng, speed = 0, heading = 0) {
    const v = this.data.vehicles.find(x => x.id === vehicleId);
    if (!v) return null;

    v.currentLocation = { lat, lng };
    v.lastSeen = now();
    v.status = speed > 5 ? "moving" : "parked";

    if (!this.data.tracks[vehicleId]) this.data.tracks[vehicleId] = [];
    this.data.tracks[vehicleId].push({ lat, lng, speed, heading, t: now() });
    this.data.tracks[vehicleId] = this.data.tracks[vehicleId].slice(-1000);

    // Speed alert
    if (speed > v.maxSpeedKmh) {
      this.data.alerts.push({
        id: uid(), vehicleId, type: "speeding",
        speed, max: v.maxSpeedKmh, location: { lat, lng }, t: now(),
      });
      this.data.stats.alertsThisMonth++;
      log("FLEET", `🚨 ${v.plateNumber}: מהירות ${speed} > ${v.maxSpeedKmh}`, "WARN");
    }

    // Geofence check
    for (const gf of this.data.geofences) {
      const dist = this.haversineMeters(lat, lng, gf.lat, gf.lng);
      if (dist > gf.radiusMeters && v.lastGeofence === gf.id) {
        // Left the geofence
        v.lastGeofence = null;
      } else if (dist <= gf.radiusMeters && v.lastGeofence !== gf.id) {
        v.lastGeofence = gf.id;
      }
    }

    this.save();
    return v;
  }

  haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  endTrip(vehicleId) {
    const track = this.data.tracks[vehicleId] || [];
    if (track.length < 2) return null;

    let km = 0;
    for (let i = 1; i < track.length; i++) {
      km += this.haversineMeters(track[i - 1].lat, track[i - 1].lng, track[i].lat, track[i].lng) / 1000;
    }

    const startTime = new Date(track[0].t).getTime();
    const endTime = new Date(track[track.length - 1].t).getTime();
    const minutes = Math.round((endTime - startTime) / 60000);
    const fuelLiters = km * 0.08;
    const fuelCostAgorot = Math.round(fuelLiters * 720);
    const co2Kg = km * 0.18;

    const trip = {
      id: `TRIP-${uid()}`,
      vehicleId, km: Math.round(km * 10) / 10,
      durationMinutes: minutes,
      avgSpeed: minutes > 0 ? Math.round((km / minutes) * 60) : 0,
      fuelLiters: Math.round(fuelLiters * 10) / 10,
      fuelCost: fuelCostAgorot,
      co2Kg: Math.round(co2Kg * 10) / 10,
      startedAt: track[0].t,
      endedAt: track[track.length - 1].t,
    };
    this.data.trips.push(trip);
    this.data.stats.totalKm += trip.km;
    this.data.stats.totalFuel += trip.fuelLiters;
    this.data.stats.totalCO2 += trip.co2Kg;
    this.data.tracks[vehicleId] = []; // reset for next trip
    this.save();
    log("FLEET", `🏁 טיול: ${trip.km}ק"מ · ${trip.durationMinutes}דק' · ${trip.fuelLiters}L · ₪${shekel(trip.fuelCost)}`);
    return trip;
  }

  getActiveVehicles() {
    return this.data.vehicles.filter(v => v.status === "moving" || v.status === "idle");
  }
}

// ═══════════════════════════════════════
// PHOTO AI — Visual quality inspection
// ═══════════════════════════════════════

class PhotoAI {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "photoai", "state.json");
    this.data = load(this.file, {
      analyses: [],
      stats: { photos: 0, defectsFound: 0, perfect: 0 },
    });
  }
  save() { save(this.file, this.data); }

  async analyzePhoto(photoMetadata) {
    const analysis = await this.brain.thinkJSON(`
אתה Photo QA AI של טכנו כל עוזי. נתח תמונה של התקנה.
(זוהי גרסת sub-stub: בפרודקשן תקבל את ה-pixels בפועל)

═══ מידע על התמונה ═══
${JSON.stringify(photoMetadata, null, 2)}

תחזיר JSON:
{
  "objectDetected": "railing/gate/fence/pergola/door/window",
  "alignmentScore": 0-100,
  "uniformityScore": 0-100,
  "paintQualityScore": 0-100,
  "weldQualityScore": 0-100,
  "overallQualityScore": 0-100,
  "defectsDetected": [{
    "type": "misaligned/uneven_paint/poor_weld/scratch/dent/missing_part",
    "severity": "critical/major/minor/cosmetic",
    "location": "...",
    "confidence": 0.0-1.0
  }],
  "recommendation": "approve/touch_up/rework/reject",
  "approvalForCustomerSignoff": true/false,
  "comparisonToStandard": "above/at/below"
}`);

    if (analysis) {
      const record = {
        id: `PHOTO-${uid()}`,
        ...photoMetadata,
        analysis,
        analyzedAt: now(),
      };
      this.data.analyses.push(record);
      this.data.analyses = this.data.analyses.slice(-500);
      this.data.stats.photos++;
      if (analysis.defectsDetected?.length > 0) {
        this.data.stats.defectsFound += analysis.defectsDetected.length;
      } else {
        this.data.stats.perfect++;
      }
      this.save();

      const score = analysis.overallQualityScore || 0;
      log("PHOTO-AI", `📸 איכות: ${score}/100 — ${analysis.recommendation}`,
        score >= 80 ? "SUCCESS" : score >= 60 ? "WARN" : "ERROR");
    }
    return analysis;
  }
}

// ═══════════════════════════════════════
// KNOWLEDGE BASE AI — 80 years of metalworking expertise
// ═══════════════════════════════════════

class KnowledgeBaseAI {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "knowledge", "state.json");
    this.data = load(this.file, {
      articles: [],
      categories: ["welding", "painting", "cutting", "installation", "safety", "materials", "design", "regulations"],
      faqs: [],
      tutorials: [],
      tribalKnowledge: [],
      stats: { totalArticles: 0, totalQueries: 0, helpfulRate: 0 },
    });

    if (this.data.articles.length === 0) this.seedDefaults();
  }
  save() { save(this.file, this.data); }

  seedDefaults() {
    const defaults = [
      {
        title: "ריתוך MIG על ברזל 40×40",
        category: "welding",
        content: "השתמש בחוט 0.8 מ\"מ, גז Argon-CO2 80/20, מתח 18-22V, מהירות הזנה 6-8m/min. נקה את משטח הריתוך מחלודה, צבע ושומן. ריתוך נקודתי קודם, ואז ריתוך רציף.",
        keywords: ["ריתוך", "MIG", "ברזל", "פרופיל"],
      },
      {
        title: "גובה מינימלי למעקה לפי ת\"י 1142",
        category: "regulations",
        content: "גובה מינימלי 105ס\"מ למרפסות מעל הקרקע, 90ס\"מ למדרגות. מרווח אנכי בין חלקים מקסימום 10ס\"מ (מניעת מעבר ראש ילד). ראה תקן ת\"י 1142.",
        keywords: ["ת\"י", "1142", "גובה", "מעקה", "בטיחות", "תקן"],
      },
      {
        title: "צביעת ברזל לים — איזה צבע?",
        category: "painting",
        content: "באזורים עם רוח ים (חולון, בת ים, נתניה, חיפה) השתמש בצבע יסוד אפוקסי 2-רכיבים + צבע גמר פוליאוריטן עמיד UV. עובי כללי מינימום 120 מיקרון. סנדבלסט לפני!",
        keywords: ["צבע", "ים", "אפוקסי", "פוליאוריטן", "קורוזיה"],
      },
      {
        title: "חישוב צבע נדרש למעקה",
        category: "painting",
        content: "כלל אצבע: 1 ליטר צבע יסוד = ~10 מ\"ר כיסוי. מעקה ברזל סטנדרטי 1 מטר אורך = ~0.4 מ\"ר משטח כפול. לכן 1 ליטר יסוד = ~12 מטר מעקה. הוסף 20% פחת.",
        keywords: ["צבע", "כמות", "חישוב", "מעקה"],
      },
      {
        title: "התקנת שער חשמלי הזזה — שלבי בטיחות",
        category: "installation",
        content: "1. נתק חשמל. 2. הרכב מסילה ישרה ואופקית. 3. בדוק יישור עם רמה. 4. חבר מנוע ובדוק תנועה ידנית. 5. חבר חשמל לפי תקן ת\"י 1201. 6. התקן פוטוסל לבטיחות. 7. בדוק עצירה אוטומטית בזיהוי מכשול. 8. הסבר ללקוח.",
        keywords: ["שער", "חשמלי", "התקנה", "בטיחות", "פוטוסל"],
      },
      {
        title: "מה לעשות אם זכוכית מחוסמת מתפוצצת?",
        category: "safety",
        content: "1. הרחק את הלקוח. 2. צלם את המקום. 3. אסוף את כל הרסיסים (זכוכית מחוסמת מתפוצצת לרסיסים קטנים, לא לפלחים). 4. בדוק את המסגרת לנזק. 5. הזמן זכוכית חלופית מהספק. 6. תעד אירוע במערכת איכות.",
        keywords: ["זכוכית", "מחוסמת", "תקלה", "התפוצצות", "בטיחות"],
      },
    ];

    for (const d of defaults) {
      this.addArticle(d);
    }
  }

  addArticle(data) {
    const a = {
      id: `KB-${uid()}`,
      title: data.title,
      category: data.category || "general",
      content: data.content,
      keywords: data.keywords || [],
      author: data.author || "system",
      views: 0, helpful: 0, notHelpful: 0,
      createdAt: now(),
    };
    this.data.articles.push(a);
    this.data.stats.totalArticles = this.data.articles.length;
    this.save();
    return a;
  }

  search(query) {
    const q = query.toLowerCase();
    return this.data.articles
      .filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        a.keywords.some(k => k.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }

  async ask(question, context = "") {
    this.data.stats.totalQueries++;
    const relevant = this.search(question.split(" ")[0]).slice(0, 3);

    const answer = await this.brain.thinkJSON(`
אתה ה-Knowledge Base של טכנו כל עוזי — 80 שנות ניסיון בעבודות מתכת.
ענה על שאלת העובד.

שאלה: ${question}
${context ? `הקשר: ${context}` : ""}

מאמרים רלוונטיים:
${JSON.stringify(relevant.map(a => ({ title: a.title, content: a.content })))}

תחזיר JSON:
{
  "answer": "תשובה ברורה ופרקטית",
  "steps": ["צעד 1"],
  "warnings": ["אזהרה אם רלוונטי"],
  "relatedArticles": ["..."],
  "confidence": 0.0-1.0,
  "needsExpert": true/false
}`);

    this.save();
    return answer;
  }
}

// ═══════════════════════════════════════
// PREDICTIVE MAINTENANCE — Equipment failure prediction
// ═══════════════════════════════════════

class PredictiveMaintenance {
  constructor(brain, memory) {
    this.brain = brain;
    this.memory = memory;
    this.file = path.join(CONFIG.DIR, "maintenance", "state.json");
    this.data = load(this.file, {
      equipment: [
        { id: "eq1", name: "מכונת ריתוך MIG ראשית", type: "welder", model: "Lincoln Powermig 256", purchasedAt: "2019-03-01", expectedLifespanYears: 8, lastServiceDate: null, hoursOperated: 0, condition: "good" },
        { id: "eq2", name: "מכונת ריתוך TIG", type: "welder", model: "Miller Dynasty 280", purchasedAt: "2021-06-15", expectedLifespanYears: 10, lastServiceDate: null, hoursOperated: 0, condition: "good" },
        { id: "eq3", name: "מסור זוויתי תעשייתי", type: "saw", model: "Festool TKS 80", purchasedAt: "2020-01-10", expectedLifespanYears: 6, lastServiceDate: null, hoursOperated: 0, condition: "good" },
        { id: "eq4", name: "מכונת CNC לחיתוך פלזמה", type: "cnc", model: "Hypertherm 65", purchasedAt: "2022-08-20", expectedLifespanYears: 12, lastServiceDate: null, hoursOperated: 0, condition: "good" },
        { id: "eq5", name: "מנוף 5 טון בייצור", type: "crane", model: "Demag DR-Pro", purchasedAt: "2018-11-05", expectedLifespanYears: 15, lastServiceDate: null, hoursOperated: 0, condition: "good" },
        { id: "eq6", name: "אקדח צבע אבקה", type: "paint", model: "Wagner C4", purchasedAt: "2021-04-12", expectedLifespanYears: 5, lastServiceDate: null, hoursOperated: 0, condition: "good" },
      ],
      services: [],
      predictions: [],
      alerts: [],
    });
  }
  save() { save(this.file, this.data); }

  recordOperation(equipmentId, hours) {
    const eq = this.data.equipment.find(e => e.id === equipmentId);
    if (!eq) return null;
    eq.hoursOperated += hours;

    // Predictive logic — simple thresholds
    const ageYears = (Date.now() - new Date(eq.purchasedAt).getTime()) / (365 * 86400000);
    const lifeUsedPercent = (ageYears / eq.expectedLifespanYears) * 100;

    if (lifeUsedPercent > 80 && eq.condition === "good") {
      eq.condition = "needs_attention";
      this.data.alerts.push({
        id: uid(), equipmentId, equipmentName: eq.name,
        type: "lifecycle_warning",
        message: `${eq.name} מגיע ל-${lifeUsedPercent.toFixed(0)}% מאורך החיים הצפוי`,
        severity: "medium", t: now(),
      });
      log("MAINT", `⚠️ ${eq.name}: ${lifeUsedPercent.toFixed(0)}% lifecycle used`, "WARN");
    }

    this.save();
    return eq;
  }

  scheduleService(equipmentId, type = "preventive") {
    const eq = this.data.equipment.find(e => e.id === equipmentId);
    if (!eq) return null;
    const service = {
      id: uid(), equipmentId, equipmentName: eq.name,
      type, // preventive, corrective, emergency
      scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      status: "scheduled",
      estimatedCost: agorot(800),
      createdAt: now(),
    };
    this.data.services.push(service);
    this.save();
    return service;
  }

  async predictFailures() {
    const aging = this.data.equipment.filter(e => {
      const years = (Date.now() - new Date(e.purchasedAt).getTime()) / (365 * 86400000);
      return years / e.expectedLifespanYears > 0.6;
    });

    if (aging.length === 0) return [];

    const predictions = await this.brain.thinkJSON(`
נתח ציוד וצפה כשלים. עבור כל פריט ציוד:
${JSON.stringify(aging.map(e => ({ name: e.name, type: e.type, age: e.purchasedAt, hoursOperated: e.hoursOperated, condition: e.condition })))}

תחזיר JSON:
{
  "predictions": [{
    "equipmentName": "...",
    "failureRisk": 0.0-1.0,
    "expectedFailureWithinDays": 0,
    "failureType": "...",
    "preventiveAction": "...",
    "estimatedCostIfFails": 0,
    "estimatedCostIfPrevented": 0
  }]
}`);

    if (predictions?.predictions) {
      this.data.predictions.push({ ...predictions, t: now() });
      this.save();
    }
    return predictions;
  }
}

// ═══════════════════════════════════════
// EMPLOYEE WELLNESS — Burnout detection
// ═══════════════════════════════════════

class EmployeeWellness {
  constructor(brain, memory, hr) {
    this.brain = brain;
    this.memory = memory;
    this.hr = hr;
    this.file = path.join(CONFIG.DIR, "wellness", "state.json");
    this.data = load(this.file, {
      wellnessScores: {},
      burnoutAlerts: [],
      checkInHistory: [],
      interventions: [],
    });
  }
  save() { save(this.file, this.data); }

  computeWellnessScore(employeeId) {
    const emp = this.hr?.data?.employees?.find(e => e.id === employeeId);
    if (!emp) return null;

    const lateCount = (emp.attendance || []).filter(a => a.type === "late").length;
    const absentCount = (emp.attendance || []).filter(a => a.type === "absent").length;
    const warnings = (emp.warnings || []).length;
    const recentLeaves = (this.hr.data.leaves || []).filter(l => l.empId === employeeId).slice(-5);
    const sickLeaves = recentLeaves.filter(l => l.leaveType === "sick").length;

    let score = 100;
    score -= lateCount * 3;
    score -= absentCount * 5;
    score -= warnings * 10;
    score -= sickLeaves * 4;
    score = clamp(score, 0, 100);

    let burnoutRisk = "low";
    if (score < 40) burnoutRisk = "critical";
    else if (score < 60) burnoutRisk = "high";
    else if (score < 75) burnoutRisk = "medium";

    const wellness = {
      employeeId, employeeName: emp.name, score, burnoutRisk,
      factors: { lateCount, absentCount, warnings, sickLeaves },
      computedAt: now(),
    };

    this.data.wellnessScores[employeeId] = wellness;

    if (burnoutRisk === "critical" || burnoutRisk === "high") {
      const existing = this.data.burnoutAlerts.find(a => a.employeeId === employeeId && !a.resolved);
      if (!existing) {
        this.data.burnoutAlerts.push({
          id: uid(), employeeId, employeeName: emp.name,
          risk: burnoutRisk, score, t: now(),
          resolved: false,
        });
        this.memory.add("alerts", { type: "employee_wellness", risk: burnoutRisk, employee: emp.name });
        log("WELLNESS", `⚠️ סיכון שחיקה ${burnoutRisk}: ${emp.name} (${score}/100)`, "WARN");
      }
    }

    this.save();
    return wellness;
  }

  scanAllEmployees() {
    const employees = this.hr?.data?.employees?.filter(e => e.status === "active") || [];
    return employees.map(e => this.computeWellnessScore(e.id));
  }

  recordCheckIn(employeeId, mood, comments = "") {
    const checkIn = {
      id: uid(), employeeId, mood, // 1-5
      comments, t: now(),
    };
    this.data.checkInHistory.push(checkIn);
    this.data.checkInHistory = this.data.checkInHistory.slice(-500);
    this.save();
    return checkIn;
  }

  getTeamMorale() {
    const recent = this.data.checkInHistory.slice(-100);
    if (recent.length === 0) return null;
    const avg = recent.reduce((s, c) => s + c.mood, 0) / recent.length;
    return Math.round(avg * 20); // convert 1-5 to 0-100
  }
}

// ═══════════════════════════════════════
// EXPORT PART 8
// ═══════════════════════════════════════

module.exports = {
  FleetGPS,
  PhotoAI,
  KnowledgeBaseAI,
  PredictiveMaintenance,
  EmployeeWellness,
};
