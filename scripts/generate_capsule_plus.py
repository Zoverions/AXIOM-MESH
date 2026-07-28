import os
import json
import uuid
import argparse
from datetime import datetime, timezone
import shutil

def generate_capsule_plus(name, capabilities=None, agents=None, output_dir=None):
    """Generates the boilerplate for a new Capsule Plus module."""
    if not output_dir:
        output_dir = os.path.join(os.path.dirname(__file__), "..", "sandbox", "capsules")

    capsule_dir = os.path.join(output_dir, name)

    if os.path.exists(capsule_dir):
        print(f"Error: Directory {capsule_dir} already exists.")
        return False

    os.makedirs(capsule_dir, exist_ok=True)
    os.makedirs(os.path.join(capsule_dir, "agents"), exist_ok=True)
    os.makedirs(os.path.join(capsule_dir, "schemas"), exist_ok=True)
    os.makedirs(os.path.join(capsule_dir, "contracts"), exist_ok=True)

    dt_now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    capsule_id = f"cap-{name[:15]}-{uuid.uuid4().hex[:4]}"

    capabilities_list = capabilities.split(",") if capabilities else [f"{name}-core"]
    agents_list = agents.split(",") if agents else ["core_agent"]

    # 1. Generate SKILL_MANIFEST.json
    manifest = {
        "capsule_id": capsule_id,
        "name": name,
        "version": "1.0.0",
        "issuer": {
            "mesh_issuer": "hypervisor",
            "key_id": "key-001"
        },
        "capabilities": capabilities_list,
        "constraints": {
            "proof_carrying_intents": True,
            "intent_canonicalization": True,
            "max_risk_score": 0.5
        },
        "runtime": {
            "cpu_limit": 1.0,
            "memory_limit_mb": 512,
            "timeout_ms": 30000
        },
        "token_policy": {
            "scope": {
                "tools": [f"{agent}-tool" for agent in agents_list],
                "data": [f"/workspace/{name}"]
            },
            "ttl_seconds": 3600,
            "revocation_handle_required": True,
            "proof_strictness": "high"
        },
        "personality": {
            "style": "analytical",
            "heuristics": ["default"]
        }
    }

    with open(os.path.join(capsule_dir, "SKILL_MANIFEST.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    # 2. Generate SOURCE_DESCRIPTOR.json
    source_descriptor = {
        "source_did": f"did:mesh:org:axiom:{name}",
        "authority": "AXIOM-MESH Core Development",
        "timestamp": dt_now,
        "build_hash": "pending-build",
        "dependencies": [
            "hypervisor-v1",
            "grid-v1"
        ],
        "attestation_url": f"https://axiom-mesh.local/attest/{capsule_id}"
    }

    with open(os.path.join(capsule_dir, "SOURCE_DESCRIPTOR.json"), "w") as f:
        json.dump(source_descriptor, f, indent=2)

    # 3. Generate README.md from template
    template_path = os.path.join(os.path.dirname(__file__), "..", "docs", "templates", "CAPSULE_PLUS_TEMPLATE.md")
    readme_dest = os.path.join(capsule_dir, "README.md")

    if os.path.exists(template_path):
        shutil.copy(template_path, readme_dest)
        # basic find/replace in the copied template
        with open(readme_dest, "r") as f:
            content = f.read()

        content = content.replace("Capsule Plus Name", name.replace("-", " ").title() + " Capsule")
        content = content.replace("[capsule_name]", name)

        with open(readme_dest, "w") as f:
            f.write(content)
    else:
        with open(readme_dest, "w") as f:
            f.write(f"# {name} Capsule\n\nAuto-generated structure.")

    # 4. Generate Agent stubs
    for agent in agents_list:
        agent_file = os.path.join(capsule_dir, "agents", f"{agent}.py")
        with open(agent_file, "w") as f:
            f.write(f'"""\nStub for {agent} in the {name} Capsule.\n"""\n\n')
            f.write("def run():\n    pass\n")

    print(f"Successfully generated Capsule Plus '{name}' in {capsule_dir}")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Capsule Plus boilerplate.")
    parser.add_argument("name", help="Name of the Capsule Plus (e.g., healthcare-advanced)")
    parser.add_argument("--capabilities", help="Comma-separated list of capabilities", default="")
    parser.add_argument("--agents", help="Comma-separated list of agents", default="")
    parser.add_argument("--outdir", help="Output directory", default="")

    args = parser.parse_args()
    generate_capsule_plus(args.name, args.capabilities, args.agents, args.outdir)
