# Education Skill Capsule (Knowledge Bookcase / Tome) Structure

**Status**: In Progress — Primary tasks moved to MASTER-TODO.md Lane M13
**Owner**: @agent+sandbox+ai
**Date**: 2026-03-25 (Updated: 2026-03-28)

## Overview
The goal is to expand the standard `SkillCapsule` model into a more complex `Education Tome` (or Knowledge Bookcase). This structure represents a larger curriculum and support system designed for high school and up (with a future focus on elementary school engagement with maturity/parental filters).

## Required Personas/Sub-Agents
The capsule must incorporate multiple essential personalities and structures:
- **Childhood Psychologist**: Analyzes student emotional and psychological well-being.
- **Guidance Counselor**: Provides career and curriculum guidance.
- **Subject Expert**: Delivers specific curriculum content and answers technical queries.
- **Support Family Interface**: A structured hook for chosen support family members to engage with the system.

## Completed Work
- [x] Initial education capsule scaffold created in `sandbox/capsules/education/`
- [x] Basic schema definitions for learning progress tracking
- [x] M13.4: Enhanced Education Skill Capsule Structure with multi-agent concepts

## Remaining Tasks (Tracked in MASTER-TODO.md)
- [ ] **M13.7** Complete EDUCATION-CAPSULE implementation
  - Define `schemas/education_tome.capnp` for multi-agent request/response modeling
  - Implement multi-agent persona runtimes:
    - Childhood psychologist agent for emotional/psychological analysis
    - Guidance counselor agent for career/curriculum guidance
    - Subject expert agent for curriculum delivery
  - Scaffold complete capsule in `sandbox/capsules/education_tome/`
  - Implement parental/maturity filters for under-16 engagement

## Related Documents
- **Master TODO:** `docs/MASTER-TODO.md` (Lane M13.7)
- **Existing Capsule:** `sandbox/capsules/education/`
- **Schema Directory:** `schemas/`
- **Custom GUI System:** `docs/subtasks/CUSTOM-GUI-SYSTEM.md` (Education Node GUI at port 8081)
