use axiom_personal_agent_kernel_rust_lab::{
    BudgetRequest, Constitution, EffectPort, EffectReceipt, Kernel, KernelIdentity, KernelResult,
    OfflineEnvelopeInput, OfflineEnvelopeRegistry, RuntimeSurface,
};
use axiom_personal_kernel_durable_offline_adapter_lab::{
    DurableOfflineError, DurableOfflineExecution, execute_durable_offline, persist_prepared_intent,
    recover_or_register,
};
use axiom_personal_kernel_offline_journal_lab::OfflineJournal;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const NOW: u64 = 1_789_733_000;

fn sha(ch: char) -> String {
    std::iter::repeat_n(ch, 64).collect()
}

fn surface() -> RuntimeSurface {
    RuntimeSurface::new(sha('a'), sha('b'), sha('c'), 4).expect("surface")
}

fn kernel() -> Kernel {
    Kernel::new(
        KernelIdentity {
            kernel_id: "personal-kernel:durable-offline".into(),
            owner_subject_ref: "subject:owner-1".into(),
            principal_ref: "principal:personal-agent-1".into(),
            personal_agent_pack_ref: "pack:owner-1".into(),
            personal_agent_pack_sha256: sha('d'),
        },
        Constitution::strict("constitution:owner-1", "policy:amend-1").expect("constitution"),
        vec![],
        vec![],
        12,
    )
    .expect("kernel")
}

fn envelope() -> OfflineEnvelopeInput {
    OfflineEnvelopeInput {
        envelope_ref: "offline-envelope:durable-1".into(),
        parent_grant_ref: "grant:offline-parent".into(),
        owner_subject_ref: "subject:owner-1".into(),
        target_device_ref: "device:phone-1".into(),
        plan_digest: sha('e'),
        node_id: "node:offline-effect".into(),
        capability_ref: "capability:offline-effect".into(),
        revocation_epoch: 12,
        expires_at_unix_s: NOW + 10_000,
        max_effects: 3,
        budget_limits: vec![BudgetRequest {
            budget_id: "budget:offline-actions".into(),
            amount: 2,
            currency: None,
        }],
        runtime_surface: surface(),
        no_delegation: true,
    }
}

fn request() -> Vec<BudgetRequest> {
    vec![BudgetRequest {
        budget_id: "budget:offline-actions".into(),
        amount: 1,
        currency: None,
    }]
}

fn temp_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "axiom-durable-offline-{name}-{}-{nonce}.log",
        std::process::id()
    ))
}

#[derive(Default)]
struct Port {
    calls: usize,
}

impl EffectPort for Port {
    fn execute(
        &mut self,
        effect: &axiom_personal_agent_kernel_rust_lab::AuthorizedEffect,
    ) -> KernelResult<EffectReceipt> {
        self.calls += 1;
        Ok(EffectReceipt {
            receipt_ref: format!("receipt:durable-{}", self.calls),
            grant_ref: effect.grant_ref().into(),
            plan_digest: effect.plan_digest().into(),
            node_id: effect.node_id().into(),
            capability_ref: effect.capability_ref().into(),
            effect_digest: sha(if self.calls % 2 == 1 { 'f' } else { '9' }),
            success: true,
        })
    }
}

#[test]
fn durable_offline_state_rehydrates_effect_and_budget_consumption_after_restart() {
    let path = temp_path("restart");
    let kernel = kernel();

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("import envelope");
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        assert_eq!(
            recover_or_register(&kernel, &mut ledger, &mut journal).expect("register"),
            0
        );

        let mut port = Port::default();
        let current_surface = surface();
        let budget_requests = request();
        let receipt = execute_durable_offline(
            &kernel,
            &mut ledger,
            &mut journal,
            DurableOfflineExecution {
                target_device_ref: "device:phone-1",
                current_surface: &current_surface,
                now_unix_s: NOW,
                budget_requests: &budget_requests,
            },
            &mut port,
        )
        .expect("first durable effect");
        assert_eq!(receipt.sequence, 1);
        assert_eq!(ledger.effects_consumed(), 1);
        assert_eq!(journal.consumed_sequence(ledger.envelope_ref()), Some(1));
        assert_eq!(port.calls, 1);
    }

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("reimport signed envelope");
        let mut journal = OfflineJournal::open(&path).expect("reopen journal");

        assert_eq!(
            recover_or_register(&kernel, &mut ledger, &mut journal).expect("rehydrate"),
            1
        );
        assert_eq!(ledger.effects_consumed(), 1);
        assert_eq!(ledger.remaining_effects(), 2);

        let mut port = Port::default();
        let current_surface = surface();
        let budget_requests = request();
        let receipt = execute_durable_offline(
            &kernel,
            &mut ledger,
            &mut journal,
            DurableOfflineExecution {
                target_device_ref: "device:phone-1",
                current_surface: &current_surface,
                now_unix_s: NOW + 1,
                budget_requests: &budget_requests,
            },
            &mut port,
        )
        .expect("second durable effect");
        assert_eq!(receipt.sequence, 2);
        assert_eq!(ledger.effects_consumed(), 2);
        assert_eq!(journal.consumed_sequence(ledger.envelope_ref()), Some(2));
        assert_eq!(port.calls, 1);
        assert_eq!(ledger.remaining_effects(), 1);

        assert!(
            execute_durable_offline(
                &kernel,
                &mut ledger,
                &mut journal,
                DurableOfflineExecution {
                    target_device_ref: "device:phone-1",
                    current_surface: &surface(),
                    now_unix_s: NOW + 2,
                    budget_requests: &request(),
                },
                &mut port,
            )
            .is_err(),
            "rehydrated budget consumption must block a third effect"
        );
        assert_eq!(port.calls, 1);
        assert_eq!(journal.consumed_sequence(ledger.envelope_ref()), Some(2));
    }

    std::fs::remove_file(path).ok();
}

