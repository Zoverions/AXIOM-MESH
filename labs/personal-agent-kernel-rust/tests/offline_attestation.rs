use axiom_personal_agent_kernel_rust_lab::{
    assess_execution_placement, AttestationEvidence, AutonomyLevel, AutonomyState, Constitution,
    EffectPort, EffectReceipt, ExecutionCandidate, Kernel, KernelIdentity, KernelResult,
    OfflineEnvelopeInput, OfflineEnvelopeRegistry, PlacementConstraints, RuntimeSurface,
    BudgetRequest,
};

const NOW: u64 = 1_789_733_000;

fn sha(ch: char) -> String {
    std::iter::repeat_n(ch, 64).collect()
}

fn surface() -> RuntimeSurface {
    RuntimeSurface::new(sha('a'), sha('b'), sha('c'), 9).expect("surface")
}

fn kernel() -> Kernel {
    Kernel::new(
        KernelIdentity {
            kernel_id: "personal-kernel:offline".into(),
            owner_subject_ref: "subject:owner-1".into(),
            principal_ref: "principal:personal-agent-1".into(),
            personal_agent_pack_ref: "pack:owner-1".into(),
            personal_agent_pack_sha256: sha('d'),
        },
        Constitution::strict("constitution:owner-1", "policy:amend-1").expect("constitution"),
        vec![],
        vec![AutonomyState {
            capability_ref: "capability:offline-effect".into(),
            level: AutonomyLevel::RequestEffect,
            surface: surface(),
            successful_receipts: 0,
            failed_receipts: 0,
        }],
        11,
    )
    .expect("kernel")
}

fn envelope_input(envelope_ref: &str, expires_at_unix_s: u64) -> OfflineEnvelopeInput {
    OfflineEnvelopeInput {
        envelope_ref: envelope_ref.into(),
        parent_grant_ref: "grant:offline-parent".into(),
        owner_subject_ref: "subject:owner-1".into(),
        target_device_ref: "device:phone-1".into(),
        plan_digest: sha('e'),
        node_id: "node:offline-effect".into(),
        capability_ref: "capability:offline-effect".into(),
        revocation_epoch: 11,
        expires_at_unix_s,
        max_effects: 2,
        budget_limits: vec![BudgetRequest {
            budget_id: "budget:offline-actions".into(),
            amount: 2,
            currency: None,
        }],
        runtime_surface: surface(),
        no_delegation: true,
    }
}

#[derive(Default)]
struct OfflinePort {
    calls: usize,
}

impl EffectPort for OfflinePort {
    fn execute(
        &mut self,
        effect: &axiom_personal_agent_kernel_rust_lab::AuthorizedEffect,
    ) -> KernelResult<EffectReceipt> {
        self.calls += 1;
        Ok(EffectReceipt {
            receipt_ref: format!("receipt:offline-{}", self.calls),
            grant_ref: effect.grant_ref().into(),
            plan_digest: effect.plan_digest().into(),
            node_id: effect.node_id().into(),
            capability_ref: effect.capability_ref().into(),
            effect_digest: sha(if self.calls == 1 { 'f' } else { '9' }),
            success: true,
        })
    }
}

#[test]
fn offline_envelope_is_device_surface_epoch_budget_and_count_bound() {
    let kernel = kernel();
    let mut registry = OfflineEnvelopeRegistry::new();
    let mut ledger = registry
        .import_from_trusted_mesh_adapter(envelope_input(
            "offline-envelope:1",
            NOW + 120,
        ))
        .expect("trusted offline envelope");
    let mut port = OfflinePort::default();
    let request = [BudgetRequest {
        budget_id: "budget:offline-actions".into(),
        amount: 1,
        currency: None,
    }];

    let first = kernel
        .execute_offline_authorized(
            &mut ledger,
            "device:phone-1",
            &surface(),
            NOW,
            &request,
            &mut port,
        )
        .expect("first offline effect");
    assert_eq!(first.sequence, 1);
    assert_eq!(ledger.effects_consumed(), 1);
    assert_eq!(ledger.remaining_effects(), 1);
    assert!(ledger.requires_reconciliation());

    let second = kernel
        .execute_offline_authorized(
            &mut ledger,
            "device:phone-1",
            &surface(),
            NOW + 1,
            &request,
            &mut port,
        )
        .expect("second offline effect");
    assert_eq!(second.sequence, 2);
    assert_eq!(ledger.remaining_effects(), 0);

    assert!(kernel
        .execute_offline_authorized(
            &mut ledger,
            "device:phone-1",
            &surface(),
            NOW + 2,
            &request,
            &mut port,
        )
        .is_err());
    assert_eq!(port.calls, 2);

    let partial = kernel
        .reconcile_offline_receipts(&ledger, std::slice::from_ref(&first))
        .expect("partial reconciliation");
    assert!(!partial.complete);
    assert_eq!(partial.missing_sequences, vec![2]);
    assert!(!partial.grants_authority());

    let complete = kernel
        .reconcile_offline_receipts(&ledger, &[first, second])
        .expect("complete reconciliation");
    assert!(complete.complete);
    assert!(complete.missing_sequences.is_empty());
    assert!(!complete.grants_authority());
}

