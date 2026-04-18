#!/usr/bin/env python3
"""
Agent Factory - Dynamically load & instantiate agents from JSON config
No code changes needed - just edit agents_year3400.json
"""

import json
from dataclasses import dataclass
from typing import Any, Dict, List

DEFAULT_SCHEMA_COMMON: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "agent": {"type": "string"},
        "summary": {"type": "string"},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {"type": "string"}},
        "artifacts": {"type": "object"},
    },
    "required": ["summary", "decisions", "risks", "actions"],
    "additionalProperties": True,
}

@dataclass
class DynamicAgent:
    """Dynamically loaded agent from config"""
    name: str
    role: str
    system_prompt: str
    schema: Dict[str, Any]
    description: str = ""

def load_agents_config(path: str) -> Dict[str, Any]:
    """Load agents configuration from JSON file"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"⚠️  Config not found: {path}")
        return {"agents": []}

def build_agents_from_config(cfg: Dict[str, Any]) -> List[DynamicAgent]:
    """Build DynamicAgent instances from config"""
    agents = []
    
    for agent_cfg in cfg.get("agents", []):
        name = agent_cfg.get("name")
        if not name:
            continue
        
        agent = DynamicAgent(
            name=name,
            role=agent_cfg.get("role", name),
            system_prompt=agent_cfg.get("system", ""),
            schema=agent_cfg.get("schema") or DEFAULT_SCHEMA_COMMON,
            description=agent_cfg.get("description", ""),
        )
        agents.append(agent)
    
    return agents

def validate_config(cfg: Dict[str, Any]) -> bool:
    """Validate configuration structure"""
    if not isinstance(cfg, dict):
        return False
    
    agents = cfg.get("agents", [])
    if not isinstance(agents, list):
        return False
    
    for agent in agents:
        if not agent.get("name") or not agent.get("system"):
            return False
    
    return True

if __name__ == "__main__":
    print("🏭 Agent Factory")
    print("=" * 70)
    
    cfg = load_agents_config("agents_year3400.json")
    
    if not validate_config(cfg):
        print("❌ Invalid configuration")
    else:
        agents = build_agents_from_config(cfg)
        print(f"✅ Loaded {len(agents)} agents:\n")
        for agent in agents:
            print(f"  • {agent.name:.<35} {agent.role}")
        print(f"{'=' * 70}")