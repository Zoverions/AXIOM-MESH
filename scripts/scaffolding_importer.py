import os
import json
import sys
import logging
from typing import List, Dict, Any
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger("ScaffoldingImporter")

# Ensure we can import from hypervisor
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from hypervisor.src.capsules.compiler import intake_payload
except ImportError:
    logger.error("Failed to import intake_payload from hypervisor. Ensure script is run from repo root.")
    sys.exit(1)

def discover_agent_zero(search_path: Path) -> List[Dict[str, Any]]:
    """
    Discovers Agent Zero installations and extracts tool definitions.
    Typically looks for 'tools' directory in Agent Zero installations.
    """
    discovered = []
    # Search for directories that might be Agent Zero
    possible_paths = [
        search_path / "agent-zero",
        search_path / "agent0",
        Path.home() / "agent-zero",
        Path.home() / "agent0"
    ]

    for p in possible_paths:
        if p.exists() and p.is_dir():
            tools_dir = p / "tools"
            if tools_dir.exists() and tools_dir.is_dir():
                logger.info(f"Found Agent Zero tools at {tools_dir}")
                for tool_file in tools_dir.glob("*.json"):
                    try:
                        with open(tool_file, 'r') as f:
                            tool_data = json.load(f)
                            # Agent Zero tools usually have name and description
                            discovered.append({
                                "source": f"agent-zero:{tool_file}",
                                "name": tool_data.get("name", tool_file.stem),
                                "capabilities": ["agent-zero-tool"],
                                "constraints": {"legacy_framework": "agent-zero"},
                                "runtime": {}
                            })
                    except Exception as e:
                        logger.warning(f"Failed to parse Agent Zero tool {tool_file}: {e}")
    return discovered

def discover_open_claw(search_path: Path) -> List[Dict[str, Any]]:
    """
    Discovers OpenClaw installations.
    Looks for OpenClaw config files or skill directories.
    """
    discovered = []
    possible_paths = [
        search_path / "openclaw",
        search_path / "open-claw",
        Path.home() / "openclaw",
        Path.home() / "open-claw"
    ]

    for p in possible_paths:
        if p.exists() and p.is_dir():
            skills_dir = p / "skills"
            if skills_dir.exists() and skills_dir.is_dir():
                logger.info(f"Found OpenClaw skills at {skills_dir}")
                for skill_dir in skills_dir.iterdir():
                    if skill_dir.is_dir():
                        manifest_path = skill_dir / "manifest.json"
                        if manifest_path.exists():
                            try:
                                with open(manifest_path, 'r') as f:
                                    skill_data = json.load(f)
                                    discovered.append({
                                        "source": f"openclaw:{skill_dir}",
                                        "name": skill_data.get("name", skill_dir.name),
                                        "capabilities": skill_data.get("capabilities", ["openclaw-skill"]),
                                        "constraints": {"legacy_framework": "openclaw"},
                                        "runtime": skill_data.get("runtime", {})
                                    })
                            except Exception as e:
                                logger.warning(f"Failed to parse OpenClaw skill at {skill_dir}: {e}")
    return discovered

def run_import(search_dir: str = "."):
    search_path = Path(search_dir)
    logger.info(f"Starting discovery in {search_path.absolute()}")

    all_discovered = []
    all_discovered.extend(discover_agent_zero(search_path))
    all_discovered.extend(discover_open_claw(search_path))

    if not all_discovered:
        logger.info("No legacy scaffolding detected.")
        return []

    imported_capsules = []
    for item in all_discovered:
        try:
            logger.info(f"Importing {item['name']} from {item['source']}...")
            manifest = intake_payload(
                source=item['source'],
                name=item['name'],
                capabilities=item['capabilities'],
                constraints=item['constraints'],
                runtime=item['runtime']
            )
            imported_capsules.append(manifest)
            logger.info(f"Successfully imported {item['name']} as capsule {manifest['capsule_id']}")
        except Exception as e:
            logger.error(f"Failed to import {item['name']}: {e}")

    return imported_capsules

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AXIOM-MESH Scaffolding Importer")
    parser.add_argument("--path", type=str, default=".", help="Base path to search for legacy scaffolding")
    args = parser.parse_args()

    run_import(args.path)
