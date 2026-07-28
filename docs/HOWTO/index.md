# AXIOM-MESH HOWTO Index

This directory contains step-by-step guides for operating and developing AXIOM-MESH.

## Core Operations
- [Run Local Stack](run-local-stack.md) - Set up and run the full AXIOM-MESH stack locally
- [Submit Intent](submit-intent.md) - Submit intents through gateway/hypervisor flow
- [Swarm Join](swarm-join.md) - Join or create a mesh swarm
- [Add Nodes via QR](add-nodes-via-qr.md) - Onboard nodes through QR bootstrap flow
- [ZKML Inference](zkml-infer.md) - Perform zero-knowledge machine-learning inference

## Governance, Policies, and Claims
- [Founder Claim](founder-claim.md) - Claim founder allocations
- [MeshStore Claim](meshstore-claim.md) - Claim mesh store rewards
- [NemoClaw Policy](nemoclaw-policy.md) - Manage policy updates and guardrails
- [Contracts Local](contracts-local.md) - Compile/test/deploy contracts locally

## Security, Recovery, and Emergency Procedures
- [Recovery 2FA](recovery-2fa.md) - Two-factor recovery workflow
- [Secret Management](secret-management.md) - Rotation and secure material handling
- [mTLS Bootstrap & Rotation](mtls-bootstrap-rotation.md) - Node-join, CA rotation, revocation, and clock-skew response
- [Bridge Emergency Runbooks](bridge-emergency-runbooks.md) - Incident response for bridge/finality issues
- [Hybrid Cross-Chain Governance Activation & Rollback](hybrid-cross-chain-governance-activation-rollback.md) - Activation controls, rollback triggers, and quarterly drills for hybrid mode

## Delivery, Release, and Installer Operations
- [Release Gate Evidence](release-gate-evidence.md) - Prepare evidence for release gates
- [Transformer Foundation PulseChain](transformer-foundation-pulsechain.md) - Deploy transformer package and publish on-chain evidence
- [Create Bootable USB](create-bootable-usb.md) - Build and validate bootable media
- [Custom GUIs](custom-guis.md) - Customize and validate node GUIs
- [Devcontainer Parity](devcontainer-parity.md) - Verify reproducible development environment parity

## Quick Checklist for Common Tasks
- **New developer setup:** [Run Local Stack](run-local-stack.md) → [Submit Intent](submit-intent.md)
- **Security posture maintenance:** [Secret Management](secret-management.md) + [Recovery 2FA](recovery-2fa.md)
- **Claims + governance operations:** [Founder Claim](founder-claim.md) / [MeshStore Claim](meshstore-claim.md) / [NemoClaw Policy](nemoclaw-policy.md)
- **Release promotion:** [Release Gate Evidence](release-gate-evidence.md) + [Bridge Emergency Runbooks](bridge-emergency-runbooks.md)
