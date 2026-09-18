use axiom_personal_agent_kernel_rust_lab::context_compiler::{
    ContextCompiler, ContextError, ContextItemInput, ContextItemState, ContextLimits,
    ContextResult, ContextSensitivity, ContextSourceKind, ContextTask, MemoryPromotionDisposition,
    MemoryPromotionGate, MemoryPromotionInput, Sha256Port,
};
use axiom_personal_agent_kernel_rust_lab::{MemoryAssessment, MemoryDisposition, MemorySourceKind};

struct TestDigest;

impl Sha256Port for TestDigest {
    fn sha256_hex(&self, canonical_preimage: &[u8]) -> ContextResult<String> {
        let mut state = 0xcbf29ce484222325_u64;
        for byte in canonical_preimage {
            state ^= u64::from(*byte);
            state = state.wrapping_mul(0x100000001b3);
        }
        Ok(format!("{state:016x}{state:016x}{state:016x}{state:016x}"))
    }
}

fn task() -> ContextTask {
    ContextTask {
        task_id: "task:compose:1".to_string(),
        owner_subject_ref: "human:owner".to_string(),
        purpose_ref: "purpose:compose".to_string(),
        capability_ref: "capability:draft".to_string(),
        instruction_set_sha256: "a".repeat(64),
        runtime_surface_sha256: "b".repeat(64),
        capability_surface_sha256: "c".repeat(64),
    }
}

fn limits() -> ContextLimits {
    ContextLimits {
        max_items: 4,
        max_estimated_tokens: 100,
        sensitivity_ceiling: ContextSensitivity::Sensitive,
        require_provenance: true,
    }
}

fn item(item_ref: &str, digest: char) -> ContextItemInput {
    ContextItemInput {
        item_ref: item_ref.to_string(),
        owner_subject_ref: "human:owner".to_string(),
        source_kind: ContextSourceKind::DurableMemory,
        content_sha256: digest.to_string().repeat(64),
        provenance_refs: vec![format!("provenance:{item_ref}")],
        estimated_tokens: 10,
        sensitivity: ContextSensitivity::OrdinaryPrivate,
        priority: 10,
        required: false,
        state: ContextItemState::Active,
        authority_bearing: false,
        secret_material_embedded: false,
    }
}

fn assessment(disposition: MemoryDisposition) -> MemoryAssessment {
    MemoryAssessment {
        candidate_id: "memory:candidate:1".to_string(),
        disposition,
        reasons: Vec::new(),
    }
}

fn promotion(source_kind: MemorySourceKind) -> MemoryPromotionInput {
    MemoryPromotionInput {
        promotion_id: "promotion:1".to_string(),
        owner_subject_ref: "human:owner".to_string(),
        candidate_id: "memory:candidate:1".to_string(),
        candidate_content_sha256: "d".repeat(64),
        source_kind,
        assessment_ref: "assessment:1".to_string(),
        assessment_sha256: "e".repeat(64),
        context_bundle_sha256: "f".repeat(64),
        provenance_refs: vec!["provenance:1".to_string()],
        evidence_refs: Vec::new(),
        causal_receipt_refs: Vec::new(),
        lineage_refs: vec!["lineage:1".to_string()],
        contradicts_memory_refs: Vec::new(),
        supersedes_memory_refs: Vec::new(),
        sensitivity: ContextSensitivity::OrdinaryPrivate,
        secret_material_embedded: false,
    }
}

#[test]
fn compile_is_deterministic_across_candidate_order() {
    let mut first = item("memory:b", 'd');
    first.priority = 20;
    let mut second = item("memory:a", 'e');
    second.priority = 5;

    let forward = ContextCompiler::compile(
        &task(),
        &limits(),
        &[first.clone(), second.clone()],
        &TestDigest,
    )
    .unwrap();
    let reverse =
        ContextCompiler::compile(&task(), &limits(), &[second, first], &TestDigest).unwrap();

    assert_eq!(forward.bundle_sha256, reverse.bundle_sha256);
    assert_eq!(forward.selected, reverse.selected);
    assert_eq!(forward.selected[0].item_ref, "memory:a");
    assert_eq!(forward.selected[1].item_ref, "memory:b");
    assert!(!forward.grants_authority());
    assert!(!forward.authorizes_execution());
    assert!(forward.requires_fresh_effect_authority());
}

