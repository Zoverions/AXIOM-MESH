# Education Skill Capsule (Knowledge Bookcase / Tome) Structure

**Status**: In Progress
**Owner**: @agent
**Date**: 2026-03-25

## Overview
The goal is to expand the standard `SkillCapsule` model into a more complex `Education Tome` (or Knowledge Bookcase). This structure represents a larger curriculum and support system designed for high school and up (with a future focus on elementary school engagement with maturity/parental filters).

## Required Personas/Sub-Agents
The capsule must incorporate multiple essential personalities and structures:
- **Childhood Psychologist**: Analyzes student emotional and psychological well-being.
- **Guidance Counselor**: Provides career and curriculum guidance.
- **Subject Expert**: Delivers specific curriculum content and answers technical queries.
- **Support Family Interface**: A structured hook for chosen support family members to engage with the system.

## Action Plan
1.  **Define Schema**: Create `schemas/education_tome.capnp` to model requests and multi-agent responses.
2.  **Implementation**: Scaffold the capsule in `sandbox/capsules/education_tome/` with python runtimes for each persona.
3.  **Parental/Maturity Filters**: Research and implement structured access controls for under-16 engagement.
