"""
Orchestrator - מנהל המחלקה העלית
מריץ צינור פיתוח 24/7, מזמן סוכנים, משלב החלטות
"""

import json
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional
from agents import (
    CTOAgent, ArchitectAgent, BackendAgent, DevOpsAgent,
    QAAgent, SecurityAgent, ProductAgent
)
from schemas import (
    TaskType, Status, EliteSquadSummary, Severity
)

# ============================================
# Orchestrator
# ============================================

class EliteUnitOrchestrator:
    """מנהל מרכזי של המחלקה העלית"""
    
    def __init__(self, company_name: str = "HiTech", timezone: str = "UTC"):
        self.company_name = company_name
        self.timezone = timezone
        self.task_queue: Dict[str, Dict[str, Any]] = {}
        self.completed_tasks: List[Dict[str, Any]] = []
        self.active_agents = {
            "cto": CTOAgent(),
            "architect": ArchitectAgent(),
            "backend": BackendAgent(),
            "devops": DevOpsAgent(),
            "qa": QAAgent(),
            "security": SecurityAgent(),
            "product": ProductAgent(),
        }
        self.squad_assignments = {
            "crm": ["backend", "product", "qa"],
            "erp": ["backend", "architect", "security"],
            "automation": ["backend", "product"],
            "internal_tools": ["backend", "devops"],
            "infrastructure": ["devops", "architect"],
            "security": ["security", "architect"],
        }
    
    def submit_task(self, task_data: Dict[str, Any]) -> str:
        """הגשת משימה חדשה לתהליך"""
        task_id = f"TASK-{uuid.uuid4().hex[:8].upper()}"
        
        task_data["id"] = task_id
        task_data["created_at"] = datetime.utcnow().isoformat()
        task_data["status"] = "pending"
        
        self.task_queue[task_id] = task_data
        print(f"✅ Task submitted: {task_id}")
        return task_id
    
    def process_task(self, task_id: str, squad: str = "crm") -> EliteSquadSummary:
        """עיבוד משימה דרך הסוכנים"""
        
        if task_id not in self.task_queue:
            raise ValueError(f"Task {task_id} not found")
        
        task_data = self.task_queue[task_id]
        task_data["status"] = "in_progress"
        
        print(f"\n🚀 Processing task {task_id} in {squad.upper()} Squad")
        print("=" * 60)
        
        # קריאה לסוכנים לפי Squad
        agents_to_call = self.squad_assignments.get(squad, ["backend", "qa"])
        results = {}
        total_hours = 0
        all_risks = []
        
        for agent_name in agents_to_call:
            if agent_name not in self.active_agents:
                continue
            
            agent = self.active_agents[agent_name]
            print(f"\n📋 Consulting {agent_name.upper()}...")
            
            try:
                analysis = agent.analyze(task_data)
                results[agent_name] = analysis.to_dict()
                
                # חילוץ מדדים
                if hasattr(analysis, 'estimated_hours'):
                    total_hours += analysis.estimated_hours
                if hasattr(analysis, 'risks'):
                    all_risks.extend(analysis.risks)
                
                print(f"   ✓ {agent_name} analysis complete")
            except Exception as e:
                print(f"   ✗ Error: {str(e)}")
        
        # CTO Decision (תמיד כולל)
        print(f"\n📊 CTO Decision...")
        cto_decision = self.active_agents["cto"].analyze(task_data)
        results["cto"] = cto_decision.to_dict()
        
        if hasattr(cto_decision, 'blockers'):
            all_risks.extend(cto_decision.blockers)
        
        # בנייה של סיכום תאום
        summary = EliteSquadSummary(
            task_id=task_id,
            task_type=TaskType(task_data.get("type", "feature")),
            overall_status=Status.IN_PROGRESS,
            timeline_days=total_hours / 8,  # הנחה: 8 שעות עבודה ביום
            total_effort_hours=total_hours,
            critical_risks=all_risks[:5],  # הסיכונים הקריטיים ביותר
            dependencies_on_other_squads=self._extract_dependencies(results),
            go_no_go_decision=cto_decision.approval_status,
            next_steps=self._generate_next_steps(results),
            responsible_squad=squad.upper()
        )
        
        task_data["status"] = "completed"
        task_data["summary"] = summary.to_dict()
        task_data["agent_results"] = results
        
        self.completed_tasks.append(task_data)
        del self.task_queue[task_id]
        
        print(f"\n✅ Task {task_id} analysis complete!")
        print(f"   Total Effort: {total_hours}h ({summary.timeline_days:.1f} days)")
        print(f"   Go/No-Go: {'✓ GO' if summary.go_no_go_decision else '✗ NO-GO'}")
        print("=" * 60)
        
        return summary
    
    def _extract_dependencies(self, results: Dict[str, Dict]) -> List[str]:
        """חילוץ תלויות בין squads"""
        dependencies = []
        
        # מ-architect
        if "architect" in results and "dependencies" in results["architect"]:
            dependencies.extend(results["architect"]["dependencies"][:3])
        
        return dependencies
    
    def _generate_next_steps(self, results: Dict[str, Dict]) -> List[str]:
        """יצור צעדים הבאים"""
        next_steps = []
        
        if results.get("cto", {}).get("approval_status"):
            next_steps.append("Proceed to development")
            next_steps.append("Schedule stand-up meeting")
            next_steps.append("Create feature branch")
        else:
            next_steps.append("Review blockers with CTO")
            next_steps.append("Refine requirements")
        
        if results.get("architect"):
            next_steps.append("Architect review session")
        
        if results.get("security"):
            if results.get("security", {}).get("security_score", 0) < 7:
                next_steps.append("Security hardening required")
        
        return next_steps[:5]
    
    def generate_report(self, task_id: Optional[str] = None) -> Dict[str, Any]:
        """דוח כולל על משימות"""
        if task_id:
            tasks = [t for t in self.completed_tasks if t["id"] == task_id]
        else:
            tasks = self.completed_tasks[-10:]  # 10 משימות אחרונות
        
        report = {
            "company": self.company_name,
            "generated_at": datetime.utcnow().isoformat(),
            "tasks_completed": len(tasks),
            "total_effort_hours": sum(t.get("summary", {}).get("total_effort_hours", 0) for t in tasks),
            "avg_timeline_days": sum(t.get("summary", {}).get("timeline_days", 0) for t in tasks) / len(tasks) if tasks else 0,
            "go_go_ratio": sum(1 for t in tasks if t.get("summary", {}).get("go_no_go_decision")) / len(tasks) if tasks else 0,
            "tasks": [
                {
                    "id": t["id"],
                    "description": t.get("description"),
                    "squad": t.get("summary", {}).get("responsible_squad"),
                    "status": t["status"],
                    "effort_hours": t.get("summary", {}).get("total_effort_hours"),
                    "risks": t.get("summary", {}).get("critical_risks", [])
                }
                for t in tasks
            ]
        }
        return report
    
    def daily_standby_sync(self) -> Dict[str, Any]:
        """סינכרון יומי (Follow The Sun)"""
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "pending_tasks": len(self.task_queue),
            "completed_today": len(self.completed_tasks),
            "next_zone": self._get_next_timezone(),
            "active_squads": list(self.squad_assignments.keys()),
            "health_status": "🟢 OPERATIONAL"
        }
    
    def _get_next_timezone(self) -> str:
        """איזו אזור הבא לפי Follow The Sun"""
        zones = ["Israel/Europe", "Europe/Americas", "Americas/Asia", "Asia/Israel"]
        # simplified - בפועל צריך להתחשב בשעות אמיתיות
        return zones[0]

# ============================================
# Example Usage
# ============================================

if __name__ == "__main__":
    orchestrator = EliteUnitOrchestrator(company_name="HiTech Elite Unit")
    
    # דוגמה: הגשת משימות
    task1 = orchestrator.submit_task({
        "description": "AI-powered customer recommendation engine for CRM",
        "type": "feature",
        "deadline": "2026-03-01",
        "performance_requirements": "< 200ms response time",
        "expected_scale": "1M+ users",
        "data_type": "customer behavioral"
    })
    
    # עיבוד המשימה דרך CRM Squad
    summary = orchestrator.process_task(task1, squad="crm")
    
    # דוח
    report = orchestrator.generate_report(task1)
    print("\n📊 Final Report:")
    print(json.dumps(report, indent=2, ensure_ascii=False))