#[test]
fn crash_after_durable_reservation_but_before_effect_does_not_reuse_sequence() {
    let path = temp_path("crash-window");
    let kernel = kernel();

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("import envelope");
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        recover_or_register(&kernel, &mut ledger, &mut journal).expect("register");

        let intent = kernel
            .prepare_offline_consumption(&ledger, "device:phone-1", &surface(), NOW, &request())
            .expect("prepare first intent");
        assert_eq!(intent.sequence, 1);
        assert!(!intent.grants_authority());

        persist_prepared_intent(&mut journal, &intent).expect("durably reserve sequence 1");
        assert_eq!(journal.consumed_sequence(ledger.envelope_ref()), Some(1));
        assert_eq!(ledger.effects_consumed(), 0);
        // Simulated crash occurs here: no semantic commit and no EffectPort call.
    }

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("reimport envelope");
        let mut journal = OfflineJournal::open(&path).expect("reopen journal");
        recover_or_register(&kernel, &mut ledger, &mut journal)
            .expect("replay the durably reserved-but-not-executed sequence");

        assert_eq!(ledger.effects_consumed(), 1);

        let mut port = Port::default();
        let current_surface = surface();
        let budget_requests = request();
        let next = execute_durable_offline(
            &kernel,
            &mut ledger,
            &mut journal,
            DurableOfflineExecution {
                target_device_ref: "device:phone-1",
                current_surface: &current_surface,
                now_unix_s: NOW + 1,
                budget_requests: &budget_requests,
            },
            &mut port,
        )
        .expect("next effect must advance rather than reuse sequence 1");
        assert_eq!(next.sequence, 2);
        assert_eq!(port.calls, 1);
    }

    std::fs::remove_file(path).ok();
}

#[test]
fn journal_registration_refuses_same_reference_with_different_envelope_binding() {
    let path = temp_path("binding-mismatch");
    let kernel = kernel();

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("import envelope");
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        recover_or_register(&kernel, &mut ledger, &mut journal)
            .expect("register original envelope binding");
    }

    {
        let mut changed = envelope();
        changed.max_effects = 2;

        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(changed)
            .expect("shape-valid changed envelope");
        let mut journal = OfflineJournal::open(&path).expect("reopen journal");

        assert!(matches!(
            recover_or_register(&kernel, &mut ledger, &mut journal),
            Err(DurableOfflineError::EnvelopeBindingMismatch)
        ));
        assert_eq!(ledger.effects_consumed(), 0);
    }

    std::fs::remove_file(path).ok();
}

#[test]
fn journal_payload_without_valid_core_intent_never_becomes_authority() {
    let path = temp_path("invalid-payload");
    let kernel = kernel();

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("import envelope");
        let mut journal = OfflineJournal::open(&path).expect("open journal");
        recover_or_register(&kernel, &mut ledger, &mut journal).expect("register");
        journal
            .consume_effect(ledger.envelope_ref(), 1, b"{}")
            .expect("journal can durably hold opaque bytes");
    }

    {
        let mut registry = OfflineEnvelopeRegistry::new();
        let mut ledger = registry
            .import_from_trusted_mesh_adapter(envelope())
            .expect("reimport envelope");
        let mut journal = OfflineJournal::open(&path).expect("reopen journal");
        assert!(matches!(
            recover_or_register(&kernel, &mut ledger, &mut journal),
            Err(DurableOfflineError::InvalidPayload) | Err(DurableOfflineError::SchemaMismatch)
        ));
        assert_eq!(ledger.effects_consumed(), 0);
    }

    std::fs::remove_file(path).ok();
}
