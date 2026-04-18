#!/usr/bin/env python3
"""
Control Center Agent - מרכז הפיקוח של כל 30 הסוכנים
ניטור בזמן אמת, אזעקות, מטרות ופעילויות
דומה למערכת פיקוח וקרטל של צה"ל
"""

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, Any, List
from dataclasses import dataclass, asdict

@dataclass
class AgentStatus:
    """סטטוס של סוכן"""
    agent_id: str
    agent_name: str
    department: str
    status: str  # active, idle, executing, error, offline
    current_task: str
    progress: int  # 0-100
    last_update: str
    cpu_usage: float
    memory_usage: float
    tasks_completed: int
    errors_count: int

class ControlCenterAgent:
    """סוכן בקרה וניטור מרכזי"""
    
    def __init__(self):
        self.agents_status: Dict[str, AgentStatus] = {}
        self.alerts: List[Dict[str, Any]] = []
        self.execution_log: List[str] = []
        self._init_agents()
    
    def _init_agents(self):
        """אתחול מעקב כל 30 הסוכנים"""
        from agents_enterprise import ALL_AGENTS
        
        for agent_id, agent in ALL_AGENTS.items():
            self.agents_status[agent_id] = AgentStatus(
                agent_id=agent_id,
                agent_name=agent.role,
                department=agent.department,
                status="idle",
                current_task="",
                progress=0,
                last_update=datetime.utcnow().isoformat(),
                cpu_usage=0.0,
                memory_usage=0.0,
                tasks_completed=0,
                errors_count=0,
            )
    
    def update_agent_status(self, agent_id: str, **kwargs):
        """עדכן סטטוס סוכן"""
        if agent_id not in self.agents_status:
            return
        
        status = self.agents_status[agent_id]
        for key, value in kwargs.items():
            if hasattr(status, key):
                setattr(status, key, value)
        
        status.last_update = datetime.utcnow().isoformat()
        self._log(f"📍 {status.agent_name}: {status.status.upper()}")
    
    def get_department_summary(self, dept: str) -> Dict[str, Any]:
        """קבל סיכום מחלקה"""
        agents = [s for s in self.agents_status.values() if s.department == dept]
        
        return {
            "department": dept,
            "total_agents": len(agents),
            "active": sum(1 for a in agents if a.status == "active"),
            "idle": sum(1 for a in agents if a.status == "idle"),
            "executing": sum(1 for a in agents if a.status == "executing"),
            "errors": sum(1 for a in agents if a.status == "error"),
            "total_tasks_completed": sum(a.tasks_completed for a in agents),
            "total_errors": sum(a.errors_count for a in agents),
            "avg_cpu": sum(a.cpu_usage for a in agents) / len(agents) if agents else 0,
            "avg_memory": sum(a.memory_usage for a in agents) / len(agents) if agents else 0,
        }
    
    def get_system_health(self) -> Dict[str, Any]:
        """בדוק בריאות המערכת"""
        all_statuses = list(self.agents_status.values())
        
        active_agents = sum(1 for s in all_statuses if s.status in ["active", "executing"])
        error_agents = sum(1 for s in all_statuses if s.status == "error")
        health_percentage = (len(all_statuses) - error_agents) / len(all_statuses) * 100
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_agents": len(all_statuses),
            "active_agents": active_agents,
            "error_agents": error_agents,
            "health_percentage": health_percentage,
            "avg_cpu_usage": sum(s.cpu_usage for s in all_statuses) / len(all_statuses),
            "avg_memory_usage": sum(s.memory_usage for s in all_statuses) / len(all_statuses),
            "status": self._assess_health(health_percentage),
        }
    
    def _assess_health(self, percentage: float) -> str:
        """הערך בריאות"""
        if percentage >= 95:
            return "🟢 מעולה"
        elif percentage >= 85:
            return "🟡 טוב"
        elif percentage >= 70:
            return "🟠 בערעור"
        else:
            return "🔴 קריטי"
    
    def create_alert(self, severity: str, agent_id: str, message: str):
        """צור אזעקה"""
        alert = {
            "timestamp": datetime.utcnow().isoformat(),
            "severity": severity,  # critical, warning, info
            "agent_id": agent_id,
            "agent_name": self.agents_status[agent_id].agent_name if agent_id in self.agents_status else "Unknown",
            "message": message,
        }
        self.alerts.append(alert)
        
        # הודפס באדום אם קריטי
        if severity == "critical":
            self._log(f"🚨 אזעקה קריטית: {message}")
        elif severity == "warning":
            self._log(f"⚠️  הזהרה: {message}")
        else:
            self._log(f"ℹ️  {message}")
    
    def get_recent_alerts(self, limit: int = 10, severity_filter: str = None) -> List[Dict]:
        """קבל אזעקות אחרונות"""
        alerts = self.alerts[-limit:]
        if severity_filter:
            alerts = [a for a in alerts if a["severity"] == severity_filter]
        return list(reversed(alerts))
    
    def monitor_loop(self, interval_seconds: int = 30):
        """לולאת ניטור רציפה"""
        print("\n🎯 מרכז הפיקוח הופעל - ניטור בזמן אמת")
        print("=" * 70)
        
        iteration = 0
        while True:
            iteration += 1
            self._print_status_dashboard(iteration)
            
            # בדוק בעיות
            self._check_for_issues()
            
            import time
            time.sleep(interval_seconds)
    
    def _print_status_dashboard(self, iteration: int):
        """הדפס דשבורד סטטוס"""
        health = self.get_system_health()
        
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] סיבוב ניטור #{iteration}")
        print("=" * 70)
        print(f"בריאות המערכת: {health['status']} ({health['health_percentage']:.0f}%)")
        print(f"סוכנים פעילים: {health['active_agents']}/{health['total_agents']}")
        print(f"סוכנים בשגיאה: {health['error_agents']}")
        print(f"צריכת CPU: {health['avg_cpu_usage']:.1f}% | זיכרון: {health['avg_memory_usage']:.1f}%")
        
        print("\n📊 סיכום לפי מחלקה:")
        print("-" * 70)
        
        for dept in ["dev", "qa", "infra", "security"]:
            summary = self.get_department_summary(dept)
            dept_names = {
                "dev": "🔧 פיתוח",
                "qa": "✅ בדיקות",
                "infra": "⚙️ תשתיות",
                "security": "🔐 אבטחה",
            }
            print(f"{dept_names[dept]:.<25} {summary['active']} פעילים | "
                  f"{summary['total_tasks_completed']} משימות | "
                  f"{summary['total_errors']} שגיאות")
        
        # אזעקות אחרונות
        recent = self.get_recent_alerts(limit=5)
        if recent:
            print("\n🚨 אזעקות אחרונות:")
            for alert in recent:
                emoji = "🔴" if alert["severity"] == "critical" else "⚠️" if alert["severity"] == "warning" else "ℹ️"
                print(f"  {emoji} {alert['agent_name']}: {alert['message']}")
    
    def _check_for_issues(self):
        """בדוק בעיות"""
        for agent_id, status in self.agents_status.items():
            # בדוק אם סוכן התמד יותר מ-30 דקות
            last_update = datetime.fromisoformat(status.last_update)
            if datetime.utcnow() - last_update > timedelta(minutes=30):
                self.create_alert("warning", agent_id, 
                    f"סוכן {status.agent_name} לא התעדכן במשך 30 דקות")
            
            # בדוק CPU גבוה
            if status.cpu_usage > 80:
                self.create_alert("warning", agent_id,
                    f"צריכת CPU גבוהה: {status.cpu_usage:.1f}%")
            
            # בדוק שגיאות
            if status.errors_count > 5:
                self.create_alert("critical", agent_id,
                    f"סוכן בעיות: {status.errors_count} שגיאות")
    
    def _log(self, message: str):
        """תעד להיסטוריה"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.execution_log.append(log_entry)
        if len(self.execution_log) > 1000:
            self.execution_log = self.execution_log[-500:]
    
    def get_execution_log(self, last_n: int = 50) -> List[str]:
        """קבל להיסטוריה"""
        return self.execution_log[-last_n:]
    
    def export_status_json(self) -> str:
        """ייצא סטטוס כ-JSON"""
        return json.dumps({
            "timestamp": datetime.utcnow().isoformat(),
            "health": self.get_system_health(),
            "agents": {
                agent_id: asdict(status) 
                for agent_id, status in self.agents_status.items()
            },
            "recent_alerts": self.get_recent_alerts(limit=20),
            "departments": {
                dept: self.get_department_summary(dept)
                for dept in ["dev", "qa", "infra", "security"]
            },
        }, indent=2, ensure_ascii=False)

def demo_control_center():
    """ערכון דמו"""
    import random
    
    control = ControlCenterAgent()
    
    # סימולציה: עדכן סטטוסים אקראיים
    agent_ids = list(control.agents_status.keys())
    for agent_id in agent_ids[:5]:
        control.update_agent_status(
            agent_id,
            status="executing",
            current_task="פיתוח תכונה חדשה",
            progress=random.randint(10, 90),
            cpu_usage=random.uniform(20, 60),
        )
    
    for agent_id in agent_ids[5:8]:
        control.update_agent_status(
            agent_id,
            status="idle",
        )
    
    # צור כמה אזעקות
    control.create_alert("info", agent_ids[0], "התחיל עיבוד משימה חדשה")
    control.create_alert("warning", agent_ids[3], "CPU גבוה זמנית")
    control.create_alert("info", agent_ids[1], "השלים משימה בהצלחה")
    
    # הדפס דשבורד
    control._print_status_dashboard(1)
    
    # ייצא JSON
    print("\n📊 סטטוס JSON:")
    print(control.export_status_json()[:500] + "...")

if __name__ == "__main__":
    demo_control_center()