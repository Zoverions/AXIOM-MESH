# Ontario Education Capsule

## Overview

This capsule implements the Ontario-specific education framework, integrating with the broader education gamified learning system while adhering to Ontario's secondary school curriculum standards and EDI (Equity, Diversity, and Inclusion) principles.

## Integration Points

### Ontario Health Guild Connection
- Links to the OntarioHealthGuild smart contract for governance oversight
- Implements fail-closed mechanisms for student data protection
- Supports migration pathways for educational credentials

### Regional Alignment
- Maturity assessments calibrated to Ontario curriculum standards
- Cultural adjustments for Ontario-specific educational norms
- DAO role assignments specific to Ontario educational governance


## Curriculum Standards (Capsule Plus)

The Ontario Capsule Plus profile now encodes explicit curriculum controls in `config/ontario_curriculum.json`:
- Ontario Curriculum (Grades 9-12) authority metadata
- Achievement strand mapping (Knowledge/Thinking/Communication/Application)
- OSSLT/OLC4O literacy pathway handling
- 40-hour community involvement graduation requirement
- Evidence retention requirements for traceability and parental consent

## Smart Contracts

### OntarioEducationAttestor.sol
- Attests to educational achievements within Ontario jurisdiction
- Integrates with OntarioHealthGuild for cross-domain verification
- Supports NFT badge grants aligned with Ontario credit systems

### EducationTomeRegistry.sol
- Registry for Education Tome multi-agent interactions
- Tracks student sessions with education personas (childhood psychologist, guidance counselor, expert agents)
- Records trust scores and session outcomes
- Integrates with OntarioEducationAttestor for credential attestation

## Digital Agents

### Narrow AI Agents
- **Parent Advisor Agent**: Provides parental oversight for student activities, reviews achievements for EDI compliance, monitors student progress and wellness, approves/denies DAO access requests for minors
- **Teacher Agent**: Monitors student progress, provides guidance, conducts curriculum assessments, tracks learning outcomes
- **Regional Compliance Agent**: Ensures adherence to Ontario education regulations
- **Education Tome Personas**: Multi-agent system including childhood psychologist, guidance counselor, and expert subject agents for personalized learning sessions

## Capabilities

1. **Maturity Assessment**
   - Ontario-calibrated maturity metrics
   - Emotional intelligence evaluation
   - Self-directed learning readiness

2. **NFT Badge System**
   - Region-specific badge types
   - Unlockable capabilities tied to Ontario curriculum milestones
   - DAO voting rights progression

3. **EDI Compliance**
   - Equity-focused assessment algorithms
   - Diversity-aware cultural adjustments
   - Inclusive access controls

## Files Structure

```
ontario/
├── README.md (this file)
├── contracts/
│   ├── OntarioEducationAttestor.sol
│   └── EducationTomeRegistry.sol
├── agents/
│   ├── parent_advisor.py
│   ├── teacher_agent.py
│   └── compliance_agent.py
├── schemas/
│   ├── ontario_maturity.schema.json
│   ├── ontario_badge.schema.json
│   └── education_tome.capnp
└── config/
    └── ontario_curriculum.json
```

## Governance

This capsule operates under the joint oversight of:
- Education capsule parent governance
- Ontario Health Guild (for cross-domain operations)
- Ontario Ministry of Education guidelines (compliance layer)

## Attestation

- **Capsule ID**: `cap-edu-ont-001`
- **Parent Capsule**: `cap-edu-001`
- **Region**: Ontario, Canada
- **Compliance Framework**: Ontario EDI Standards
