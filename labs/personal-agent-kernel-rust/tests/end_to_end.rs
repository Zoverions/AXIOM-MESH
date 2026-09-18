use axiom_personal_agent_kernel_rust_lab::{
    AuthorityBudget, AutonomyLevel, AutonomyState, BudgetDimension, BudgetRequest, Constitution,
    DelegationLedger, EffectClass, EffectPort, EffectReceipt, Kernel, KernelIdentity, KernelResult,
    MemoryCandidate, MemoryDisposition, MemorySourceKind, MeshProof, MeshProofInput, MeshWitness,
    Plan, PlanNode, Reversibility, RuntimeSurface,
};
use std::collections::BTreeSet;

const NOW: u64 = 1_789_733_000;

fn sha(ch: char) -> String {
    std::iter::repeat_n(ch, 64).collect()
}

fn surface() -> RuntimeSurface {
    RuntimeSurface::new(sha('a'), sha('b'), sha('c'), 4).expect("valid runtime surface")
}

fn kernel() -> Kernel {
    let identity = KernelIdentity {
        kernel_id: "personal-kernel:owner-1".into(),
        owner_subject_ref: "subject:owner-1".into(),
        principal_ref: "principal:personal-agent-1".into(),
        personal_agent_pack_ref: "pack:owner-1".into(),
        personal_agent_pack_sha256: sha('d'),
    };
    let constitution =
        Constitution::strict("constitution:owner-1", "policy:constitution-amendment-1")
            .expect("strict constitution");

    let budgets = vec![
        AuthorityBudget {
            budget_id: "budget:purchase-actions".into(),
            capability_ref: "capability:purchase".into(),
            dimension: BudgetDimension::Actions,
            ceiling: 10,
            consumed: 3,
            currency: None,
            valid_from_unix_s: NOW - 1_000,
            expires_at_unix_s: NOW + 10_000,
        },
        AuthorityBudget {
            budget_id: "budget:purchase-cad".into(),
            capability_ref: "capability:purchase".into(),
            dimension: BudgetDimension::MinorCurrencyUnits,
            ceiling: 20_000,
            consumed: 5_000,
            currency: Some("CAD".into()),
            valid_from_unix_s: NOW - 1_000,
            expires_at_unix_s: NOW + 10_000,
        },
    ];

    let autonomy = vec![AutonomyState {
        capability_ref: "capability:purchase".into(),
        level: AutonomyLevel::RequestEffect,
        surface: surface(),
        successful_receipts: 12,
        failed_receipts: 0,
    }];

    Kernel::new(identity, constitution, budgets, autonomy, 7).expect("valid kernel")
}

fn plan(reversibility: Reversibility, owner_confirmation_ref: Option<String>) -> Plan {
    Plan {
        plan_id: "plan:purchase-1".into(),
        owner_subject_ref: "subject:owner-1".into(),
        plan_digest: sha('e'),
        nodes: vec![
            PlanNode {
                node_id: "node:research".into(),
                depends_on: vec![],
                capability_ref: "capability:purchase".into(),
                requested_autonomy: AutonomyLevel::Draft,
                effect_class: EffectClass::Observe,
                reversibility: Reversibility::Reversible,
                owner_confirmation_ref: None,
                budget_requests: vec![],
                uses_quarantined_memory: false,
            },
            PlanNode {
                node_id: "node:purchase".into(),
                depends_on: vec!["node:research".into()],
                capability_ref: "capability:purchase".into(),
                requested_autonomy: AutonomyLevel::RequestEffect,
                effect_class: EffectClass::Financial,
                reversibility,
                owner_confirmation_ref,
                budget_requests: vec![
                    BudgetRequest {
                        budget_id: "budget:purchase-actions".into(),
                        amount: 1,
                        currency: None,
                    },
                    BudgetRequest {
                        budget_id: "budget:purchase-cad".into(),
                        amount: 2_500,
                        currency: Some("CAD".into()),
                    },
                ],
                uses_quarantined_memory: false,
            },
        ],
    }
}

