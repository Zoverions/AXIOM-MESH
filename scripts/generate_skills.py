import json
import os
import uuid
from datetime import datetime, timezone

CATEGORIES = {
    "search_research": [
        "arxiv-watcher", "pubmed-edirect", "wikipedia", "google-search", "google-search-grounding",
        "serper-search", "exa-web-search-free", "newsapi-search", "brightdata", "web-scraper-as-a-service",
        "tavily-web-search", "academic-deep-research", "agent-deep-research", "openclaw-free-web-search", "fact-checking"
    ],
    "document_processing": [
        "docx-official", "xlsx-official", "pptx-official", "pdf-official", "markdown-to-epub",
        "csv-summarizer", "add-watermark-to-pdf", "ai-pdf-builder", "beautiful-mermaid"
    ],
    "coding_dev_workflow": [
        "cc-godmode", "debug-pro", "coding-agent", "cursor-agent", "buildlog",
        "ec-task-orchestrator", "codex-orchestration", "superpowers-vercel", "vercel-react-best-practices",
        "swiftui-skills", "playwright-automation", "d3js-visualization", "specrate"
    ],
    "version_control": [
        "github-official", "auto-pr-merger", "gitclaw", "gitclassic", "conventional-commits",
        "commit-analyzer", "bitbucket-automation", "deepwiki", "repo-backup"
    ],
    "devops_cloud": [
        "docker-essentials", "k8-multicluster", "aws-infra", "aws-ecs-monitor", "aws-security-scanner",
        "nginx-config-creator", "azd-deployment", "appdeploy", "hetzner-manager", "agentic-devops"
    ],
    "data_analytics": [
        "duckdb-integration", "csv-toolkit", "data-analyst-agent", "senior-data-scientist", "senior-data-engineer",
        "hugging-face-datasets", "kaggle-skill", "google-analytics-api"
    ],
    "productivity_memory": [
        "summarize-all", "gog-workspace", "obsidian-integration", "notion-integration", "logseq-integration",
        "agent-memory-ultimate", "braindb", "capability-evolver", "ai-daily-briefing"
    ],
    "browser_automation": [
        "agent-browser", "playwright-web-agent", "airtable-automation", "n8n-workflows", "sheets-cli",
        "spotify-skill", "transloadit-media"
    ],
    "security_governance": [
        "safe-encryption-skill", "agentguard", "prompt-guard", "clawscan", "skills-audit",
        "credential-manager", "1password-integration", "bitwarden-integration", "cloud-security-scanner", "threat-hunting",
        "domain-trust-check", "agent-sentinel", "agent-os-governance"
    ],
    "multi_agent_mesh": [
        "beacon-p2p", "agent-team-orchestration", "mesh-task-orchestrator", "agent-manager", "moltbot-ha",
        "agent-social", "agentchat-realtime", "agent-relay-digest", "clawwork-board"
    ],
    "media_creative": [
        "elevenlabs-tts", "audio-transcribe", "ai-headshot-generation", "album-cover-generation", "book-cover-generation",
        "ace-music", "audio-gen-pro"
    ],
    "domain_specific": [
        "vincent-wallet", "polymarket-agent", "affiliate-master", "apple-health-skill", "calorie-counter",
        "endurance-coach", "pomodoro-system", "daily-review-ritual", "adhd-body-doubling", "ios-simulator",
        "apple-calendar", "mac-notes-agent", "wacli", "byterover", "self-improving-agent", "sonoscli", "weather-forecast"
    ]
}

def generate_skills():
    target_count = 500
    base_skills = []

    # Flatten base skills list
    for cat, skills in CATEGORIES.items():
        for skill in skills:
            base_skills.append({"name": skill, "category": cat})

    # Auto-generate variants if we don't have enough
    all_skills = list(base_skills)
    idx = 0
    while len(all_skills) < target_count:
        base_skill = base_skills[idx % len(base_skills)]
        variant_num = (idx // len(base_skills)) + 1
        all_skills.append({
            "name": f"{base_skill['name']}-v{variant_num}",
            "category": base_skill['category']
        })
        idx += 1

    out_dir = os.path.join(os.path.dirname(__file__), "..", "sandbox", "capsules")
    os.makedirs(out_dir, exist_ok=True)

    dt_now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for i, skill in enumerate(all_skills):
        skill_name = skill["name"]
        skill_dir = os.path.join(out_dir, skill_name)
        os.makedirs(skill_dir, exist_ok=True)

        # Determine capability based on category
        capability = skill["category"].replace("_", "-")

        # Manifest
        manifest = {
            "capsule_id": f"cap-{skill_name[:15]}-{uuid.uuid4().hex[:4]}",
            "name": skill_name,
            "version": "1.0.0",
            "issuer": {
                "mesh_issuer": "hypervisor",
                "key_id": "key-001"
            },
            "capabilities": [capability, f"{capability}-exec"],
            "constraints": {
                "proof_carrying_intents": True,
                "intent_canonicalization": True,
                "max_risk_score": 0.3
            },
            "runtime": {
                "cpu_limit": 1.0,
                "memory_limit_mb": 256,
                "timeout_ms": 10000
            },
            "token_policy": {
                "scope": {
                    "tools": [f"{skill_name}-tool"],
                    "data": []
                },
                "ttl_seconds": 3600,
                "revocation_handle_required": False,
                "proof_strictness": "medium"
            },
            "personality": {
                "style": "neutral",
                "heuristics": ["default"]
            }
        }
        with open(os.path.join(skill_dir, "SKILL_MANIFEST.json"), "w") as f:
            json.dump(manifest, f, indent=2)

        # Source Descriptor
        source_descriptor = {
            "source_type": "registry",
            "source_ref": f"clawhub:openclaw/skills/{skill_name}",
            "immutable_digest": uuid.uuid4().hex[:16],
            "captured_at": dt_now,
            "upstream_signature": {
                "present": True,
                "algorithm": "ecdsa",
                "key_id": "openclaw-root",
                "valid": True
            },
            "declared_authority": ["tool_exec"]
        }
        with open(os.path.join(skill_dir, "SOURCE_DESCRIPTOR.json"), "w") as f:
            json.dump(source_descriptor, f, indent=2)

        # Rebuild Attestation
        rebuild_attestation = {
            "capsule_id": manifest["capsule_id"],
            "mode": "rewrite",
            "compiler_version": "1.0",
            "changes": [
                {
                    "component": "Core",
                    "action": "replace_io",
                    "reason": "auto-generated adaptation"
                }
            ],
            "security_findings": [
                {
                    "severity": "low",
                    "summary": "Auto-generated wrapper"
                }
            ],
            "compiled_at": dt_now
        }
        with open(os.path.join(skill_dir, "REBUILD_ATTESTATION.json"), "w") as f:
            json.dump(rebuild_attestation, f, indent=2)

    print(f"Generated {len(all_skills)} skill capsules in {out_dir}")

if __name__ == "__main__":
    generate_skills()
