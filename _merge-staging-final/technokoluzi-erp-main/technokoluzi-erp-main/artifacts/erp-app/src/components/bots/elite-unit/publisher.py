#!/usr/bin/env python3
"""
Company Updates Publisher
Takes TechWriter output and exports to Slack, Email, Log file
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class CompanyUpdate:
    """Company update message"""
    title: str
    content: str
    category: str  # feature, bug_fix, infrastructure, performance
    timestamp: str
    run_id: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'title': self.title,
            'content': self.content,
            'category': self.category,
            'timestamp': self.timestamp,
            'run_id': self.run_id,
        }

class LogPublisher:
    """Write updates to company_updates.log"""
    
    def __init__(self, log_path: str = "company_updates.log"):
        self.log_path = log_path
    
    def publish(self, update: CompanyUpdate) -> None:
        """Append update to log file"""
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write("\n" + "="*70 + "\n")
            f.write(f"[{update.timestamp}] {update.category.upper()}: {update.title}\n")
            f.write("="*70 + "\n")
            f.write(update.content)
            f.write("\n")
        print(f"📝 Logged to {self.log_path}")

class SlackPublisher:
    """Send update to Slack webhook"""
    
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.environ.get("SLACK_WEBHOOK_URL")
        
        if not self.webhook_url:
            print("⚠️  Slack webhook not configured (SLACK_WEBHOOK_URL env var)")
    
    def publish(self, update: CompanyUpdate) -> None:
        """Send to Slack"""
        if not self.webhook_url:
            print("❌ Slack webhook not configured")
            return
        
        import requests
        
        # Category emoji
        emojis = {
            'feature': '✨',
            'bug_fix': '🐛',
            'infrastructure': '🔧',
            'performance': '⚡',
        }
        emoji = emojis.get(update.category, '📢')
        
        payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{emoji} {update.title}",
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": update.content[:2000]  # Slack limit
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"_{update.category}_ • {update.timestamp}"
                        }
                    ]
                }
            ]
        }
        
        try:
            response = requests.post(self.webhook_url, json=payload)
            if response.status_code == 200:
                print(f"📤 Sent to Slack")
            else:
                print(f"❌ Slack error: {response.status_code}")
        except Exception as e:
            print(f"❌ Slack error: {e}")

class EmailPublisher:
    """Send update via email"""
    
    def __init__(self, smtp_config: Optional[Dict[str, str]] = None):
        self.smtp_config = smtp_config or {
            "host": os.environ.get("SMTP_HOST"),
            "port": int(os.environ.get("SMTP_PORT", 587)),
            "user": os.environ.get("SMTP_USER"),
            "password": os.environ.get("SMTP_PASSWORD"),
            "from_address": os.environ.get("SMTP_FROM"),
            "to_addresses": os.environ.get("SMTP_TO", "").split(","),
        }
    
    def publish(self, update: CompanyUpdate) -> None:
        """Send via email"""
        if not all(self.smtp_config.values()):
            print("⚠️  Email not configured (missing SMTP env vars)")
            return
        
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        try:
            msg = MIMEMultipart()
            msg['From'] = self.smtp_config['from_address']
            msg['To'] = ', '.join(self.smtp_config['to_addresses'])
            msg['Subject'] = f"[{update.category.upper()}] {update.title}"
            
            # Simple HTML body
            html = f"""
            <html>
                <body style="font-family: Arial, sans-serif;">
                    <h2>{update.title}</h2>
                    <p>{update.content.replace(chr(10), '<br>')}</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        Category: {update.category} | {update.timestamp}
                    </p>
                </body>
            </html>
            """
            
            msg.attach(MIMEText(html, 'html'))
            
            with smtplib.SMTP(self.smtp_config['host'], self.smtp_config['port']) as server:
                server.starttls()
                server.login(self.smtp_config['user'], self.smtp_config['password'])
                server.send_message(msg)
            
            print(f"📧 Email sent")
        
        except Exception as e:
            print(f"❌ Email error: {e}")

class Publisher:
    """Main publisher - sends to multiple channels"""
    
    def __init__(self, channels: list = ["log", "slack"]):
        self.channels = {
            "log": LogPublisher(),
            "slack": SlackPublisher(),
            "email": EmailPublisher(),
        }
        self.enabled_channels = [c for c in channels if c in self.channels]
    
    def publish(self, update: CompanyUpdate) -> None:
        """Publish to all enabled channels"""
        print(f"\n📢 Publishing: {update.title}")
        for channel in self.enabled_channels:
            self.channels[channel].publish(update)
        print()

def extract_update_from_techwriter(techwriter_output: Dict[str, Any]) -> Optional[CompanyUpdate]:
    """Extract CompanyUpdate from TechWriter agent output"""
    try:
        # TechWriter usually outputs: title, summary, key_features, technical_details
        title = techwriter_output.get("title", "Development Update")
        content = techwriter_output.get("summary", "")
        category = techwriter_output.get("category", "feature")
        run_id = techwriter_output.get("run_id", "unknown")
        
        return CompanyUpdate(
            title=title,
            content=content,
            category=category,
            timestamp=datetime.utcnow().isoformat() + "Z",
            run_id=run_id,
        )
    except Exception as e:
        print(f"❌ Failed to extract update: {e}")
        return None

if __name__ == "__main__":
    import sys
    
    # Demo
    demo_update = CompanyUpdate(
        title="CRM Lead Module Released",
        content="""
New CRM module for lead management:
- Lead status tracking (new, contacted, qualified, proposal, negotiation, won, lost)
- Assignment to sales representatives
- Automated follow-up reminders
- Real-time dashboard with conversion metrics
- Bulk import/export functionality
- Activity history and audit trail
        """,
        category="feature",
        timestamp=datetime.utcnow().isoformat() + "Z",
        run_id="RUN-ABC123",
    )
    
    publisher = Publisher(channels=["log"])
    publisher.publish(demo_update)