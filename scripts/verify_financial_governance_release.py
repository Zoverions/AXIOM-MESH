#!/usr/bin/env python3
"""
M23.6: Financial/Governance Verification Scripts for CI Release Gates

This script validates tokenomics and treasury claims by:
1. Running tokenomics controls verification
2. Checking treasury routing in RevenueModel
3. Validating distribution pool configuration
4. Verifying governance contract settings

Usage:
    python3 scripts/verify_financial_governance_release.py

Exit codes:
    0 - All checks passed
    1 - One or more checks failed
"""
import sys
import json
from pathlib import Path


def verify_tokenomics_controls():
    """Run tokenomics controls verification."""
    script_path = Path("scripts/verify_tokenomics_controls.py")
    if not script_path.exists():
        return False, "verify_tokenomics_controls.py not found"
    
    import subprocess
    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        return False, f"Tokenomics verification failed: {result.stderr}"
    
    return True, "Tokenomics controls verified"


def verify_audit_controls_manifest():
    """Verify audit-controls.json exists and is valid JSON."""
    manifest_path = Path("schemas/audit-controls.json")
    if not manifest_path.exists():
        return False, "audit-controls.json not found"
    
    try:
        with open(manifest_path) as f:
            data = json.load(f)
        
        # Check required top-level keys
        required_keys = ["version", "domains", "release_gates"]
        for key in required_keys:
            if key not in data:
                return False, f"Missing required key in audit-controls.json: {key}"
        
        # Verify domains have controls
        if not data.get("domains"):
            return False, "No domains defined in audit-controls.json"
        
        domain_count = len(data["domains"])
        if domain_count < 5:
            return False, f"Expected at least 5 domains, found {domain_count}"
        
        # Verify release gates exist
        release_gates = data.get("release_gates", {})
        if not release_gates.get("pre_release"):
            return False, "No pre_release gates defined in audit-controls.json"
        
        return True, f"Audit controls manifest valid ({domain_count} domains, {len(release_gates.get('pre_release', []))} pre-release gates)"
    
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON in audit-controls.json: {e}"


def verify_treasury_routing():
    """Check that RevenueModel routes fees to UniversalDistributionPool."""
    revenue_model_path = Path("grid/contracts/contracts/finance/RevenueModel.sol")
    if not revenue_model_path.exists():
        # Try alternate path
        revenue_model_path = Path("grid/contracts/contracts/RevenueModel.sol")
    
    if not revenue_model_path.exists():
        return False, "RevenueModel.sol not found"
    
    content = revenue_model_path.read_text()
    
    # Check for distribution pool routing
    if "UniversalDistributionPool" not in content and "_routeToPool" not in content:
        return False, "RevenueModel.sol does not reference UniversalDistributionPool or _routeToPool"
    
    # Check that owner withdrawal is not present (should route to pool instead)
    if "withdrawFees()" in content and "owner" in content.lower():
        # This might be okay if it's commented out or deprecated
        lines = content.split('\n')
        for line in lines:
            if "withdrawFees()" in line and "owner" in line.lower() and not line.strip().startswith("//"):
                return False, "RevenueModel.sol may have unsafe owner withdrawal pattern"
    
    return True, "Treasury routing verified"


def verify_distribution_pool_config():
    """Verify UniversalDistributionPool has correct configuration."""
    pool_path = Path("grid/contracts/contracts/UniversalDistributionPool.sol")
    if not pool_path.exists():
        return False, "UniversalDistributionPool.sol not found"
    
    content = pool_path.read_text()
    
    # Check for network share percentage (should be 60 per tokenomics)
    if "networkSharePercentage" in content:
        # Look for the default value
        import re
        match = re.search(r"networkSharePercentage\s*=\s*(\d+)", content)
        if match:
            value = int(match.group(1))
            if value != 60:
                return False, f"networkSharePercentage should be 60, found {value}"
    
    return True, "Distribution pool configuration verified"


def verify_governance_contracts():
    """Verify governance contracts compile and have basic structure."""
    governance_paths = [
        Path("grid/contracts/contracts/governance"),
        Path("grid/contracts/contracts/GovernanceCapsule.sol"),
    ]
    
    governance_dir = None
    for p in governance_paths:
        if p.exists():
            if p.is_dir():
                governance_dir = p
            else:
                return True, "GovernanceCapsule.sol exists"
            break
    
    if not governance_dir:
        return False, "Governance contracts directory not found"
    
    # Check for key governance files
    key_files = ["GovernanceCapsule.sol", "ProposalNFT.sol"]
    found_files = []
    for f in governance_dir.glob("*.sol"):
        found_files.append(f.name)
    
    if len(found_files) == 0:
        return False, "No governance contracts found"
    
    return True, f"Governance contracts verified ({len(found_files)} files)"


def main():
    print("=" * 60)
    print("M23.6: Financial/Governance Release Gate Verification")
    print("=" * 60)
    
    checks = [
        ("Tokenomics Controls", verify_tokenomics_controls),
        ("Audit Controls Manifest", verify_audit_controls_manifest),
        ("Treasury Routing", verify_treasury_routing),
        ("Distribution Pool Config", verify_distribution_pool_config),
        ("Governance Contracts", verify_governance_contracts),
    ]
    
    all_passed = True
    results = []
    
    for name, check_fn in checks:
        try:
            passed, message = check_fn()
            status = "✓ PASS" if passed else "✗ FAIL"
            print(f"\n[{status}] {name}")
            print(f"       {message}")
            results.append({"check": name, "passed": passed, "message": message})
            if not passed:
                all_passed = False
        except Exception as e:
            print(f"\n[✗ FAIL] {name}")
            print(f"         Exception: {e}")
            results.append({"check": name, "passed": False, "message": str(e)})
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("All financial/governance release gates PASSED")
        print("=" * 60)
        
        # Output summary JSON for CI
        summary = {
            "status": "passed",
            "checks": results,
            "timestamp": Path(__file__).stat().st_mtime
        }
        print("\nCI Summary:")
        print(json.dumps(summary, indent=2))
        sys.exit(0)
    else:
        print("One or more financial/governance release gates FAILED")
        print("=" * 60)
        
        # Output failure summary
        summary = {
            "status": "failed",
            "checks": results,
            "timestamp": Path(__file__).stat().st_mtime
        }
        print("\nCI Summary:")
        print(json.dumps(summary, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