fn exact_proof(request: &axiom_personal_agent_kernel_rust_lab::AuthorityRequest) -> MeshProof {
    MeshProof::from_trusted_mesh_adapter(MeshProofInput {
        grant_ref: "grant:purchase-1".into(),
        owner_subject_ref: request.owner_subject_ref.clone(),
        plan_digest: request.plan_digest.clone(),
        node_id: request.node_id.clone(),
        capability_ref: request.capability_ref.clone(),
        revocation_epoch: request.revocation_epoch,
        expires_at_unix_s: NOW + 300,
        max_delegation_hops: 2,
    })
    .expect("trusted adapter emits valid proof shape")
}

#[derive(Default)]
struct RecordingPort {
    calls: usize,
}

impl EffectPort for RecordingPort {
    fn execute(
        &mut self,
        effect: &axiom_personal_agent_kernel_rust_lab::AuthorizedEffect,
    ) -> KernelResult<EffectReceipt> {
        self.calls += 1;
        Ok(EffectReceipt {
            receipt_ref: "receipt:purchase-1".into(),
            grant_ref: effect.grant_ref().into(),
            plan_digest: effect.plan_digest().into(),
            node_id: effect.node_id().into(),
            capability_ref: effect.capability_ref().into(),
            effect_digest: sha('f'),
            success: true,
        })
    }
}

#[test]
fn end_to_end_lifecycle_requires_mesh_proof_and_strips_authority_on_restore() {
    let kernel = kernel();
    let compiled = kernel
        .compile_plan(plan(Reversibility::Compensatable, None), NOW, &surface())
        .expect("bounded plan compiles");
    assert!(!compiled.grants_authority());
    assert_eq!(
        compiled.aggregate_budget_amount("budget:purchase-cad"),
        Some(2_500)
    );

    let shadow = kernel.shadow(&compiled).expect("shadow report");
    assert!(shadow.all_effects_rehearsed);
    assert!(shadow.rollback_or_confirmation_complete);
    assert!(!shadow.grants_authority());

    let requests = kernel
        .authority_requests(&compiled, &shadow)
        .expect("authority requests");
    assert_eq!(requests.len(), 1);
    let request = &requests[0];
    assert!(!request.grants_authority());

    let proof = exact_proof(request);
    let verified = kernel
        .verify_mesh_proof(request, proof, NOW)
        .expect("exact fresh mesh proof");
    assert_eq!(verified.grant_ref(), "grant:purchase-1");

    let mut port = RecordingPort::default();
    let receipt = kernel
        .execute_authorized(&verified, &mut port)
        .expect("effect only after verified mesh authority");
    assert_eq!(port.calls, 1);

    let receipt_evidence = kernel
        .admit_receipt(&verified, &receipt)
        .expect("receipt exactly binds to grant and plan node");
    assert!(receipt_evidence.success);
    assert!(!receipt_evidence.grants_authority());

    let observed_receipts = BTreeSet::from([receipt_evidence.receipt_ref.clone()]);
    let memory = MemoryCandidate {
        candidate_id: "memory-candidate:purchase-preference".into(),
        owner_subject_ref: "subject:owner-1".into(),
        source_kind: MemorySourceKind::AgentInference,
        provenance_verified: true,
        independent_evidence_refs: vec!["evidence:merchant-1".into(), "evidence:owner-1".into()],
        receipt_refs: vec![receipt_evidence.receipt_ref.clone()],
        contradicts_memory_refs: vec![],
        requested_durable: true,
    };
    let memory_assessment = kernel
        .assess_memory(&memory, &observed_receipts)
        .expect("memory assessment");
    assert_eq!(
        memory_assessment.disposition,
        MemoryDisposition::AdmitDurable
    );
    assert!(!memory_assessment.truth_certified());
    assert!(!memory_assessment.grants_authority());

    let mut delegation = DelegationLedger::new(&verified);
    let child = delegation
        .reserve(
            "delegate:merchant-broker",
            "capability:purchase",
            vec![
                BudgetRequest {
                    budget_id: "budget:purchase-actions".into(),
                    amount: 1,
                    currency: None,
                },
                BudgetRequest {
                    budget_id: "budget:purchase-cad".into(),
                    amount: 1_000,
                    currency: Some("CAD".into()),
                },
            ],
            1,
        )
        .expect("strictly attenuated delegation proposal");
    assert!(child.requires_mesh_reauthorization());
    assert!(!child.grants_authority());

    let sibling_overcommit = delegation.reserve(
        "delegate:second-broker",
        "capability:purchase",
        vec![BudgetRequest {
            budget_id: "budget:purchase-actions".into(),
            amount: 1,
            currency: None,
        }],
        0,
    );
    assert!(sibling_overcommit.is_err());

    let capsule = kernel
        .export_continuity(
            vec!["memory:purchase-preference".into()],
            vec![receipt_evidence.receipt_ref],
        )
        .expect("continuity export");
    assert!(!capsule.authority_carried());
    assert_eq!(capsule.active_grants(), 0);

    let restored = kernel
        .restore_continuity(&capsule)
        .expect("authority-free restore");
    assert!(!restored.authority_restored());
    assert_eq!(restored.memory_refs, vec!["memory:purchase-preference"]);
}

