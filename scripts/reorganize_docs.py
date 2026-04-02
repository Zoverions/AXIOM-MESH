import os
import shutil

DOCS_DIR = "docs"

# Desired directory structure
STRUCTURE = {
    "architecture": [
        "ARCHITECTURE.md",
        "STATE-MANAGEMENT-ARCHITECTURE.md",
        "INTERFACE-CONTROL-DOCUMENT.md",
        "FOUNDATIONS.md"
    ],
    "tokenomics": [
        "TOKENOMICS.md",
        "TREASURY-SPLIT.md",
        "DEPLOYMENT_COST_ANALYSIS.md",
        "ERC20-COMPATIBILITY.md",
        "FINANCIAL-CONTROLS-EVIDENCE.md"
    ],
    "security": [
        "SECURITY-HARDENING.md",
        "SECURITY-REALITY-2026.md",
        "COORDINATED-BEHAVIOR-THREAT-MODEL.md",
        "CRYPTOGRAPHY-POSTURE-MATRIX.md",
        "GRID-SCOPE-FIREWALL.md",
        "BUG-BOUNTY-POLICY.md"
    ],
    "governance": [
        "GOVERNANCE.md",
        "GOVERNANCE-CONTROL-MAP.md",
        "AXIOM-SOVEREIGN-OPERATING-MODEL-v3.md"
    ],
    "operations": [
        "OPERATIONS.md",
        "DEGRADED-MODE-PLAYBOOK.md",
        "HARDWARE-PROFILE-MATRIX.md",
        "RESOURCE-BALANCER-POLICY.md",
        "RESILIENCE-DRILLS-AND-PENTEST-RUNBOOK-2026-03-29.md"
    ],
    "developer_guides": [
        "INSTALLATION-GUIDE.md",
        "ANDROID-INSTALL-GUIDE.md",
        "ANDROID-TERMUX-EXPANSION.md",
        "INSTALLER-MONITOR-PROFILES.md",
        "TEST-STRATEGY.md",
        "GUI-CROSS-BROWSER-ACCESSIBILITY-TESTING.md",
        "LIVE-USB-ISO-DISTRIBUTION.md",
        "LIVE-USB-ISO-TESTING-VALIDATION.md"
    ],
    "whitepapers_and_research": [
        "WHITEPAPER.md",
        "RADM.md",
        "whitepaper-attention-blockchains.md",
        "CAUSAL-PROOF-OF-REASONING.md",
        "PROOF-OF-TRUTH.md",
        "BIOLOGICAL-DIGITAL-TRANSLATION.md",
        "ZKML-APPLICATIONS-IN-AXIOM.md",
        "GDPR-COMPLIANCE-MODELS.md",
        "SSI-TECHNICAL-IMPLEMENTATION.md"
    ]
}

def reorganize_docs():
    for category, files in STRUCTURE.items():
        category_dir = os.path.join(DOCS_DIR, category)
        os.makedirs(category_dir, exist_ok=True)

        for file in files:
            source_path = os.path.join(DOCS_DIR, file)
            target_path = os.path.join(category_dir, file)

            if os.path.exists(source_path):
                shutil.move(source_path, target_path)
                print(f"Moved {file} to {category}/")
            elif os.path.exists(target_path):
                print(f"File {file} already in {category}/")
            else:
                print(f"File {file} not found in {DOCS_DIR}/")

if __name__ == "__main__":
    reorganize_docs()
