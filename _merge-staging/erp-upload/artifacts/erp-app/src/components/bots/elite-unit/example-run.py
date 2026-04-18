#!/usr/bin/env python3
"""
Quick example: Run Elite Dev Unit pipeline for CRM Lead module
"""

import os
import sys
from orchestrator_v2 import DevUnitOrchestrator

def main():
    # Ensure API key is set
    if not os.environ.get("OPENAI_API_KEY"):
        print("❌ Error: OPENAI_API_KEY environment variable not set")
        print("   Run: export OPENAI_API_KEY='sk-...'")
        return 1
    
    orchestrator = DevUnitOrchestrator(org="HiTech")
    
    feature_request = """
    לבנות מודול CRM לניהול לידים עם:
    - קליטת לידים: טופס web + import CSV
    - ניהול סטטוסים: חדש → זוקף → התלקח → סגור
    - תזכורות אוטומטיות: "בדוק lead כל 3 ימים"
    - שיוך לסוכן מכירות + משימות
    - דוחות: lead funnel, conversion rate, top performers
    - עיצוב: תכנית 4 שבועות, MVP ראשון
    """
    
    result = orchestrator.process_feature(feature_request.strip())
    orchestrator.export_report(result["run_id"], "lead_crm_run.json")
    
    print(f"\n✨ Success!")
    print(f"📁 Output file: lead_crm_run.json")
    print(f"\nTo view results:")
    print(f"  python3 -m json.tool lead_crm_run.json | less")
    
    return 0

if __name__ == "__main__":
    raise SystemExit(main())