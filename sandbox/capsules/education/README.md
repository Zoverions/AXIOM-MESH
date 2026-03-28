# Education Capsule

## Overview

The Education Capsule implements a gamified learning framework that promotes self-directed education, emotional intelligence development, and DAO governance participation. It uses NFT badges to recognize achievements and unlock network capabilities while maintaining strict adherence to regional educational standards and EDI (Equity, Diversity, and Inclusion) principles.

## Capabilities

- **Emotional Intelligence Assessment**: Evaluates student emotional maturity and provides personalized guidance
- **Self-Directed Learning**: Supports pull-based learning models where students drive their own educational journey
- **Gamification with NFTs**: Issues verifiable NFT badges for achievements that unlock network capabilities
- **DAO Governance Integration**: Graduated access to DAO voting and council participation based on maturity levels
- **Regional Alignment**: Adapts to local curriculum standards and cultural norms (e.g., Ontario, Canada)
- **Maturity Metrics**: Comprehensive assessment of student readiness for advanced responsibilities

## Architecture

```
education/
├── README.md (this file)
├── adapter/
│   ├── normalize_intent.py      # Intent normalization for education requests
│   ├── proof_hooks.py           # Proof-carrying intent validation
│   └── tool_translation.py      # Tool capability translation
├── runtime/
│   └── education_engine.py      # Core education logic and assessments
├── schemas/
│   ├── intent.schema.json       # Education intent schema
│   └── telemetry.schema.json    # Telemetry data schema
├── sbom/
│   └── dependencies.json        # Software bill of materials
├── ontario/                     # Ontario-specific regional implementation
│   ├── README.md
│   ├── contracts/
│   │   ├── OntarioEducationAttestor.sol
│   │   └── EducationTomeRegistry.sol
│   ├── agents/
│   │   └── parent_advisor.py
│   ├── schemas/
│   │   ├── ontario_maturity.schema.json
│   │   ├── ontario_badge.schema.json
│   │   └── education_tome.capnp
│   └── config/
│       └── ontario_curriculum.json
├── SKILL_MANIFEST.json          # Capsule capabilities declaration
├── SOURCE_DESCRIPTOR.json       # Source authority information
├── REBUILD_ATTESTATION.json     # Build attestation record
└── SIGNATURE.sig                # Cryptographic signature
```

## Regional Implementations

### Ontario, Canada

The Ontario sub-capsule provides:
- Integration with **Ontario Health Guild** for cross-domain governance oversight
- EDI-compliant maturity assessments aligned with Ontario curriculum standards
- NFT badge system mapped to Ontario credit values (0.5, 1.0, 1.5, 2.0 credits)
- Parental oversight mechanisms for students under 18
- Fail-closed safety mechanisms via OntarioHealthGuild smart contract

See [ontario/README.md](ontario/README.md) for detailed documentation.

## Smart Contracts

### OntarioEducationAttestor
Located in `ontario/contracts/OntarioEducationAttestor.sol`:
- Attests to educational achievements within Ontario jurisdiction
- Integrates with OntarioHealthGuild for governance oversight
- Issues NFT badges with Ontario credit value mappings
- Implements fail-closed mechanisms for student protection

### EducationTomeRegistry
Located in `ontario/contracts/EducationTomeRegistry.sol`:
- Registry for Education Tome multi-agent interactions
- Tracks student sessions with education personas (childhood psychologist, guidance counselor, expert agents)
- Records trust scores and session outcomes
- Integrates with OntarioEducationAttestor for credential attestation

### OntarioHealthGuild
Located in `/workspace/grid/contracts/contracts/governance/OntarioHealthGuild.sol`:
- Provides cross-domain governance oversight
- Implements fail-closed revocation mechanisms
- Supports fund migration for guild transitions

## Digital Agents

### Education Engine
Core runtime agent (`runtime/education_engine.py`):
- Assesses student maturity levels (1-5 scale)
- Grants NFT badges for achievements
- Checks DAO access eligibility
- Applies regional cultural adjustments

### Parent Advisor Agent
Ontario-specific agent (`ontario/agents/parent_advisor.py`):
- Reviews student achievements for EDI compliance
- Monitors student progress and wellness
- Approves/denies DAO access requests for minors
- Provides parental notifications and feedback

## Maturity Framework

| Level | Name | Description | DAO Access |
|-------|------|-------------|------------|
| 1 | Foundational | Basic self-awareness and task completion | None |
| 2 | Developing | Growing independence and collaborative skills | Observer |
| 3 | Proficient | Self-directed learning and leadership emergence | Junior Council |
| 4 | Advanced | Independent project management and mentoring | Council Member |
| 5 | Exemplary | Innovation, community impact, and peer leadership | Senior Council |

## EDI Principles

All education operations adhere to:

- **Equity**: Fair treatment and equal opportunity through differentiated assessment, accessible materials, and bias-free evaluation
- **Diversity**: Celebration of diverse backgrounds via multicultural content, Indigenous perspectives, and multiple achievement pathways
- **Inclusion**: Welcoming environments using Universal Design for Learning (UDL), accommodation protocols, and student voice

## Token Policy

- **Scope**: Limited to education_engine tools and /workspace/education data paths
- **TTL**: 1800 seconds (30 minutes)
- **Proof Strictness**: Moderate
- **Constraints**: 
  - Proof-carrying intents required
  - Intent canonicalization enforced
  - Maximum risk score: 0.3

## Runtime Limits

- **CPU**: 1.0 cores
- **Memory**: 512 MB
- **Timeout**: 30000 ms (30 seconds)

## Integration Points

1. **Hypervisor**: Capsule compilation and deployment
2. **Gateway**: Intent routing and proof validation
3. **Ontario Health Guild**: Cross-domain governance (Ontario-specific)
4. **Blockchain Networks**: NFT badge attestation on Ethereum, Polygon, Optimism

## Testing

Run capsule tests:
```bash
cd /workspace/sandbox/capsules/education
python -m pytest tests/
```

Run Ontario-specific tests:
```bash
cd /workspace/sandbox/capsules/education/ontario
python -m pytest agents/test_parent_advisor.py
```

## Attestation

- **Capsule ID**: `cap-edu-001`
- **Version**: 1.0.0
- **Issuer**: hypervisor (mesh_issuer)
- **Key ID**: key-001

## Related Documentation

- [White Paper](../../docs/WHITEPAPER.md) - See section on Ontario Education Capsule
- [Ontario Health Guild Contract](../../grid/contracts/contracts/governance/OntarioHealthGuild.sol)
- [Ontario Capsule README](ontario/README.md)
