use axiom_personal_agent_kernel_rust_lab::{
    assess_strict_component_host, AmbientCapability, AuthorityBudget, AutonomyLevel, AutonomyState,
    BudgetDimension, BudgetRequest, ComponentManifest, Constitution, EffectClass, Kernel,
    KernelIdentity, Plan, PlanNode, Reversibility, RuntimeSurface,
};

const NOW: u64 = 1_789_733_000;

fn sha(ch: char) -> String {
    std::iter::repeat_n(ch, 64).collect()
}

fn surface() -> RuntimeSurface {
    RuntimeSurface::new(sha('a'), sha('b'), sha('c'), 1).expect("surface")
}

fn kernel() -> Kernel {
    Kernel::new(
        KernelIdentity {
            kernel_id: "personal-kernel:host-test".into(),
            owner_subject_ref: "subject:owner-1".into(),
            principal_ref: "principal:personal-agent-1".into(),
            personal_agent_pack_ref: "pack:owner-1".into(),
            personal_agent_pack_sha256: sha('d'),
        },
        Constitution::strict("constitution:owner-1", "policy:amend-1").expect("constitution"),
        vec![AuthorityBudget {
            budget_id: "budget:actions".into(),
            capability_ref: "capability:effect".into(),
            dimension: BudgetDimension::Actions,
            ceiling: 4,
            consumed: 0,
            currency: None,
            valid_from_unix_s: NOW - 10,
            expires_at_unix_s: NOW + 100,
        }],
        vec![AutonomyState {
            capability_ref: "capability:effect".into(),
            level: AutonomyLevel::RequestEffect,
            surface: surface(),
            successful_receipts: 0,
            failed_receipts: 0,
        }],
        3,
    )
    .expect("kernel")
}

#[test]
fn strict_component_host_has_no_ambient_authority() {
    let allowed = assess_strict_component_host(&ComponentManifest {
        component_id: "component:skill-1".into(),
        imports: vec![
            "axiom:personal-kernel/mesh-authority".into(),
            "axiom:personal-kernel/effect-host".into(),
        ],
        requested_ambient_capabilities: vec![],
    })
    .expect("assessment");
    assert!(allowed.allowed);
    assert!(allowed.blockers.is_empty());
    assert!(!allowed.grants_authority());

    let denied = assess_strict_component_host(&ComponentManifest {
        component_id: "component:skill-2".into(),
        imports: vec![
            "axiom:personal-kernel/effect-host".into(),
            "wasi:sockets/tcp".into(),
        ],
        requested_ambient_capabilities: vec![
            AmbientCapability::Network,
            AmbientCapability::Environment,
            AmbientCapability::CredentialStore,
        ],
    })
    .expect("assessment");

    assert!(!denied.allowed);
    assert!(denied
        .blockers
        .contains(&"ambient-capability-denied:network".to_string()));
    assert!(denied
        .blockers
        .contains(&"ambient-capability-denied:environment".to_string()));
    assert!(denied
        .blockers
        .contains(&"ambient-capability-denied:credential-store".to_string()));
    assert!(denied
        .blockers
        .contains(&"unapproved-component-import:wasi:sockets/tcp".to_string()));
    assert!(!denied.grants_authority());
}

#[test]
fn mesh_adapter_request_is_exact_inert_and_stale_epoch_denied() {
    let kernel = kernel();
    let compiled = kernel
        .compile_plan(
            Plan {
                plan_id: "plan:effect-1".into(),
                owner_subject_ref: "subject:owner-1".into(),
                plan_digest: sha('e'),
                nodes: vec![PlanNode {
                    node_id: "node:effect-1".into(),
                    depends_on: vec![],
                    capability_ref: "capability:effect".into(),
                    requested_autonomy: AutonomyLevel::RequestEffect,
                    effect_class: EffectClass::ExternalMutation,
                    reversibility: Reversibility::Compensatable,
                    owner_confirmation_ref: None,
                    budget_requests: vec![BudgetRequest {
                        budget_id: "budget:actions".into(),
                        amount: 1,
                        currency: None,
                    }],
                    uses_quarantined_memory: false,
                }],
            },
            NOW,
            &surface(),
        )
        .expect("compile");
    let shadow = kernel.shadow(&compiled).expect("shadow");
    let request = kernel
        .authority_requests(&compiled, &shadow)
        .expect("authority requests")
        .remove(0);

    let adapter = kernel
        .build_mesh_adapter_request(&request)
        .expect("exact adapter request");
    assert_eq!(
        adapter.schema,
        "axiom-personal-kernel-mesh-adapter-request.v0"
    );
    assert_eq!(adapter.kernel_id, "personal-kernel:host-test");
    assert_eq!(adapter.principal_ref, "principal:personal-agent-1");
    assert_eq!(adapter.owner_subject_ref, request.owner_subject_ref);
    assert_eq!(adapter.plan_digest, request.plan_digest);
    assert_eq!(adapter.node_id, request.node_id);
    assert_eq!(adapter.capability_ref, request.capability_ref);
    assert_eq!(adapter.revocation_epoch, 3);
    assert!(adapter.requires_existing_mesh_verification());
    assert!(!adapter.grants_authority());

    let mut stale = request;
    stale.revocation_epoch = 2;
    assert!(kernel.build_mesh_adapter_request(&stale).is_err());
}
