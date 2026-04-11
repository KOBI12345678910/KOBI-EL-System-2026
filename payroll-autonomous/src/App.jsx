import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════
// ISRAELI PAYROLL ENGINE 2025
// ═══════════════════════════════════════════════
const TAX = [
  {max:7010,r:.10},{max:10060,r:.14},{max:16150,r:.20},{max:22440,r:.31},
  {max:46690,r:.35},{max:60130,r:.47},{max:Infinity,r:.50}
];
const CP_VAL=242, BL_T=7122, BL_L=.035, BL_H=.12, HT_L=.031, HT_H=.05;
const PEN_E=.06, PEN_R=.065, SEV=.0833, VAT=.17, WORK_DAYS=22, WORK_HRS=186;
const OT_125=1.25, OT_150=1.50, OT_200=2.0;

const taxCalc=(g,cp=2.25)=>{let t=0,p=0;for(const b of TAX){t+=(Math.min(g,b.max)-p)*b.r;p=b.max;if(g<=b.max)break;}return Math.max(0,t-cp*CP_VAL);};
const blCalc=g=>Math.min(g,BL_T)*BL_L+Math.max(0,g-BL_T)*BL_H;
const htCalc=g=>Math.min(g,BL_T)*HT_L+Math.max(0,g-BL_T)*HT_H;
const fmt=n=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0}).format(n);
const fmtD=n=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:2}).format(n);
const MO=["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const nowTime=()=>{const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};

// ═══════════════════════════════════════════════
// SMART PAYROLL ENGINE — Event-Driven Auto Calc
// ═══════════════════════════════════════════════
function autoCalcEmployee(emp, attendance, month, year) {
  const monthKey = `${year}-${String(month+1).padStart(2,'0')}`;
  const records = (attendance||[]).filter(a => a.empId===emp.id && a.date?.startsWith(monthKey));

  const daysWorked = records.filter(r=>r.status==="present"||r.status==="partial").length;
  const daysAbsent = records.filter(r=>r.status==="absent").length;
  const daysSick = records.filter(r=>r.status==="sick").length;
  const daysVacation = records.filter(r=>r.status==="vacation").length;
  const daysReserve = records.filter(r=>r.status==="reserve").length;

  let totalRegularHrs = 0, totalOT125 = 0, totalOT150 = 0, totalOT200 = 0;
  records.filter(r=>r.status==="present"||r.status==="partial").forEach(r => {
    const hrs = r.hoursWorked || 0;
    if (hrs <= 8.5) { totalRegularHrs += hrs; }
    else if (hrs <= 10) { totalRegularHrs += 8.5; totalOT125 += hrs - 8.5; }
    else if (hrs <= 12) { totalRegularHrs += 8.5; totalOT125 += 1.5; totalOT150 += hrs - 10; }
    else { totalRegularHrs += 8.5; totalOT125 += 1.5; totalOT150 += 2; totalOT200 += hrs - 12; }
  });

  const hourlyRate = emp.baseSalary / WORK_HRS;
  const basePay = Math.min(daysWorked, WORK_DAYS) / WORK_DAYS * emp.baseSalary;
  const otPay = hourlyRate * (totalOT125*OT_125 + totalOT150*OT_150 + totalOT200*OT_200);
  const sickPay = daysSick <= 1 ? 0 : daysSick <= 3 ? hourlyRate*8.5*(daysSick-1)*0.5 : hourlyRate*8.5*2*0.5 + hourlyRate*8.5*(daysSick-3);
  const vacPay = daysVacation * hourlyRate * 8.5;
  const reservePay = daysReserve * hourlyRate * 8.5;
  const transport = (emp.transport||0) * daysWorked;
  const bonus = emp.bonus || 0;

  const gross = basePay + otPay + sickPay + vacPay + reservePay + transport + bonus;
  const tax = taxCalc(gross, emp.creditPoints);
  const bl = blCalc(gross);
  const ht = htCalc(gross);
  const penE = emp.hasPension ? gross * PEN_E : 0;
  const penR = emp.hasPension ? gross * PEN_R : 0;
  const sev = gross * SEV;
  const totalDeductions = tax + bl + ht + penE;
  const net = gross - totalDeductions;
  const erCost = gross + penR + sev + bl*1.05;

  const anomalies = [];
  if (daysAbsent > 3) anomalies.push({ type:"warn", msg:`${daysAbsent} ימי היעדרות` });
  if (totalOT125+totalOT150+totalOT200 > 30) anomalies.push({ type:"alert", msg:"שעות נוספות חריגות" });
  if (gross < emp.baseSalary * 0.7) anomalies.push({ type:"warn", msg:"שכר נמוך משמעותית מהבסיס" });
  if (daysWorked === 0 && records.length === 0) anomalies.push({ type:"info", msg:"אין דיווח נוכחות" });
  const efficiency = daysWorked > 0 ? Math.round((totalRegularHrs/(daysWorked*8.5))*100) : 0;

  return {
    ...emp, gross, basePay, otPay, sickPay, vacPay, reservePay, transport, bonus,
    tax, bl, ht, penE, penR, sev, totalDeductions, net, erCost, hourlyRate,
    daysWorked, daysAbsent, daysSick, daysVacation, daysReserve,
    totalRegularHrs, totalOT125, totalOT150, totalOT200,
    anomalies, efficiency
  };
}

function autoCalcSub(sub, jobs) {
  const subJobs = (jobs||[]).filter(j=>j.subId===sub.id);
  const completedJobs = subJobs.filter(j=>j.status==="completed");
  const activeJobs = subJobs.filter(j=>j.status==="active");
  const totalBilled = completedJobs.reduce((a,j)=>a+j.amount,0);
  const vat = sub.hasVAT ? totalBilled * VAT : 0;
  const withhold = totalBilled * sub.taxRate;
  const toPay = totalBilled + vat - withhold;
  const anomalies = [];
  if (completedJobs.length === 0 && activeJobs.length > 0) anomalies.push({ type:"info", msg:"עבודות פעילות ללא סגירה" });
  if (totalBilled > 50000) anomalies.push({ type:"warn", msg:"חיוב חודשי גבוה" });
  return { ...sub, subJobs, completedJobs, activeJobs, totalBilled, vat, withhold, toPay, anomalies };
}

// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════
const KEYS = { emp:"pr-emp-v2", sub:"pr-sub-v2", att:"pr-att-v2", jobs:"pr-jobs-v2", runs:"pr-runs-v2", log:"pr-log-v2" };
async function load(k,fb){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):fb;}catch{return fb;}}
async function save(k,v){try{await window.storage.set(k,JSON.stringify(v));}catch(e){console.error(e);}}

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════
const TABS=[
  {k:"dash",i:"⚡",l:"דשבורד"},
  {k:"emp",i:"👷",l:"עובדים"},
  {k:"att",i:"⏰",l:"נוכחות"},
  {k:"sub",i:"🔧",l:"קבלנים"},
  {k:"jobs",i:"🏗️",l:"התקנות"},
  {k:"run",i:"▶️",l:"הרצת שכר"},
  {k:"slips",i:"📄",l:"תלושים"},
  {k:"log",i:"📋",l:"לוג"},
];

