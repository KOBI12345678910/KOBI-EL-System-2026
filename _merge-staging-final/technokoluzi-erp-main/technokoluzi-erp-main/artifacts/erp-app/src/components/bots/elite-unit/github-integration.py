#!/usr/bin/env python3
"""
GitHub Integration for Elite Dev Unit
Automatically creates/updates PRs with generated code
"""

import os
import json
from typing import Dict, Any, Optional
import requests

class GitHubIntegration:
    """GitHub API client for PR creation and management"""
    
    def __init__(self):
        self.token = os.environ.get("GITHUB_TOKEN")
        self.owner = os.environ.get("GITHUB_OWNER")
        self.repo = os.environ.get("GITHUB_REPO")
        self.branch = os.environ.get("GITHUB_BRANCH", "develop")
        self.base_url = "https://api.github.com"
        
        if not all([self.token, self.owner, self.repo]):
            print("⚠️  GitHub not configured (missing GITHUB_TOKEN/OWNER/REPO)")
            self.enabled = False
        else:
            self.enabled = True
            print(f"✅ GitHub configured: {self.owner}/{self.repo}")
    
    def _headers(self) -> Dict[str, str]:
        """Request headers with auth"""
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        }
    
    def create_branch(self, branch_name: str, from_branch: str = "main") -> bool:
        """Create feature branch"""
        if not self.enabled:
            return False
        
        try:
            # Get reference of from_branch
            ref_url = f"{self.base_url}/repos/{self.owner}/{self.repo}/git/refs/heads/{from_branch}"
            ref_resp = requests.get(ref_url, headers=self._headers())
            
            if ref_resp.status_code != 200:
                print(f"❌ Failed to get {from_branch} reference")
                return False
            
            sha = ref_resp.json()["object"]["sha"]
            
            # Create new branch
            create_url = f"{self.base_url}/repos/{self.owner}/{self.repo}/git/refs"
            create_resp = requests.post(
                create_url,
                headers=self._headers(),
                json={
                    "ref": f"refs/heads/{branch_name}",
                    "sha": sha,
                }
            )
            
            if create_resp.status_code in [201, 422]:  # 422 = already exists
                print(f"✅ Branch {branch_name} ready")
                return True
            
            print(f"❌ Failed to create branch: {create_resp.status_code}")
            return False
        
        except Exception as e:
            print(f"❌ Branch creation error: {e}")
            return False
    
    def create_file(self, branch: str, file_path: str, content: str, message: str) -> bool:
        """Create/update file in repo"""
        if not self.enabled:
            return False
        
        try:
            import base64
            
            url = f"{self.base_url}/repos/{self.owner}/{self.repo}/contents/{file_path}"
            
            # Check if file exists
            get_resp = requests.get(url, headers=self._headers(), params={"ref": branch})
            sha = None
            if get_resp.status_code == 200:
                sha = get_resp.json()["sha"]
            
            # Create/update
            payload = {
                "message": message,
                "content": base64.b64encode(content.encode()).decode(),
                "branch": branch,
            }
            
            if sha:
                payload["sha"] = sha
            
            resp = requests.put(url, headers=self._headers(), json=payload)
            
            if resp.status_code in [201, 200]:
                print(f"✅ File {file_path} committed")
                return True
            
            print(f"❌ File commit failed: {resp.status_code}")
            return False
        
        except Exception as e:
            print(f"❌ File creation error: {e}")
            return False
    
    def create_pull_request(
        self,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str = "main"
    ) -> Optional[Dict[str, Any]]:
        """Create pull request"""
        if not self.enabled:
            return None
        
        try:
            url = f"{self.base_url}/repos/{self.owner}/{self.repo}/pulls"
            
            payload = {
                "title": title,
                "body": body,
                "head": head_branch,
                "base": base_branch,
            }
            
            resp = requests.post(url, headers=self._headers(), json=payload)
            
            if resp.status_code in [201, 422]:  # 422 = already exists
                data = resp.json()
                pr_number = data.get("number")
                pr_url = data.get("html_url")
                print(f"✅ PR #{pr_number}: {pr_url}")
                return data
            
            print(f"❌ PR creation failed: {resp.status_code}")
            return None
        
        except Exception as e:
            print(f"❌ PR creation error: {e}")
            return None