#[test]
fn selected_content_change_changes_bundle_digest() {
    let original =
        ContextCompiler::compile(&task(), &limits(), &[item("memory:a", 'd')], &TestDigest)
            .unwrap();

    let changed =
        ContextCompiler::compile(&task(), &limits(), &[item("memory:a", 'e')], &TestDigest)
            .unwrap();

    assert_ne!(original.bundle_sha256, changed.bundle_sha256);
}

#[test]
fn required_blocked_context_fails_closed() {
    let mut quarantined = item("memory:q", 'd');
    quarantined.required = true;
    quarantined.state = ContextItemState::Quarantined;

    let error =
        ContextCompiler::compile(&task(), &limits(), &[quarantined], &TestDigest).unwrap_err();

    assert!(
        error
            .message()
            .contains("required context item memory:q blocked")
    );
    assert!(error.message().contains("candidate-quarantined"));
}

#[test]
fn secret_context_never_enters_bundle() {
    let mut secret = item("memory:secret", 'd');
    secret.sensitivity = ContextSensitivity::CriticalSecret;
    secret.secret_material_embedded = true;

    let bundle = ContextCompiler::compile(&task(), &limits(), &[secret], &TestDigest).unwrap();

    assert!(bundle.selected.is_empty());
    assert_eq!(bundle.omissions.len(), 1);
    assert!(
        bundle.omissions[0]
            .reasons
            .contains(&"secret-material-not-context".to_string())
    );
    assert!(!bundle.contains_secret_material());
}

#[test]
fn authority_bearing_material_is_rejected_not_omitted() {
    let mut authority = item("grant:1", 'd');
    authority.authority_bearing = true;

    let error =
        ContextCompiler::compile(&task(), &limits(), &[authority], &TestDigest).unwrap_err();

    assert_eq!(
        error.message(),
        "authority-bearing material cannot enter context: grant:1"
    );
}

#[test]
fn bounded_context_keeps_required_item_and_omits_optional_overflow() {
    let mut required = item("memory:required", 'd');
    required.required = true;
    required.estimated_tokens = 8;

    let mut optional = item("memory:optional", 'e');
    optional.estimated_tokens = 8;

    let mut tight = limits();
    tight.max_estimated_tokens = 10;

    let bundle =
        ContextCompiler::compile(&task(), &tight, &[optional, required], &TestDigest).unwrap();

    assert_eq!(bundle.selected.len(), 1);
    assert_eq!(bundle.selected[0].item_ref, "memory:required");
    assert_eq!(bundle.estimated_tokens, 8);
    assert_eq!(bundle.omissions.len(), 1);
    assert_eq!(bundle.omissions[0].item_ref, "memory:optional");
    assert_eq!(
        bundle.omissions[0].reasons,
        vec!["context-token-budget-exceeded".to_string()]
    );
}

#[test]
fn missing_provenance_is_omitted_or_fails_when_required() {
    let mut optional = item("memory:optional", 'd');
    optional.provenance_refs.clear();

    let bundle = ContextCompiler::compile(&task(), &limits(), &[optional], &TestDigest).unwrap();
    assert!(bundle.selected.is_empty());
    assert_eq!(
        bundle.omissions[0].reasons,
        vec!["provenance-required".to_string()]
    );

    let mut required = item("memory:required", 'e');
    required.required = true;
    required.provenance_refs.clear();

    let error = ContextCompiler::compile(&task(), &limits(), &[required], &TestDigest).unwrap_err();
    assert!(error.message().contains("provenance-required"));
}

#[test]
fn duplicate_context_refs_fail_closed() {
    let first = item("memory:duplicate", 'd');
    let second = item("memory:duplicate", 'e');

    let error =
        ContextCompiler::compile(&task(), &limits(), &[first, second], &TestDigest).unwrap_err();

    assert_eq!(
        error.message(),
        "duplicate context item ref: memory:duplicate"
    );
}

#[test]
fn critical_secret_cannot_be_configured_as_context_ceiling() {
    let mut unsafe_limits = limits();
    unsafe_limits.sensitivity_ceiling = ContextSensitivity::CriticalSecret;

    let error = ContextCompiler::compile(&task(), &unsafe_limits, &[], &TestDigest).unwrap_err();

    assert_eq!(
        error.message(),
        "critical-secret cannot be configured as a model context ceiling"
    );
}

#[test]
fn owner_direct_memory_can_become_write_eligible_but_is_not_written() {
    let decision = MemoryPromotionGate::assess(
        "human:owner",
        &assessment(MemoryDisposition::AdmitDurable),
        &promotion(MemorySourceKind::OwnerDirect),
        &TestDigest,
    )
    .unwrap();

    assert_eq!(
        decision.disposition,
        MemoryPromotionDisposition::EligibleForDurableWrite
    );
    assert!(decision.reasons.is_empty());
    assert!(decision.requires_separate_storage_effect());
    assert!(!decision.storage_performed());
    assert!(!decision.truth_certified());
    assert!(!decision.grants_authority());
}