export default function App() {
  const [tab,setTab]=useState("dash");
  const [employees,setEmployees]=useState([]);
  const [subs,setSubs]=useState([]);
  const [attendance,setAttendance]=useState([]);
  const [jobs,setJobs]=useState([]);
  const [runs,setRuns]=useState([]);
  const [eventLog,setEventLog]=useState([]);
  const [loading,setLoading]=useState(true);
  const [month]=useState(new Date().getMonth());
  const [year]=useState(new Date().getFullYear());
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [toast,setToast]=useState(null);
  const [runResult,setRunResult]=useState(null);
  const [selectedSlip,setSelectedSlip]=useState(null);

  useEffect(()=>{(async()=>{
    const [e,s,a,j,r,l]=await Promise.all([load(KEYS.emp,[]),load(KEYS.sub,[]),load(KEYS.att,[]),load(KEYS.jobs,[]),load(KEYS.runs,[]),load(KEYS.log,[])]);
    setEmployees(e);setSubs(s);setAttendance(a);setJobs(j);setRuns(r);setEventLog(l);setLoading(false);
  })();},[]);

  const notify=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const logEvent=useCallback(async(action,detail)=>{
    const entry={id:uid(),time:new Date().toISOString(),action,detail};
    setEventLog(prev=>{const n=[entry,...prev].slice(0,200);save(KEYS.log,n);return n;});
  },[]);

  const empCalcs=useMemo(()=>employees.filter(e=>e.active!==false).map(e=>autoCalcEmployee(e,attendance,month,year)),[employees,attendance,month,year]);
  const subCalcs=useMemo(()=>subs.filter(s=>s.active!==false).map(s=>autoCalcSub(s,jobs)),[subs,jobs]);
  const allAnomalies=useMemo(()=>[...empCalcs.flatMap(e=>e.anomalies.map(a=>({...a,name:e.name,type2:"emp"}))),...subCalcs.flatMap(s=>s.anomalies.map(a=>({...a,name:s.name,type2:"sub"})))]  ,[empCalcs,subCalcs]);

  const saveEmployee=async(data)=>{
    const isEdit=employees.some(e=>e.id===data.id);
    let next;
    if(isEdit){next=employees.map(e=>e.id===data.id?data:e);}
    else{data.id=uid();data.active=true;data.createdAt=new Date().toISOString();next=[...employees,data];}
    setEmployees(next);await save(KEYS.emp,next);
    logEvent(isEdit?"עדכון עובד":"עובד חדש",data.name);
    notify(isEdit?`${data.name} עודכן`:`${data.name} נוסף`);setModal(null);
  };

  const saveSub=async(data)=>{
    const isEdit=subs.some(s=>s.id===data.id);
    let next;
    if(isEdit){next=subs.map(s=>s.id===data.id?data:s);}
    else{data.id=uid();data.active=true;data.createdAt=new Date().toISOString();next=[...subs,data];}
    setSubs(next);await save(KEYS.sub,next);
    logEvent(isEdit?"עדכון קבלן":"קבלן חדש",data.name);
    notify(isEdit?`${data.name} עודכן`:`${data.name} נוסף`);setModal(null);
  };

  const clockAction=async(empId,status,hoursWorked=8.5)=>{
    const rec={id:uid(),empId,date:today(),time:nowTime(),status,hoursWorked:+hoursWorked,createdAt:new Date().toISOString()};
    const next=[...attendance.filter(a=>!(a.empId===empId&&a.date===today())),rec];
    setAttendance(next);await save(KEYS.att,next);
    const emp=employees.find(e=>e.id===empId);
    logEvent("נוכחות",`${emp?.name}: ${status==="present"?"נוכח":status==="absent"?"נעדר":status==="sick"?"מחלה":status==="vacation"?"חופשה":status==="partial"?"חלקי":status}`);
    notify(`נוכחות עודכנה - ${emp?.name}`);
  };

  const saveJob=async(data)=>{
    const isEdit=jobs.some(j=>j.id===data.id);
    let next;
    if(isEdit){next=jobs.map(j=>j.id===data.id?data:j);}
    else{data.id=uid();data.createdAt=new Date().toISOString();next=[...jobs,data];}
    setJobs(next);await save(KEYS.jobs,next);
    const sub=subs.find(s=>s.id===data.subId);
    logEvent(data.status==="completed"?"התקנה הושלמה":"התקנה חדשה",`${sub?.name}: ${data.description} - ${fmt(data.amount)}`);
    notify(data.status==="completed"?`התקנה הושלמה → חשבונית אוטומטית`:`התקנה נוספה`);
    setModal(null);
  };

  const completeJob=async(jobId)=>{
    const next=jobs.map(j=>j.id===jobId?{...j,status:"completed",completedAt:new Date().toISOString()}:j);
    setJobs(next);await save(KEYS.jobs,next);
    const job=next.find(j=>j.id===jobId);
    const sub=subs.find(s=>s.id===job?.subId);
    logEvent("התקנה הושלמה",`${sub?.name}: ${job?.description} → ${fmt(job?.amount)} נכנס לחישוב אוטומטי`);
    notify("✅ התקנה הושלמה — סכום נכנס אוטומטית לחישוב השכר");
  };

  const runPayroll=async()=>{
    const mk=`${year}-${String(month+1).padStart(2,'0')}`;
    const empResults=empCalcs.map(e=>({...e}));
    const subResults=subCalcs.map(s=>({...s}));
    const result={id:uid(),monthKey:mk,month,year,createdAt:new Date().toISOString(),employees:empResults,subs:subResults,
      totals:{empGross:empResults.reduce((a,e)=>a+e.gross,0),empNet:empResults.reduce((a,e)=>a+e.net,0),empErCost:empResults.reduce((a,e)=>a+e.erCost,0),subBilled:subResults.reduce((a,s)=>a+s.totalBilled,0),subPay:subResults.reduce((a,s)=>a+s.toPay,0),grandTotal:empResults.reduce((a,e)=>a+e.erCost,0)+subResults.reduce((a,s)=>a+s.toPay,0)}
    };
    const next=[result,...runs];setRuns(next);await save(KEYS.runs,next);
    setRunResult(result);
    logEvent("הרצת שכר",`${MO[month]} ${year} — ${fmt(result.totals.grandTotal)}`);
    notify(`שכר ${MO[month]} חושב בהצלחה!`);
    setTab("slips");
  };

  const bulkAttendance=async(status)=>{
    const recs=employees.filter(e=>e.active!==false).map(e=>({id:uid(),empId:e.id,date:today(),time:nowTime(),status,hoursWorked:status==="present"?8.5:0,createdAt:new Date().toISOString()}));
    const filtered=attendance.filter(a=>!recs.some(r=>r.empId===a.empId&&r.date===a.date));
    const next=[...filtered,...recs];setAttendance(next);await save(KEYS.att,next);
    logEvent("נוכחות קבוצתית",`${employees.length} עובדים: ${status}`);
    notify(`כל העובדים סומנו: ${status==="present"?"נוכחים":"נעדרים"}`);
  };

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#080b14",color:"#f59e0b",fontFamily:"monospace",fontSize:18}}>⚡ טוען מערכת שכר...</div>;

  const cs={
    page:{fontFamily:"'SF Pro Display','Segoe UI',sans-serif",direction:"rtl",background:"#080b14",minHeight:"100vh",color:"#c8d0dc",position:"relative"},
    nav:{display:"flex",gap:2,padding:"8px 12px",background:"#0d1120",borderBottom:"1px solid #1a2035",overflowX:"auto",whiteSpace:"nowrap"},
    navBtn:(active)=>({padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:active?"#f59e0b":"transparent",color:active?"#080b14":"#64748b",transition:"all .15s",flexShrink:0}),
    card:{background:"#0d1120",border:"1px solid #1a2035",borderRadius:14,padding:16,marginBottom:10},
    cardGlow:(c)=>({background:`linear-gradient(135deg,${c}08,${c}03)`,border:`1px solid ${c}25`,borderRadius:14,padding:16,marginBottom:10}),
    input:{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #1e2a42",background:"#080b14",color:"#e2e8f0",fontSize:13,boxSizing:"border-box",outline:"none"},
    select:{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #1e2a42",background:"#080b14",color:"#e2e8f0",fontSize:13,boxSizing:"border-box"},
    label:{fontSize:11,color:"#4a5578",display:"block",marginBottom:3,fontWeight:600},
    btn:(bg,c="#fff")=>({padding:"8px 16px",borderRadius:8,border:"none",background:bg,color:c,cursor:"pointer",fontWeight:700,fontSize:13,transition:"all .15s"}),
    badge:(bg,c)=>({display:"inline-block",padding:"2px 8px",borderRadius:20,background:bg,color:c,fontSize:10,fontWeight:700}),
    metric:(c="#f59e0b")=>({background:"#080b14",borderRadius:10,padding:"10px",textAlign:"center",border:`1px solid ${c}15`}),
    row:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #111827"},
    grid:(c="repeat(auto-fit,minmax(130px,1fr))")=>({display:"grid",gridTemplateColumns:c,gap:8}),
    overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:16},
    modal:{background:"#0d1120",border:"1px solid #1a2035",borderRadius:16,padding:20,width:"100%",maxWidth:520,maxHeight:"80vh",overflowY:"auto",direction:"rtl"},
    toast:(type)=>({position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",padding:"10px 24px",borderRadius:10,background:type==="success"?"#22c55e":type==="error"?"#ef4444":"#f59e0b",color:"#fff",fontWeight:700,fontSize:14,zIndex:9999,boxShadow:"0 8px 30px rgba(0,0,0,.4)"}),
  };

  const Field=({label,children})=><div style={{marginBottom:10}}><label style={cs.label}>{label}</label>{children}</div>;
  const Metric=({label,value,color="#f59e0b",sub})=><div style={cs.metric(color)}><div style={{fontSize:10,color:"#4a5578",marginBottom:2}}>{label}</div><div style={{fontSize:17,fontWeight:800,color}}>{value}</div>{sub&&<div style={{fontSize:10,color:"#4a5578",marginTop:2}}>{sub}</div>}</div>;
  const Badge=({children,color="#f59e0b"})=><span style={cs.badge(color+"22",color)}>{children}</span>;

  const todayKey=today();
  const todayAttendance=attendance.filter(a=>a.date===todayKey);
  const presentToday=todayAttendance.filter(a=>a.status==="present"||a.status==="partial").length;
  const absentToday=todayAttendance.filter(a=>a.status==="absent").length;
  const activeJobs=jobs.filter(j=>j.status==="active");

  return (
    <div style={cs.page}>
      <div style={{background:"linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:26}}>⚡</div>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"#080b14",letterSpacing:-.5}}>מערכת שכר אוטונומית</div>
          <div style={{fontSize:11,color:"#080b14aa"}}>טכנו-קול • {MO[month]} {year} • חישוב מבוסס אירועים</div>
        </div>
        <div style={{marginRight:"auto",display:"flex",gap:6}}>
          {allAnomalies.length>0&&<span style={{...cs.badge("#ef444433","#ef4444"),fontSize:11}}>⚠ {allAnomalies.length} התראות</span>}
          <span style={{...cs.badge("#22c55e22","#22c55e"),fontSize:11}}>{presentToday}/{employees.length} נוכחים</span>
        </div>
      </div>

      <div style={cs.nav}>
        {TABS.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={cs.navBtn(tab===t.k)}>{t.i} {t.l}</button>)}
      </div>

      <div style={{padding:"12px 14px",maxWidth:960,margin:"0 auto"}}>

      {tab==="dash"&&<div>
        <div style={{...cs.grid("repeat(auto-fit,minmax(100px,1fr))"),marginBottom:12}}>
          <Metric label="עובדים פעילים" value={employees.filter(e=>e.active!==false).length} color="#3b82f6"/>
          <Metric label="נוכחים היום" value={presentToday} color="#22c55e" sub={absentToday>0?`${absentToday} נעדרים`:""}/>
          <Metric label="קבלנים" value={subs.filter(s=>s.active!==false).length} color="#a855f7"/>
          <Metric label="התקנות פעילות" value={activeJobs.length} color="#f59e0b"/>
        </div>
        <div style={{...cs.grid("1fr 1fr"),marginBottom:12}}>
          <div style={cs.cardGlow("#3b82f6")}>
            <div style={{fontSize:12,color:"#3b82f6",fontWeight:700,marginBottom:6}}>💰 עלות עובדים (צפי)</div>
            <div style={{fontSize:22,fontWeight:800,color:"#3b82f6"}}>{fmt(empCalcs.reduce((a,e)=>a+e.erCost,0))}</div>
            <div style={{fontSize:11,color:"#4a5578",marginTop:4}}>ברוטו: {fmt(empCalcs.reduce((a,e)=>a+e.gross,0))} • נטו: {fmt(empCalcs.reduce((a,e)=>a+e.net,0))}</div>
          </div>
          <div style={cs.cardGlow("#a855f7")}>
            <div style={{fontSize:12,color:"#a855f7",fontWeight:700,marginBottom:6}}>🔧 עלות קבלנים (צפי)</div>
            <div style={{fontSize:22,fontWeight:800,color:"#a855f7"}}>{fmt(subCalcs.reduce((a,s)=>a+s.toPay,0))}</div>
            <div style={{fontSize:11,color:"#4a5578",marginTop:4}}>חשבוניות: {fmt(subCalcs.reduce((a,s)=>a+s.totalBilled,0))}</div>
          </div>
        </div>
        <div style={cs.cardGlow("#f59e0b")}>
          <div style={{fontSize:12,color:"#f59e0b",fontWeight:700,marginBottom:4}}>⚡ סה"כ הוצאות שכר חודשיות</div>
          <div style={{fontSize:28,fontWeight:900,color:"#f59e0b"}}>{fmt(empCalcs.reduce((a,e)=>a+e.erCost,0)+subCalcs.reduce((a,s)=>a+s.toPay,0))}</div>
        </div>
        {allAnomalies.length>0&&<div style={{...cs.card,borderColor:"#ef444433"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#ef4444",marginBottom:8}}>⚠️ התראות אוטומטיות</div>
          {allAnomalies.map((a,i)=><div key={i} style={{...cs.row,gap:8}}>
            <span style={cs.badge(a.type==="alert"?"#ef444422":"#f59e0b22",a.type==="alert"?"#ef4444":"#f59e0b")}>{a.type==="alert"?"🔴":"🟡"} {a.type2==="emp"?"עובד":"קבלן"}</span>
            <span style={{flex:1,fontSize:13}}>{a.name}</span>
            <span style={{fontSize:12,color:"#94a3b8"}}>{a.msg}</span>
          </div>)}
        </div>}
        {eventLog.length>0&&<div style={cs.card}>
          <div style={{fontSize:13,fontWeight:700,color:"#64748b",marginBottom:8}}>📋 פעולות אחרונות</div>
          {eventLog.slice(0,5).map(e=><div key={e.id} style={{...cs.row,fontSize:12}}>
            <span style={{color:"#4a5578"}}>{new Date(e.time).toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"})}</span>
            <span style={{color:"#f59e0b",fontWeight:600}}>{e.action}</span>
            <span style={{color:"#94a3b8",flex:1,textAlign:"left"}}>{e.detail}</span>
          </div>)}
        </div>}
      </div>}

      {tab==="emp"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700}}>👷 עובדים ({employees.filter(e=>e.active!==false).length})</div>
          <button onClick={()=>{setForm({baseSalary:"",creditPoints:"2.25",hasPension:true,transport:"0",bonus:"0",overtime:"0"});setModal("emp");}} style={cs.btn("#f59e0b","#080b14")}>+ הוסף עובד</button>
        </div>
        {empCalcs.map(e=><div key={e.id} style={cs.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <span style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{e.name}</span>
              {e.role&&<span style={{fontSize:11,color:"#4a5578",marginRight:8}}>{e.role}</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              {e.anomalies.map((a,i)=><Badge key={i} color={a.type==="alert"?"#ef4444":"#f59e0b"}>{a.msg}</Badge>)}
              <button onClick={()=>{setForm(e);setModal("emp");}} style={{background:"none",border:"none",color:"#3b82f6",cursor:"pointer",fontSize:12}}>✏️</button>
              <button onClick={async()=>{const next=employees.map(x=>x.id===e.id?{...x,active:false}:x);setEmployees(next);await save(KEYS.emp,next);logEvent("עובד הושבת",e.name);}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          </div>
          <div style={cs.grid("repeat(auto-fit,minmax(95px,1fr))")}>
            <Metric label="ברוטו" value={fmt(e.gross)} color="#f59e0b"/>
            <Metric label="נטו" value={fmt(e.net)} color="#22c55e"/>
            <Metric label="עלות מעסיק" value={fmt(e.erCost)} color="#a855f7"/>
            <Metric label="ימי עבודה" value={e.daysWorked} color="#3b82f6"/>
            <Metric label="שעות נוספות" value={`${(e.totalOT125+e.totalOT150+e.totalOT200).toFixed(1)}`} color="#f59e0b"/>
            <Metric label="יעילות" value={`${e.efficiency}%`} color={e.efficiency>80?"#22c55e":"#ef4444"}/>
          </div>
          <div style={{marginTop:8,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:4,fontSize:11,color:"#4a5578"}}>
            <span>מס: {fmt(e.tax)}</span><span>ב.ל: {fmt(e.bl)}</span><span>בריאות: {fmt(e.ht)}</span>
            <span>פנסיה(ע): {fmt(e.penE)}</span><span>פנסיה(מ): {fmt(e.penR)}</span><span>פיצויים: {fmt(e.sev)}</span>
          </div>
        </div>)}
      </div>}

      {tab==="att"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700}}>⏰ נוכחות — {todayKey}</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>bulkAttendance("present")} style={cs.btn("#22c55e")}>✅ כולם נוכחים</button>
            <button onClick={()=>bulkAttendance("absent")} style={cs.btn("#ef4444")}>❌ כולם נעדרים</button>
          </div>
        </div>
        {employees.filter(e=>e.active!==false).map(e=>{
          const rec=attendance.find(a=>a.empId===e.id&&a.date===todayKey);
          const st=rec?.status;
          return <div key={e.id} style={{...cs.card,display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0"}}>{e.name}</div>
              {st&&<div style={{fontSize:11,color:st==="present"?"#22c55e":st==="absent"?"#ef4444":"#f59e0b"}}>{st==="present"?"נוכח":"absent"===st?"נעדר":st==="sick"?"מחלה":st==="vacation"?"חופשה":st==="partial"?"חלקי":st==="reserve"?"מילואים":st} {rec?.hoursWorked?`• ${rec.hoursWorked} שעות`:""}</div>}
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {[["present","נוכח","#22c55e"],["absent","נעדר","#ef4444"],["sick","מחלה","#f59e0b"],["vacation","חופש","#3b82f6"],["reserve","מילואים","#a855f7"],["partial","חלקי","#64748b"]].map(([s,l,c])=>
                <button key={s} onClick={()=>{
                  if(s==="partial"){setForm({empId:e.id,status:s,hours:"4"});setModal("hours");}
                  else clockAction(e.id,s,s==="absent"?0:8.5);
                }} style={{...cs.btn(st===s?c:"transparent",st===s?"#fff":c),border:`1px solid ${c}44`,padding:"4px 10px",fontSize:11}}>{l}</button>
              )}
            </div>
          </div>;
        })}
      </div>}

      {tab==="sub"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700}}>🔧 קבלני משנה ({subs.filter(s=>s.active!==false).length})</div>
          <button onClick={()=>{setForm({hasVAT:true,taxRate:"0.20"});setModal("sub");}} style={cs.btn("#a855f7")}>+ הוסף קבלן</button>
        </div>
        {subCalcs.map(s=><div key={s.id} style={cs.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <span style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{s.name}</span>
              {s.service&&<span style={{fontSize:11,color:"#4a5578",marginRight:8}}>{s.service}</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <Badge color="#a855f7">{s.activeJobs.length} פעילות</Badge>
              <Badge color="#22c55e">{s.completedJobs.length} הושלמו</Badge>
              <button onClick={()=>{setForm(s);setModal("sub");}} style={{background:"none",border:"none",color:"#3b82f6",cursor:"pointer"}}>✏️</button>
            </div>
          </div>
          <div style={cs.grid("repeat(auto-fit,minmax(110px,1fr))")}>
            <Metric label="חשבוניות החודש" value={fmt(s.totalBilled)} color="#f59e0b"/>
            <Metric label="מע״מ" value={fmt(s.vat)} color="#64748b"/>
            <Metric label="ניכוי מס" value={fmt(s.withhold)} color="#ef4444"/>
            <Metric label="לתשלום" value={fmt(s.toPay)} color="#22c55e"/>
          </div>
          {s.anomalies.map((a,i)=><div key={i} style={{marginTop:6,fontSize:11,color:"#f59e0b"}}>⚠️ {a.msg}</div>)}
        </div>)}
      </div>}

      {tab==="jobs"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700}}>🏗️ התקנות ועבודות</div>
          <button onClick={()=>{setForm({status:"active",amount:"",date:today()});setModal("job");}} style={cs.btn("#f59e0b","#080b14")}>+ התקנה חדשה</button>
        </div>
        {activeJobs.length>0&&<div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:"#22c55e",marginBottom:8}}>🟢 פעילות ({activeJobs.length})</div>
          {activeJobs.map(j=>{const sub=subs.find(s=>s.id===j.subId);return <div key={j.id} style={{...cs.card,display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600}}>{j.description}</div>
              <div style={{fontSize:11,color:"#4a5578"}}>{sub?.name} • {j.address||""} • {fmt(j.amount)}</div>
            </div>
            <button onClick={()=>completeJob(j.id)} style={cs.btn("#22c55e")}>✅ הושלם</button>
          </div>;})}
        </div>}
        {jobs.filter(j=>j.status==="completed").length>0&&<div>
          <div style={{fontSize:13,fontWeight:700,color:"#64748b",marginBottom:8}}>✅ הושלמו</div>
          {jobs.filter(j=>j.status==="completed").slice(0,10).map(j=>{const sub=subs.find(s=>s.id===j.subId);return <div key={j.id} style={{...cs.row,fontSize:12}}>
            <span>{j.description}</span><span style={{color:"#4a5578"}}>{sub?.name}</span><span style={{color:"#22c55e",fontWeight:700}}>{fmt(j.amount)}</span>
          </div>;})}
        </div>}
      </div>}

      {tab==="run"&&<div>
        <div style={cs.cardGlow("#f59e0b")}>
          <div style={{fontSize:18,fontWeight:800,color:"#f59e0b",marginBottom:8}}>▶️ הרצת שכר — {MO[month]} {year}</div>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:16}}>
            המערכת תחשב אוטומטית את כל השכר על בסיס: נוכחות בפועל, שעות נוספות, מחלה/חופש, התקנות שהושלמו, וניכויי מס.
          </div>
          <div style={{...cs.grid("1fr 1fr 1fr"),marginBottom:16}}>
            <Metric label="עובדים לחישוב" value={empCalcs.length} color="#3b82f6"/>
            <Metric label="קבלנים לחישוב" value={subCalcs.length} color="#a855f7"/>
            <Metric label="צפי עלות כוללת" value={fmt(empCalcs.reduce((a,e)=>a+e.erCost,0)+subCalcs.reduce((a,s)=>a+s.toPay,0))} color="#f59e0b"/>
          </div>
          {allAnomalies.length>0&&<div style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:10,padding:10,marginBottom:12}}>
            <div style={{fontSize:12,color:"#ef4444",fontWeight:700}}>⚠️ {allAnomalies.length} התראות — בדוק לפני הרצה:</div>
            {allAnomalies.map((a,i)=><div key={i} style={{fontSize:11,color:"#f87171",marginTop:4}}>{a.name}: {a.msg}</div>)}
          </div>}
          <button onClick={runPayroll} style={{...cs.btn("#f59e0b","#080b14"),width:"100%",padding:"14px",fontSize:16,borderRadius:12}}>⚡ הרץ חישוב שכר אוטומטי</button>
        </div>
      </div>}

      {tab==="slips"&&<div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:12}}>📄 תלושי שכר</div>
        {runResult?<div>
          <div style={{...cs.card,borderColor:"#f59e0b33"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#f59e0b",marginBottom:8}}>📊 סיכום — {MO[runResult.month]} {runResult.year}</div>
            <div style={cs.grid("repeat(auto-fit,minmax(120px,1fr))")}>
              <Metric label="ברוטו עובדים" value={fmt(runResult.totals.empGross)} color="#f59e0b"/>
              <Metric label="נטו עובדים" value={fmt(runResult.totals.empNet)} color="#22c55e"/>
              <Metric label="עלות מעסיק" value={fmt(runResult.totals.empErCost)} color="#3b82f6"/>
              <Metric label="קבלנים" value={fmt(runResult.totals.subPay)} color="#a855f7"/>
              <Metric label="סה״כ" value={fmt(runResult.totals.grandTotal)} color="#f59e0b"/>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,marginTop:12}}>👷 תלושי עובדים</div>
          {runResult.employees.map(e=><div key={e.id} onClick={()=>setSelectedSlip(selectedSlip===e.id?null:e.id)} style={{...cs.card,cursor:"pointer",borderColor:selectedSlip===e.id?"#f59e0b44":"#1a2035"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:700}}>{e.name}</span>
              <div style={{display:"flex",gap:12}}>
                <span style={{color:"#f59e0b"}}>ברוטו {fmt(e.gross)}</span>
                <span style={{color:"#22c55e",fontWeight:800}}>נטו {fmt(e.net)}</span>
              </div>
            </div>
            {selectedSlip===e.id&&<div style={{marginTop:12,borderTop:"1px solid #1a2035",paddingTop:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:6}}>פירוט הכנסות</div>
              {[["שכר בסיס",e.basePay],["שעות נוספות",e.otPay],["מחלה",e.sickPay],["חופשה",e.vacPay],["מילואים",e.reservePay],["הוצאות נסיעה",e.transport],["בונוס",e.bonus]].filter(([,v])=>v>0).map(([l,v])=><div key={l} style={cs.row}><span style={{fontSize:12,color:"#94a3b8"}}>{l}</span><span style={{fontSize:13,fontWeight:600}}>{fmtD(v)}</span></div>)}
              <div style={{fontSize:12,fontWeight:700,color:"#ef4444",marginTop:8,marginBottom:4}}>ניכויים</div>
              {[["מס הכנסה",e.tax],["ביטוח לאומי",e.bl],["מס בריאות",e.ht],["פנסיה עובד",e.penE]].map(([l,v])=><div key={l} style={cs.row}><span style={{fontSize:12,color:"#94a3b8"}}>{l}</span><span style={{fontSize:13,fontWeight:600,color:"#ef4444"}}>-{fmtD(v)}</span></div>)}
              <div style={{fontSize:12,fontWeight:700,color:"#3b82f6",marginTop:8,marginBottom:4}}>עלות מעסיק</div>
              {[["פנסיה מעסיק",e.penR],["פיצויים",e.sev]].map(([l,v])=><div key={l} style={cs.row}><span style={{fontSize:12,color:"#94a3b8"}}>{l}</span><span style={{fontSize:13,fontWeight:600,color:"#3b82f6"}}>{fmtD(v)}</span></div>)}
              <div style={{...cs.row,marginTop:6,borderTop:"2px solid #f59e0b33"}}><span style={{fontSize:13,fontWeight:800,color:"#f59e0b"}}>עלות מעסיק כוללת</span><span style={{fontSize:15,fontWeight:900,color:"#f59e0b"}}>{fmt(e.erCost)}</span></div>
              <div style={{marginTop:8,fontSize:11,color:"#4a5578"}}>{e.daysWorked} ימי עבודה • {(e.totalOT125+e.totalOT150+e.totalOT200).toFixed(1)} שעות נוספות • יעילות {e.efficiency}%</div>
            </div>}
          </div>)}
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,marginTop:12}}>🔧 קבלני משנה</div>
          {runResult.subs.map(s=><div key={s.id} style={cs.card}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:700}}>{s.name}</span>
              <span style={{color:"#22c55e",fontWeight:800}}>לתשלום {fmt(s.toPay)}</span>
            </div>
            <div style={{fontSize:11,color:"#4a5578",marginTop:4}}>חשבוניות: {fmt(s.totalBilled)} • מע״מ: {fmt(s.vat)} • ניכוי מס: {fmt(s.withhold)} • {s.completedJobs.length} התקנות</div>
          </div>)}
        </div>
        :<div style={cs.card}><div style={{textAlign:"center",color:"#4a5578",padding:20}}>הרץ שכר קודם בלשונית ▶️</div></div>}
      </div>}

      {tab==="log"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700}}>📋 לוג אירועים</div>
          <button onClick={async()=>{setEventLog([]);await save(KEYS.log,[]);}} style={cs.btn("#1e2a42","#ef4444")}>נקה</button>
        </div>
        {eventLog.length===0?<div style={{...cs.card,textAlign:"center",color:"#4a5578"}}>אין אירועים</div>
        :eventLog.map(e=><div key={e.id} style={{...cs.row,fontSize:12}}>
          <span style={{color:"#4a5578",fontSize:11,width:65,flexShrink:0}}>{new Date(e.time).toLocaleString("he-IL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
          <span style={{color:"#f59e0b",fontWeight:700,width:120,flexShrink:0}}>{e.action}</span>
          <span style={{color:"#94a3b8"}}>{e.detail}</span>
        </div>)}
      </div>}

      </div>

      {modal&&<div style={cs.overlay} onClick={()=>setModal(null)}>
        <div style={cs.modal} onClick={e=>e.stopPropagation()}>

          {modal==="emp"&&<div>
            <div style={{fontSize:16,fontWeight:800,color:"#f59e0b",marginBottom:14}}>{form.id?"✏️ עריכת עובד":"👷 עובד חדש"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="שם מלא"><input style={cs.input} value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
              <Field label="תפקיד"><input style={cs.input} value={form.role||""} onChange={e=>setForm({...form,role:e.target.value})}/></Field>
              <Field label="ת.ז."><input style={cs.input} value={form.idNumber||""} onChange={e=>setForm({...form,idNumber:e.target.value})}/></Field>
              <Field label="טלפון"><input style={cs.input} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
              <Field label="שכר בסיס ₪"><input type="number" style={cs.input} value={form.baseSalary||""} onChange={e=>setForm({...form,baseSalary:e.target.value})}/></Field>
              <Field label="נקודות זיכוי"><input type="number" step="0.25" style={cs.input} value={form.creditPoints||"2.25"} onChange={e=>setForm({...form,creditPoints:e.target.value})}/></Field>
              <Field label="הוצאות נסיעה/יום"><input type="number" style={cs.input} value={form.transport||"0"} onChange={e=>setForm({...form,transport:e.target.value})}/></Field>
              <Field label="בונוס חודשי"><input type="number" style={cs.input} value={form.bonus||"0"} onChange={e=>setForm({...form,bonus:e.target.value})}/></Field>
              <Field label="בנק"><input style={cs.input} value={form.bankName||""} onChange={e=>setForm({...form,bankName:e.target.value})}/></Field>
              <Field label="סניף"><input style={cs.input} value={form.bankBranch||""} onChange={e=>setForm({...form,bankBranch:e.target.value})}/></Field>
              <Field label="חשבון"><input style={cs.input} value={form.bankAccount||""} onChange={e=>setForm({...form,bankAccount:e.target.value})}/></Field>
              <Field label="תאריך תחילה"><input type="date" style={cs.input} value={form.startDate||""} onChange={e=>setForm({...form,startDate:e.target.value})}/></Field>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0"}}><input type="checkbox" checked={form.hasPension!==false} onChange={e=>setForm({...form,hasPension:e.target.checked})}/><label style={{fontSize:13}}>פנסיה</label></div>
            <button onClick={()=>{const d={...form,baseSalary:+form.baseSalary||0,creditPoints:+form.creditPoints||2.25,transport:+form.transport||0,bonus:+form.bonus||0,overtime:+form.overtime||0,hasPension:form.hasPension!==false};saveEmployee(d);}} style={{...cs.btn("#f59e0b","#080b14"),width:"100%",padding:12,marginTop:8}}>💾 שמור</button>
          </div>}

          {modal==="sub"&&<div>
            <div style={{fontSize:16,fontWeight:800,color:"#a855f7",marginBottom:14}}>{form.id?"✏️ עריכת קבלן":"🔧 קבלן חדש"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Field label="שם"><input style={cs.input} value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
              <Field label="תחום שירות"><input style={cs.input} value={form.service||""} onChange={e=>setForm({...form,service:e.target.value})}/></Field>
              <Field label="ח.פ / ת.ז."><input style={cs.input} value={form.idNumber||""} onChange={e=>setForm({...form,idNumber:e.target.value})}/></Field>
              <Field label="טלפון"><input style={cs.input} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
              <Field label="ניכוי מס במקור">
                <select style={cs.select} value={form.taxRate||"0.20"} onChange={e=>setForm({...form,taxRate:e.target.value})}>
                  <option value="0">0% — פטור מלא</option>
                  <option value="0.05">5%</option>
                  <option value="0.10">10%</option>
                  <option value="0.15">15%</option>
                  <option value="0.20">20%</option>
                  <option value="0.30">30%</option>
                  <option value="0.47">47% — ללא אישור</option>
                </select>
              </Field>
              <Field label="בנק"><input style={cs.input} value={form.bankName||""} onChange={e=>setForm({...form,bankName:e.target.value})}/></Field>
              <Field label="סניף"><input style={cs.input} value={form.bankBranch||""} onChange={e=>setForm({...form,bankBranch:e.target.value})}/></Field>
              <Field label="חשבון"><input style={cs.input} value={form.bankAccount||""} onChange={e=>setForm({...form,bankAccount:e.target.value})}/></Field>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0"}}><input type="checkbox" checked={form.hasVAT!==false} onChange={e=>setForm({...form,hasVAT:e.target.checked})}/><label style={{fontSize:13}}>עוסק מורשה (מע״מ)</label></div>
            <button onClick={()=>{const d={...form,taxRate:+form.taxRate||0.2,hasVAT:form.hasVAT!==false};saveSub(d);}} style={{...cs.btn("#a855f7"),width:"100%",padding:12,marginTop:8}}>💾 שמור</button>
          </div>}

          {modal==="job"&&<div>
            <div style={{fontSize:16,fontWeight:800,color:"#f59e0b",marginBottom:14}}>🏗️ התקנה חדשה</div>
            <Field label="קבלן">
              <select style={cs.select} value={form.subId||""} onChange={e=>setForm({...form,subId:e.target.value})}>
                <option value="">בחר קבלן...</option>
                {subs.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="תיאור עבודה"><input style={cs.input} value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
            <Field label="כתובת / אתר"><input style={cs.input} value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})}/></Field>
            <Field label="סכום ₪"><input type="number" style={cs.input} value={form.amount||""} onChange={e=>setForm({...form,amount:e.target.value})}/></Field>
            <Field label="תאריך"><input type="date" style={cs.input} value={form.date||today()} onChange={e=>setForm({...form,date:e.target.value})}/></Field>
            <button onClick={()=>{if(!form.subId||!form.amount)return;saveJob({...form,amount:+form.amount,status:"active"});}} style={{...cs.btn("#f59e0b","#080b14"),width:"100%",padding:12,marginTop:8}}>🏗️ צור התקנה</button>
          </div>}

          {modal==="hours"&&<div>
            <div style={{fontSize:16,fontWeight:800,color:"#64748b",marginBottom:14}}>⏰ שעות חלקיות</div>
            <Field label="שעות עבודה"><input type="number" step="0.5" style={cs.input} value={form.hours||""} onChange={e=>setForm({...form,hours:e.target.value})}/></Field>
            <button onClick={()=>{clockAction(form.empId,"partial",+form.hours||0);setModal(null);}} style={{...cs.btn("#64748b"),width:"100%",padding:12,marginTop:8}}>שמור</button>
          </div>}

        </div>
      </div>}

      {toast&&<div style={cs.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}