#[test]
fn mesh_native_handoff_and_witness_quorum_preserve_single_spend_semantics() {
    let kernel = kernel();
    let compiled = kernel
        .compile_plan(plan(Reversibility::Compensatable, None), NOW, &surface())
        .expect("compile");
    let shadow = kernel.shadow(&compiled).expect("shadow");
    let request = kernel
        .authority_requests(&compiled, &shadow)
        .expect("requests")
        .remove(0);
    let verified = kernel
        .verify_mesh_proof(&request, exact_proof(&request), NOW)
        .expect("verified mesh authority");

    let handoff = kernel
        .propose_authority_handoff(&verified, "node:phone", "node:desktop")
        .expect("bounded handoff proposal");
    assert_eq!(handoff.current_revocation_epoch, 7);
    assert_eq!(handoff.proposed_revocation_epoch, 8);
    assert!(handoff.requires_mesh_reauthorization());
    assert!(!handoff.grants_authority());

    let mut port = RecordingPort::default();
    let receipt = kernel
        .execute_authorized(&verified, &mut port)
        .expect("authorized effect");
    let witnesses = vec![
        MeshWitness {
            witness_node_ref: "node:witness-a".into(),
            receipt_ref: receipt.receipt_ref.clone(),
            effect_digest: receipt.effect_digest.clone(),
            witnessed_at_unix_s: NOW,
        },
        MeshWitness {
            witness_node_ref: "node:witness-b".into(),
            receipt_ref: receipt.receipt_ref.clone(),
            effect_digest: receipt.effect_digest.clone(),
            witnessed_at_unix_s: NOW - 1,
        },
    ];
    let assessment = kernel
        .assess_receipt_witnesses(&receipt, &witnesses, 2, NOW, 30)
        .expect("fresh exact witness set");
    assert_eq!(assessment.unique_witnesses, 2);
    assert!(assessment.quorum_met);
    assert!(!assessment.grants_authority());

    let duplicate_node = vec![witnesses[0].clone(), witnesses[0].clone()];
    let duplicate_assessment = kernel
        .assess_receipt_witnesses(&receipt, &duplicate_node, 2, NOW, 30)
        .expect("duplicate witnesses are counted once");
    assert_eq!(duplicate_assessment.unique_witnesses, 1);
    assert!(!duplicate_assessment.quorum_met);

    let bad = MeshWitness {
        witness_node_ref: "node:witness-c".into(),
        receipt_ref: receipt.receipt_ref.clone(),
        effect_digest: sha('0'),
        witnessed_at_unix_s: NOW,
    };
    assert!(kernel
        .assess_receipt_witnesses(&receipt, &[bad], 1, NOW, 30)
        .is_err());
}

#[test]
fn runtime_surface_drift_collapses_earned_autonomy_to_observe() {
    let kernel = kernel();
    let drifted =
        RuntimeSurface::new(sha('9'), sha('b'), sha('c'), 4).expect("valid drifted surface");

    let result = kernel.compile_plan(plan(Reversibility::Compensatable, None), NOW, &drifted);
    let error = result.expect_err("surface drift must deny prior autonomy");
    assert!(
        error
            .message()
            .contains("autonomy exceeds effective ceiling")
    );
}

