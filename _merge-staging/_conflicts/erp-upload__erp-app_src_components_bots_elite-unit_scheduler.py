#!/usr/bin/env python3
"""
Scheduler for recurring Elite Dev Unit operations
- Daily/weekly company updates
- Performance analysis
- Health checks
"""

import time
import schedule
import argparse
from datetime import datetime
from typing import Callable, Optional

from worker import enqueue, STACK

class Scheduler:
    """Task scheduler"""
    
    def __init__(self):
        self.jobs = []
    
    def add_job(
        self,
        func: Callable,
        interval: int,
        unit: str,  # 'seconds', 'minutes', 'hours', 'days', 'weeks'
        name: str,
        at_time: Optional[str] = None,  # HH:MM for daily/weekly
    ):
        """Schedule a job"""
        job = getattr(schedule.every(interval), unit)
        if at_time:
            job = job.at(at_time)
        
        job.do(func)
        self.jobs.append((name, job))
        print(f"📅 Scheduled: {name} every {interval} {unit}")
        if at_time:
            print(f"   at {at_time}")
    
    def run_loop(self, poll_seconds: int = 60):
        """Main scheduler loop"""
        print(f"\n🚀 Scheduler Started")
        print(f"   Poll interval: {poll_seconds}s")
        print(f"   Jobs: {len(self.jobs)}")
        print("=" * 70)
        
        while True:
            schedule.run_pending()
            time.sleep(poll_seconds)

def enqueue_company_update():
    """Enqueue company update generation"""
    print(f"[{datetime.utcnow().isoformat()}] 📢 Generating company update...")
    
    enqueue(
        "company_update",
        {
            "request": "Generate weekly company development update summarizing all completed features, bug fixes, infrastructure improvements, and performance optimizations. Include metrics and impact assessment."
        },
        stack=STACK
    )

def enqueue_performance_analysis():
    """Enqueue performance analysis"""
    print(f"[{datetime.utcnow().isoformat()}] ⚡ Running performance analysis...")
    
    enqueue(
        "infrastructure",
        {
            "request": "Analyze system performance metrics, identify bottlenecks, recommend optimizations. Review database queries, API response times, memory usage, CPU utilization."
        },
        stack=STACK
    )

def enqueue_security_audit():
    """Enqueue security audit"""
    print(f"[{datetime.utcnow().isoformat()}] 🔐 Running security audit...")
    
    enqueue(
        "incident",
        {
            "request": "Conduct security audit: review access controls, data encryption, vulnerability scanning, compliance status, incident response readiness."
        },
        stack=STACK
    )

def setup_default_schedule():
    """Set up default schedules"""
    scheduler = Scheduler()
    
    # Daily company update at 9 AM
    scheduler.add_job(
        enqueue_company_update,
        interval=1,
        unit="days",
        name="Daily Company Update",
        at_time="09:00"
    )
    
    # Weekly performance analysis on Monday 8 AM
    scheduler.add_job(
        enqueue_performance_analysis,
        interval=1,
        unit="weeks",
        name="Weekly Performance Analysis",
        at_time="08:00"  # Mondays at 8 AM
    )
    
    # Monthly security audit on 1st of month
    scheduler.add_job(
        enqueue_security_audit,
        interval=1,
        unit="weeks",  # Weekly for now, can be improved
        name="Weekly Security Audit",
        at_time="10:00"
    )
    
    return scheduler

def main() -> int:
    parser = argparse.ArgumentParser(description="Elite Dev Unit Scheduler")
    parser.add_argument(
        "--poll",
        type=int,
        default=60,
        help="Poll interval in seconds"
    )
    parser.add_argument(
        "--custom",
        help='Custom schedule: "interval:unit:time" e.g. "2:hours:09:00"'
    )
    
    args = parser.parse_args()
    
    scheduler = setup_default_schedule()
    
    if args.custom:
        parts = args.custom.split(":")
        if len(parts) >= 2:
            interval = int(parts[0])
            unit = parts[1]
            at_time = parts[2] if len(parts) > 2 else None
            scheduler.add_job(
                enqueue_company_update,
                interval=interval,
                unit=unit,
                name="Custom Job",
                at_time=at_time
            )
    
    scheduler.run_loop(poll_seconds=args.poll)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())