def format_code_for_pr(backend_plan: Dict[str, Any]) -> str:
    """Format backend plan as markdown for PR body"""
    
    lines = [
        "# 🚀 Generated Backend Implementation",
        "",
        f"**Stack:** {backend_plan.get('stack', 'unknown')}",
        f"**Run ID:** {backend_plan.get('run_id', 'unknown')}",
        "",
        "## 📋 Modules",
        "",
    ]
    
    for module in backend_plan.get("modules", []):
        lines.append(f"- **{module.get('name')}**")
        lines.append(f"  - {module.get('description')}")
        lines.append(f"  - Files: {', '.join(module.get('files', []))}")
    
    lines.append("")
    lines.append("## 🔌 API Endpoints")
    lines.append("")
    
    for endpoint in backend_plan.get("endpoints", [])[:5]:  # Show first 5
        lines.append(f"- `{endpoint.get('method')} {endpoint.get('path')}`")
        lines.append(f"  - {endpoint.get('description')}")
    
    lines.append("")
    lines.append("## 📊 Database Schema")
    lines.append("")
    lines.append("```sql")
    lines.append(backend_plan.get("schema", "-- See generated files"))
    lines.append("```")
    
    lines.append("")
    lines.append("---")
    lines.append("*Generated by Elite Dev Unit*")
    
    return "\n".join(lines)

def push_generated_code_to_github(run_output: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Create PR with generated code
    
    Flow:
    1. Create feature branch from main
    2. Commit generated files
    3. Create pull request
    """
    
    github = GitHubIntegration()
    if not github.enabled:
        print("⚠️  GitHub not configured")
        return None
    
    try:
        run_id = run_output.get("run_id", "unknown")
        feature_request = run_output.get("feature_request", "Unknown feature")
        backend_plan = run_output.get("outputs", {}).get("backend", {})
        
        # Branch name from run ID
        branch_name = f"elite/{run_id.lower()}"
        
        print(f"\n🔗 Pushing to GitHub...")
        print(f"   Branch: {branch_name}")
        
        # 1. Create branch
        if not github.create_branch(branch_name, from_branch="main"):
            print("❌ Failed to create branch")
            return None
        
        # 2. Commit files (example: requirements.txt, main.py)
        if backend_plan:
            # Create requirements.txt
            requirements = backend_plan.get("requirements", "")
            if requirements:
                github.create_file(
                    branch_name,
                    "requirements.txt",
                    requirements,
                    f"[Elite] Add dependencies for {feature_request}"
                )
            
            # Create main.py (or main file)
            main_code = backend_plan.get("main_code", "")
            if main_code:
                github.create_file(
                    branch_name,
                    "app/main.py",
                    main_code,
                    f"[Elite] Implement {feature_request}"
                )
        
        # 3. Create PR
        pr_title = f"[Elite] {feature_request[:60]}"
        pr_body = format_code_for_pr(backend_plan or {})
        
        pr = github.create_pull_request(
            title=pr_title,
            body=pr_body,
            head_branch=branch_name,
            base_branch="main"
        )
        
        return pr
    
    except Exception as e:
        print(f"❌ GitHub push error: {e}")
        return None

if __name__ == "__main__":
    # Demo
    demo_run = {
        "run_id": "RUN-ABC123",
        "feature_request": "CRM Lead Module",
        "outputs": {
            "backend": {
                "stack": "python-fastapi",
                "modules": [
                    {"name": "leads", "description": "Lead management", "files": ["models.py", "routes.py"]},
                ],
                "endpoints": [
                    {"method": "GET", "path": "/leads", "description": "List all leads"},
                    {"method": "POST", "path": "/leads", "description": "Create new lead"},
                ],
                "schema": "CREATE TABLE leads (...)",
                "requirements": "fastapi==0.100.0\nsqlalchemy==2.0.0",
                "main_code": "from fastapi import FastAPI\napp = FastAPI()",
            }
        }
    }
    
    result = push_generated_code_to_github(demo_run)
    if result:
        print(f"\n✅ PR created: {result.get('html_url')}")