#[test]
fn offline_envelope_replay_wrong_device_surface_and_expiry_fail_closed() {
    let kernel = kernel();
    let mut registry = OfflineEnvelopeRegistry::new();
    let mut ledger = registry
        .import_from_trusted_mesh_adapter(envelope_input(
            "offline-envelope:replay",
            NOW + 120,
        ))
        .expect("first import");

    assert!(registry
        .import_from_trusted_mesh_adapter(envelope_input(
            "offline-envelope:replay",
            NOW + 120,
        ))
        .is_err());

    let request = [BudgetRequest {
        budget_id: "budget:offline-actions".into(),
        amount: 1,
        currency: None,
    }];
    let mut port = OfflinePort::default();

    assert!(kernel
        .execute_offline_authorized(
            &mut ledger,
            "device:desktop-1",
            &surface(),
            NOW,
            &request,
            &mut port,
        )
        .is_err());

    let drifted =
        RuntimeSurface::new(sha('0'), sha('b'), sha('c'), 9).expect("drifted surface");
    assert!(kernel
        .execute_offline_authorized(
            &mut ledger,
            "device:phone-1",
            &drifted,
            NOW,
            &request,
            &mut port,
        )
        .is_err());
    assert_eq!(ledger.effects_consumed(), 0);

    let mut expired_registry = OfflineEnvelopeRegistry::new();
    let mut expired = expired_registry
        .import_from_trusted_mesh_adapter(envelope_input(
            "offline-envelope:expired",
            NOW,
        ))
        .expect("shape-valid expired envelope");
    assert!(kernel
        .execute_offline_authorized(
            &mut expired,
            "device:phone-1",
            &surface(),
            NOW,
            &request,
            &mut port,
        )
        .is_err());
    assert_eq!(port.calls, 0);
}

#[test]
fn attestation_constrains_where_but_never_grants_authority() {
    let required = surface();
    let candidates = vec![
        ExecutionCandidate {
            node_ref: "node:eligible".into(),
            runtime_surface: required.clone(),
            attestation: AttestationEvidence {
                evidence_ref: "attestation:eligible".into(),
                verified: true,
                trust_domain_ref: "trust:owner-mesh".into(),
                attestation_epoch: 12,
            },
        },
        ExecutionCandidate {
            node_ref: "node:stale".into(),
            runtime_surface: required.clone(),
            attestation: AttestationEvidence {
                evidence_ref: "attestation:stale".into(),
                verified: true,
                trust_domain_ref: "trust:owner-mesh".into(),
                attestation_epoch: 8,
            },
        },
        ExecutionCandidate {
            node_ref: "node:unverified".into(),
            runtime_surface: required.clone(),
            attestation: AttestationEvidence {
                evidence_ref: "attestation:unverified".into(),
                verified: false,
                trust_domain_ref: "trust:owner-mesh".into(),
                attestation_epoch: 12,
            },
        },
        ExecutionCandidate {
            node_ref: "node:wrong-domain".into(),
            runtime_surface: required.clone(),
            attestation: AttestationEvidence {
                evidence_ref: "attestation:wrong-domain".into(),
                verified: true,
                trust_domain_ref: "trust:other".into(),
                attestation_epoch: 12,
            },
        },
        ExecutionCandidate {
            node_ref: "node:surface-drift".into(),
            runtime_surface: RuntimeSurface::new(sha('1'), sha('b'), sha('c'), 9)
                .expect("drifted candidate"),
            attestation: AttestationEvidence {
                evidence_ref: "attestation:surface-drift".into(),
                verified: true,
                trust_domain_ref: "trust:owner-mesh".into(),
                attestation_epoch: 12,
            },
        },
    ];

    let assessment = assess_execution_placement(
        &candidates,
        &PlacementConstraints {
            required_surface: required,
            require_verified_attestation: true,
            minimum_attestation_epoch: 10,
            allowed_trust_domains: vec!["trust:owner-mesh".into()],
        },
    )
    .expect("placement assessment");

    assert_eq!(assessment.eligible_node_refs(), vec!["node:eligible"]);
    assert!(!assessment.grants_authority());

    let stale = assessment
        .candidates
        .iter()
        .find(|candidate| candidate.node_ref == "node:stale")
        .expect("stale candidate");
    assert!(stale
        .blockers
        .contains(&"attestation-epoch-stale".to_string()));

    let unverified = assessment
        .candidates
        .iter()
        .find(|candidate| candidate.node_ref == "node:unverified")
        .expect("unverified candidate");
    assert!(unverified
        .blockers
        .contains(&"attestation-unverified".to_string()));

    let wrong_domain = assessment
        .candidates
        .iter()
        .find(|candidate| candidate.node_ref == "node:wrong-domain")
        .expect("wrong domain candidate");
    assert!(wrong_domain
        .blockers
        .contains(&"trust-domain-not-allowed".to_string()));

    let drifted = assessment
        .candidates
        .iter()
        .find(|candidate| candidate.node_ref == "node:surface-drift")
        .expect("surface drift candidate");
    assert!(drifted
        .blockers
        .contains(&"runtime-surface-mismatch".to_string()));
}