#[test]
fn inferred_memory_requires_two_evidence_refs_and_a_causal_receipt() {
    let decision = MemoryPromotionGate::assess(
        "human:owner",
        &assessment(MemoryDisposition::AdmitDurable),
        &promotion(MemorySourceKind::AgentInference),
        &TestDigest,
    )
    .unwrap();

    assert_eq!(decision.disposition, MemoryPromotionDisposition::Quarantine);
    assert!(
        decision
            .reasons
            .contains(&"two-independent-evidence-refs-required".to_string())
    );
    assert!(
        decision
            .reasons
            .contains(&"causal-receipt-required".to_string())
    );
}

#[test]
fn inferred_memory_promotes_only_after_evidence_and_receipt_binding() {
    let mut candidate = promotion(MemorySourceKind::AgentInference);
    candidate.evidence_refs = vec!["evidence:1".to_string(), "evidence:2".to_string()];
    candidate.causal_receipt_refs = vec!["receipt:1".to_string()];

    let decision = MemoryPromotionGate::assess(
        "human:owner",
        &assessment(MemoryDisposition::AdmitDurable),
        &candidate,
        &TestDigest,
    )
    .unwrap();

    assert_eq!(
        decision.disposition,
        MemoryPromotionDisposition::EligibleForDurableWrite
    );
    assert!(decision.reasons.is_empty());
}

#[test]
fn promotion_gate_preserves_quarantine_and_contradictions() {
    let mut candidate = promotion(MemorySourceKind::OwnerDirect);
    candidate.contradicts_memory_refs = vec!["memory:existing:1".to_string()];

    let decision = MemoryPromotionGate::assess(
        "human:owner",
        &assessment(MemoryDisposition::Quarantine),
        &candidate,
        &TestDigest,
    )
    .unwrap();

    assert_eq!(decision.disposition, MemoryPromotionDisposition::Quarantine);
    assert!(
        decision
            .reasons
            .contains(&"memory-assessment-not-admit-durable".to_string())
    );
    assert!(
        decision
            .reasons
            .contains(&"contradiction-requires-review".to_string())
    );
}

#[test]
fn critical_secret_memory_is_routed_away_from_ordinary_promotion() {
    let mut candidate = promotion(MemorySourceKind::OwnerDirect);
    candidate.sensitivity = ContextSensitivity::CriticalSecret;
    candidate.secret_material_embedded = true;

    let decision = MemoryPromotionGate::assess(
        "human:owner",
        &assessment(MemoryDisposition::AdmitDurable),
        &candidate,
        &TestDigest,
    )
    .unwrap();

    assert_eq!(decision.disposition, MemoryPromotionDisposition::Quarantine);
    assert!(
        decision
            .reasons
            .contains(&"secret-material-requires-separate-vault-path".to_string())
    );
}

#[test]
fn promotion_owner_or_candidate_mismatch_is_an_error() {
    let owner_error = MemoryPromotionGate::assess(
        "human:other",
        &assessment(MemoryDisposition::AdmitDurable),
        &promotion(MemorySourceKind::OwnerDirect),
        &TestDigest,
    )
    .unwrap_err();
    assert_eq!(owner_error.message(), "memory promotion owner mismatch");

    let mut wrong = assessment(MemoryDisposition::AdmitDurable);
    wrong.candidate_id = "memory:other".to_string();
    let candidate_error = MemoryPromotionGate::assess(
        "human:owner",
        &wrong,
        &promotion(MemorySourceKind::OwnerDirect),
        &TestDigest,
    )
    .unwrap_err();
    assert_eq!(
        candidate_error.message(),
        "memory assessment candidate does not match promotion candidate"
    );
}

#[test]
fn invalid_digest_port_result_fails_closed() {
    struct BrokenDigest;
    impl Sha256Port for BrokenDigest {
        fn sha256_hex(&self, _canonical_preimage: &[u8]) -> Result<String, ContextError> {
            Ok("broken".to_string())
        }
    }

    let error =
        ContextCompiler::compile(&task(), &limits(), &[item("memory:a", 'd')], &BrokenDigest)
            .unwrap_err();

    assert_eq!(error.message(), "invalid context bundle sha256");
}