#[test]
fn irreversible_effect_requires_explicit_owner_confirmation_before_mesh_request() {
    let kernel = kernel();
    let compiled = kernel
        .compile_plan(plan(Reversibility::Irreversible, None), NOW, &surface())
        .expect("plan shape can compile");
    let shadow = kernel.shadow(&compiled).expect("shadow report");
    assert_eq!(shadow.irreversible_nodes, 1);
    assert!(!shadow.rollback_or_confirmation_complete);
    assert!(kernel.authority_requests(&compiled, &shadow).is_err());

    let confirmed = kernel
        .compile_plan(
            plan(
                Reversibility::Irreversible,
                Some("confirmation:owner-presence-1".into()),
            ),
            NOW,
            &surface(),
        )
        .expect("confirmed irreversible plan compiles");
    let confirmed_shadow = kernel.shadow(&confirmed).expect("confirmed shadow");
    assert!(confirmed_shadow.rollback_or_confirmation_complete);
    assert_eq!(
        kernel
            .authority_requests(&confirmed, &confirmed_shadow)
            .expect("confirmed request")
            .len(),
        1
    );
}

#[test]
fn stale_or_mismatched_mesh_evidence_cannot_cross_the_authority_membrane() {
    let kernel = kernel();
    let compiled = kernel
        .compile_plan(plan(Reversibility::Compensatable, None), NOW, &surface())
        .expect("compile");
    let shadow = kernel.shadow(&compiled).expect("shadow");
    let request = kernel
        .authority_requests(&compiled, &shadow)
        .expect("requests")
        .remove(0);

    let stale = MeshProof::from_trusted_mesh_adapter(MeshProofInput {
        grant_ref: "grant:stale".into(),
        owner_subject_ref: request.owner_subject_ref.clone(),
        plan_digest: request.plan_digest.clone(),
        node_id: request.node_id.clone(),
        capability_ref: request.capability_ref.clone(),
        revocation_epoch: 6,
        expires_at_unix_s: NOW + 100,
        max_delegation_hops: 0,
    })
    .expect("proof shape");
    assert!(kernel.verify_mesh_proof(&request, stale, NOW).is_err());

    let wrong_plan = MeshProof::from_trusted_mesh_adapter(MeshProofInput {
        grant_ref: "grant:wrong-plan".into(),
        owner_subject_ref: request.owner_subject_ref.clone(),
        plan_digest: sha('1'),
        node_id: request.node_id.clone(),
        capability_ref: request.capability_ref.clone(),
        revocation_epoch: request.revocation_epoch,
        expires_at_unix_s: NOW + 100,
        max_delegation_hops: 0,
    })
    .expect("proof shape");
    assert!(kernel.verify_mesh_proof(&request, wrong_plan, NOW).is_err());
}

#[test]
fn derived_memory_cannot_self_launder_without_receipts_and_independent_evidence() {
    let kernel = kernel();
    let empty = BTreeSet::new();
    let candidate = MemoryCandidate {
        candidate_id: "memory-candidate:self-asserted".into(),
        owner_subject_ref: "subject:owner-1".into(),
        source_kind: MemorySourceKind::AgentInference,
        provenance_verified: true,
        independent_evidence_refs: vec!["evidence:only-one".into()],
        receipt_refs: vec!["receipt:not-observed".into()],
        contradicts_memory_refs: vec![],
        requested_durable: true,
    };

    let assessment = kernel
        .assess_memory(&candidate, &empty)
        .expect("memory assessment");
    assert_eq!(assessment.disposition, MemoryDisposition::Quarantine);
    assert!(
        assessment
            .reasons
            .contains(&"two-independent-evidence-refs-required".to_string())
    );
    assert!(
        assessment
            .reasons
            .contains(&"receipt-link-not-observed".to_string())
    );
    assert!(!assessment.truth_certified());
}

#[test]
fn plan_wide_budget_aggregation_blocks_split_node_overcommit() {
    let kernel = kernel();
    let mut overcommitted = plan(Reversibility::Compensatable, None);
    overcommitted.nodes.push(PlanNode {
        node_id: "node:purchase-second".into(),
        depends_on: vec!["node:purchase".into()],
        capability_ref: "capability:purchase".into(),
        requested_autonomy: AutonomyLevel::RequestEffect,
        effect_class: EffectClass::Financial,
        reversibility: Reversibility::Compensatable,
        owner_confirmation_ref: None,
        budget_requests: vec![BudgetRequest {
            budget_id: "budget:purchase-cad".into(),
            amount: 13_000,
            currency: Some("CAD".into()),
        }],
        uses_quarantined_memory: false,
    });

    let result = kernel.compile_plan(overcommitted, NOW, &surface());
    let error = result.expect_err("split nodes must not bypass aggregate ceiling");
    assert!(
        error
            .message()
            .contains("plan-wide authority budget exceeded")
    );
}
