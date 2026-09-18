#![forbid(unsafe_code)]

use crate::{MemoryAssessment, MemoryDisposition, MemorySourceKind};
use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextError {
    message: String,
}

impl ContextError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl Display for ContextError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for ContextError {}

pub type ContextResult<T> = Result<T, ContextError>;

pub trait Sha256Port {
    fn sha256_hex(&self, canonical_preimage: &[u8]) -> ContextResult<String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContextSensitivity {
    Public,
    OrdinaryPrivate,
    Sensitive,
    Restricted,
    CriticalSecret,
}

impl ContextSensitivity {
    fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::OrdinaryPrivate => "ordinary-private",
            Self::Sensitive => "sensitive",
            Self::Restricted => "restricted",
            Self::CriticalSecret => "critical-secret",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContextSourceKind {
    Instruction,
    DurableMemory,
    ToolState,
    Evidence,
    Skill,
    Artifact,
}

impl ContextSourceKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Instruction => "instruction",
            Self::DurableMemory => "durable-memory",
            Self::ToolState => "tool-state",
            Self::Evidence => "evidence",
            Self::Skill => "skill",
            Self::Artifact => "artifact",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContextItemState {
    Active,
    Quarantined,
    Stale,
    Superseded,
}

impl ContextItemState {
    fn blocker(self) -> Option<&'static str> {
        match self {
            Self::Active => None,
            Self::Quarantined => Some("candidate-quarantined"),
            Self::Stale => Some("candidate-stale"),
            Self::Superseded => Some("candidate-superseded"),
        }
    }

}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextTask {
    pub task_id: String,
    pub owner_subject_ref: String,
    pub purpose_ref: String,
    pub capability_ref: String,
    pub instruction_set_sha256: String,
    pub runtime_surface_sha256: String,
    pub capability_surface_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextLimits {
    pub max_items: usize,
    pub max_estimated_tokens: u64,
    pub sensitivity_ceiling: ContextSensitivity,
    pub require_provenance: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextItemInput {
    pub item_ref: String,
    pub owner_subject_ref: String,
    pub source_kind: ContextSourceKind,
    pub content_sha256: String,
    pub provenance_refs: Vec<String>,
    pub estimated_tokens: u64,
    pub sensitivity: ContextSensitivity,
    pub priority: u16,
    pub required: bool,
    pub state: ContextItemState,
    pub authority_bearing: bool,
    pub secret_material_embedded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextBinding {
    pub item_ref: String,
    pub source_kind: ContextSourceKind,
    pub content_sha256: String,
    pub provenance_refs: Vec<String>,
    pub estimated_tokens: u64,
    pub sensitivity: ContextSensitivity,
    pub priority: u16,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextOmission {
    pub item_ref: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextBundle {
    pub task: ContextTask,
    pub limits: ContextLimits,
    pub selected: Vec<ContextBinding>,
    pub omissions: Vec<ContextOmission>,
    pub estimated_tokens: u64,
    pub bundle_sha256: String,
}

impl ContextBundle {
    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn contains_secret_material(&self) -> bool {
        false
    }

    pub fn performs_network_effect(&self) -> bool {
        false
    }

    pub fn performs_storage_effect(&self) -> bool {
        false
    }

    pub fn authorizes_execution(&self) -> bool {
        false
    }

    pub fn requires_fresh_effect_authority(&self) -> bool {
        true
    }
}

pub struct ContextCompiler;

impl ContextCompiler {
    pub fn compile(
        task: &ContextTask,
        limits: &ContextLimits,
        candidates: &[ContextItemInput],
        digest_port: &impl Sha256Port,
    ) -> ContextResult<ContextBundle> {
        validate_task(task)?;
        validate_limits(limits)?;

        let mut seen = BTreeSet::new();
        let mut eligible = Vec::<ContextItemInput>::new();
        let mut omissions = Vec::<ContextOmission>::new();

        for candidate in candidates {
            validate_candidate_shape(candidate)?;

            if !seen.insert(candidate.item_ref.clone()) {
                return Err(ContextError::new(format!(
                    "duplicate context item ref: {}",
                    candidate.item_ref
                )));
            }

            if candidate.owner_subject_ref != task.owner_subject_ref {
                return Err(ContextError::new(format!(
                    "context item owner mismatch: {}",
                    candidate.item_ref
                )));
            }

            if candidate.authority_bearing {
                return Err(ContextError::new(format!(
                    "authority-bearing material cannot enter context: {}",
                    candidate.item_ref
                )));
            }

            let mut reasons = BTreeSet::<String>::new();

            if let Some(reason) = candidate.state.blocker() {
                reasons.insert(reason.to_string());
            }

            if candidate.secret_material_embedded
                || candidate.sensitivity == ContextSensitivity::CriticalSecret
            {
                reasons.insert("secret-material-not-context".to_string());
            }

            if candidate.sensitivity > limits.sensitivity_ceiling {
                reasons.insert("sensitivity-ceiling-exceeded".to_string());
            }

            if limits.require_provenance && candidate.provenance_refs.is_empty() {
                reasons.insert("provenance-required".to_string());
            }

            if reasons.is_empty() {
                let mut normalized = candidate.clone();
                normalized.provenance_refs.sort();
                eligible.push(normalized);
            } else if candidate.required {
                return Err(ContextError::new(format!(
                    "required context item {} blocked: {}",
                    candidate.item_ref,
                    reasons.into_iter().collect::<Vec<_>>().join(",")
                )));
            } else {
                omissions.push(ContextOmission {
                    item_ref: candidate.item_ref.clone(),
                    reasons: reasons.into_iter().collect(),
                });
            }
        }

        eligible.sort_by(|left, right| {
            right
                .required
                .cmp(&left.required)
                .then(left.priority.cmp(&right.priority))
                .then(left.item_ref.cmp(&right.item_ref))
        });

        let mut selected = Vec::<ContextBinding>::new();
        let mut estimated_tokens = 0_u64;

        for candidate in eligible {
            let count_fits = selected.len() < limits.max_items;
            let next_tokens = estimated_tokens
                .checked_add(candidate.estimated_tokens)
                .ok_or_else(|| ContextError::new("context token estimate overflow"))?;
            let tokens_fit = next_tokens <= limits.max_estimated_tokens;

            if !count_fits || !tokens_fit {
                let reason = if !count_fits {
                    "context-item-budget-exceeded"
                } else {
                    "context-token-budget-exceeded"
                };

                if candidate.required {
                    return Err(ContextError::new(format!(
                        "required context item {} does not fit bounded context: {}",
                        candidate.item_ref, reason
                    )));
                }

                omissions.push(ContextOmission {
                    item_ref: candidate.item_ref,
                    reasons: vec![reason.to_string()],
                });
                continue;
            }

            estimated_tokens = next_tokens;
            selected.push(ContextBinding {
                item_ref: candidate.item_ref,
                source_kind: candidate.source_kind,
                content_sha256: candidate.content_sha256,
                provenance_refs: candidate.provenance_refs,
                estimated_tokens: candidate.estimated_tokens,
                sensitivity: candidate.sensitivity,
                priority: candidate.priority,
                required: candidate.required,
            });
        }

        omissions.sort_by(|left, right| left.item_ref.cmp(&right.item_ref));

        let mut bundle = ContextBundle {
            task: task.clone(),
            limits: limits.clone(),
            selected,
            omissions,
            estimated_tokens,
            bundle_sha256: String::new(),
        };

        let canonical = canonical_context_preimage(&bundle);
        let digest = digest_port.sha256_hex(canonical.as_bytes())?;
        require_sha256(&digest, "context bundle sha256")?;
        bundle.bundle_sha256 = digest;

        Ok(bundle)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryPromotionInput {
    pub promotion_id: String,
    pub owner_subject_ref: String,
    pub candidate_id: String,
    pub candidate_content_sha256: String,
    pub source_kind: MemorySourceKind,
    pub assessment_ref: String,
    pub assessment_sha256: String,
    pub context_bundle_sha256: String,
    pub provenance_refs: Vec<String>,
    pub evidence_refs: Vec<String>,
    pub causal_receipt_refs: Vec<String>,
    pub lineage_refs: Vec<String>,
    pub contradicts_memory_refs: Vec<String>,
    pub supersedes_memory_refs: Vec<String>,
    pub sensitivity: ContextSensitivity,
    pub secret_material_embedded: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryPromotionDisposition {
    EligibleForDurableWrite,
    Quarantine,
}

impl MemoryPromotionDisposition {
    fn as_str(self) -> &'static str {
        match self {
            Self::EligibleForDurableWrite => "eligible-for-durable-write",
            Self::Quarantine => "quarantine",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryPromotionDecision {
    pub promotion_id: String,
    pub candidate_id: String,
    pub candidate_content_sha256: String,
    pub context_bundle_sha256: String,
    pub disposition: MemoryPromotionDisposition,
    pub reasons: Vec<String>,
    pub decision_sha256: String,
}

impl MemoryPromotionDecision {
    pub fn truth_certified(&self) -> bool {
        false
    }

    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn storage_performed(&self) -> bool {
        false
    }

    pub fn requires_separate_storage_effect(&self) -> bool {
        self.disposition == MemoryPromotionDisposition::EligibleForDurableWrite
    }
}

pub struct MemoryPromotionGate;

impl MemoryPromotionGate {
    pub fn assess(
        expected_owner_subject_ref: &str,
        assessment: &MemoryAssessment,
        input: &MemoryPromotionInput,
        digest_port: &impl Sha256Port,
    ) -> ContextResult<MemoryPromotionDecision> {
        require_id(expected_owner_subject_ref, "expected owner subject ref")?;
        validate_promotion_input(input)?;

        if input.owner_subject_ref != expected_owner_subject_ref {
            return Err(ContextError::new("memory promotion owner mismatch"));
        }

        if assessment.candidate_id != input.candidate_id {
            return Err(ContextError::new(
                "memory assessment candidate does not match promotion candidate",
            ));
        }

        let mut reasons = BTreeSet::<String>::new();

        if assessment.disposition != MemoryDisposition::AdmitDurable || !assessment.reasons.is_empty()
        {
            reasons.insert("memory-assessment-not-admit-durable".to_string());
        }

        if input.provenance_refs.is_empty() {
            reasons.insert("promotion-provenance-required".to_string());
        }

        if input.lineage_refs.is_empty() {
            reasons.insert("promotion-lineage-required".to_string());
        }

        if !input.contradicts_memory_refs.is_empty() {
            reasons.insert("contradiction-requires-review".to_string());
        }

        match input.source_kind {
            MemorySourceKind::OwnerDirect | MemorySourceKind::SignedLocalArtifact => {}
            MemorySourceKind::VerifiedRemoteArtifact | MemorySourceKind::ThirdParty => {
                if input.evidence_refs.is_empty() {
                    reasons.insert("independent-evidence-required".to_string());
                }
            }
            MemorySourceKind::AgentInference | MemorySourceKind::ImportedMemory => {
                if input.evidence_refs.len() < 2 {
                    reasons.insert("two-independent-evidence-refs-required".to_string());
                }
                if input.causal_receipt_refs.is_empty() {
                    reasons.insert("causal-receipt-required".to_string());
                }
            }
        }

        if input.secret_material_embedded
            || input.sensitivity == ContextSensitivity::CriticalSecret
        {
            reasons.insert("secret-material-requires-separate-vault-path".to_string());
        }

        let disposition = if reasons.is_empty() {
            MemoryPromotionDisposition::EligibleForDurableWrite
        } else {
            MemoryPromotionDisposition::Quarantine
        };

        let reasons: Vec<String> = reasons.into_iter().collect();
        let canonical = canonical_promotion_preimage(input, disposition, &reasons);
        let decision_sha256 = digest_port.sha256_hex(canonical.as_bytes())?;
        require_sha256(&decision_sha256, "memory promotion decision sha256")?;

        Ok(MemoryPromotionDecision {
            promotion_id: input.promotion_id.clone(),
            candidate_id: input.candidate_id.clone(),
            candidate_content_sha256: input.candidate_content_sha256.clone(),
            context_bundle_sha256: input.context_bundle_sha256.clone(),
            disposition,
            reasons,
            decision_sha256,
        })
    }
}

fn validate_task(task: &ContextTask) -> ContextResult<()> {
    require_id(&task.task_id, "context task id")?;
    require_id(&task.owner_subject_ref, "context owner subject ref")?;
    require_id(&task.purpose_ref, "context purpose ref")?;
    require_id(&task.capability_ref, "context capability ref")?;
    require_sha256(&task.instruction_set_sha256, "instruction set sha256")?;
    require_sha256(&task.runtime_surface_sha256, "runtime surface sha256")?;
    require_sha256(
        &task.capability_surface_sha256,
        "capability surface sha256",
    )
}

fn validate_limits(limits: &ContextLimits) -> ContextResult<()> {
    if limits.max_items == 0 {
        return Err(ContextError::new("context max_items must be greater than zero"));
    }
    if limits.max_estimated_tokens == 0 {
        return Err(ContextError::new(
            "context max_estimated_tokens must be greater than zero",
        ));
    }
    if limits.sensitivity_ceiling == ContextSensitivity::CriticalSecret {
        return Err(ContextError::new(
            "critical-secret cannot be configured as a model context ceiling",
        ));
    }
    Ok(())
}

fn validate_candidate_shape(candidate: &ContextItemInput) -> ContextResult<()> {
    require_id(&candidate.item_ref, "context item ref")?;
    require_id(&candidate.owner_subject_ref, "context item owner subject ref")?;
    require_sha256(&candidate.content_sha256, "context item content sha256")?;
    require_unique_ids(&candidate.provenance_refs, "context provenance ref")?;
    if candidate.estimated_tokens == 0 {
        return Err(ContextError::new(format!(
            "context item {} must have a non-zero token estimate",
            candidate.item_ref
        )));
    }
    Ok(())
}

fn validate_promotion_input(input: &MemoryPromotionInput) -> ContextResult<()> {
    require_id(&input.promotion_id, "memory promotion id")?;
    require_id(&input.owner_subject_ref, "memory promotion owner subject ref")?;
    require_id(&input.candidate_id, "memory promotion candidate id")?;
    require_id(&input.assessment_ref, "memory assessment ref")?;
    require_sha256(
        &input.candidate_content_sha256,
        "memory promotion candidate content sha256",
    )?;
    require_sha256(&input.assessment_sha256, "memory assessment sha256")?;
    require_sha256(
        &input.context_bundle_sha256,
        "memory promotion context bundle sha256",
    )?;

    require_unique_ids(&input.provenance_refs, "memory promotion provenance ref")?;
    require_unique_ids(&input.evidence_refs, "memory promotion evidence ref")?;
    require_unique_ids(
        &input.causal_receipt_refs,
        "memory promotion causal receipt ref",
    )?;
    require_unique_ids(&input.lineage_refs, "memory promotion lineage ref")?;
    require_unique_ids(
        &input.contradicts_memory_refs,
        "memory promotion contradiction ref",
    )?;
    require_unique_ids(
        &input.supersedes_memory_refs,
        "memory promotion supersedes ref",
    )?;

    Ok(())
}

fn require_id(value: &str, label: &str) -> ContextResult<()> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(ContextError::new(format!("invalid {label}")));
    }
    Ok(())
}

fn require_sha256(value: &str, label: &str) -> ContextResult<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ContextError::new(format!("invalid {label}")));
    }
    Ok(())
}

fn require_unique_ids(values: &[String], label: &str) -> ContextResult<()> {
    let mut seen = BTreeSet::new();
    for value in values {
        require_id(value, label)?;
        if !seen.insert(value.as_str()) {
            return Err(ContextError::new(format!("duplicate {label}: {value}")));
        }
    }
    Ok(())
}

fn canonical_context_preimage(bundle: &ContextBundle) -> String {
    let mut out = String::new();
    push_field(&mut out, "schema", "axiom-personal-context-bundle.v0");
    push_field(&mut out, "task_id", &bundle.task.task_id);
    push_field(&mut out, "owner_subject_ref", &bundle.task.owner_subject_ref);
    push_field(&mut out, "purpose_ref", &bundle.task.purpose_ref);
    push_field(&mut out, "capability_ref", &bundle.task.capability_ref);
    push_field(
        &mut out,
        "instruction_set_sha256",
        &bundle.task.instruction_set_sha256,
    );
    push_field(
        &mut out,
        "runtime_surface_sha256",
        &bundle.task.runtime_surface_sha256,
    );
    push_field(
        &mut out,
        "capability_surface_sha256",
        &bundle.task.capability_surface_sha256,
    );
    push_u64(&mut out, "max_items", bundle.limits.max_items as u64);
    push_u64(
        &mut out,
        "max_estimated_tokens",
        bundle.limits.max_estimated_tokens,
    );
    push_field(
        &mut out,
        "sensitivity_ceiling",
        bundle.limits.sensitivity_ceiling.as_str(),
    );
    push_field(
        &mut out,
        "require_provenance",
        if bundle.limits.require_provenance {
            "true"
        } else {
            "false"
        },
    );

    for item in &bundle.selected {
        push_field(&mut out, "selected.item_ref", &item.item_ref);
        push_field(
            &mut out,
            "selected.source_kind",
            item.source_kind.as_str(),
        );
        push_field(
            &mut out,
            "selected.content_sha256",
            &item.content_sha256,
        );
        push_u64(
            &mut out,
            "selected.estimated_tokens",
            item.estimated_tokens,
        );
        push_field(
            &mut out,
            "selected.sensitivity",
            item.sensitivity.as_str(),
        );
        push_u64(&mut out, "selected.priority", u64::from(item.priority));
        push_field(
            &mut out,
            "selected.required",
            if item.required { "true" } else { "false" },
        );
        for reference in &item.provenance_refs {
            push_field(&mut out, "selected.provenance_ref", reference);
        }
    }

    for omission in &bundle.omissions {
        push_field(&mut out, "omission.item_ref", &omission.item_ref);
        for reason in &omission.reasons {
            push_field(&mut out, "omission.reason", reason);
        }
    }

    push_u64(
        &mut out,
        "selected.estimated_tokens.total",
        bundle.estimated_tokens,
    );
    out
}

fn canonical_promotion_preimage(
    input: &MemoryPromotionInput,
    disposition: MemoryPromotionDisposition,
    reasons: &[String],
) -> String {
    let mut out = String::new();
    push_field(
        &mut out,
        "schema",
        "axiom-personal-memory-promotion-decision.v0",
    );
    push_field(&mut out, "promotion_id", &input.promotion_id);
    push_field(&mut out, "owner_subject_ref", &input.owner_subject_ref);
    push_field(&mut out, "candidate_id", &input.candidate_id);
    push_field(
        &mut out,
        "candidate_content_sha256",
        &input.candidate_content_sha256,
    );
    push_field(
        &mut out,
        "source_kind",
        memory_source_kind_str(input.source_kind),
    );
    push_field(&mut out, "assessment_ref", &input.assessment_ref);
    push_field(
        &mut out,
        "assessment_sha256",
        &input.assessment_sha256,
    );
    push_field(
        &mut out,
        "context_bundle_sha256",
        &input.context_bundle_sha256,
    );
    push_field(&mut out, "sensitivity", input.sensitivity.as_str());

    for reference in sorted_refs(&input.provenance_refs) {
        push_field(&mut out, "provenance_ref", reference);
    }
    for reference in sorted_refs(&input.evidence_refs) {
        push_field(&mut out, "evidence_ref", reference);
    }
    for reference in sorted_refs(&input.causal_receipt_refs) {
        push_field(&mut out, "causal_receipt_ref", reference);
    }
    for reference in sorted_refs(&input.lineage_refs) {
        push_field(&mut out, "lineage_ref", reference);
    }
    for reference in sorted_refs(&input.contradicts_memory_refs) {
        push_field(&mut out, "contradicts_memory_ref", reference);
    }
    for reference in sorted_refs(&input.supersedes_memory_refs) {
        push_field(&mut out, "supersedes_memory_ref", reference);
    }

    push_field(&mut out, "disposition", disposition.as_str());
    for reason in reasons {
        push_field(&mut out, "reason", reason);
    }

    out
}

fn sorted_refs(values: &[String]) -> Vec<&str> {
    let mut refs = values.iter().map(String::as_str).collect::<Vec<_>>();
    refs.sort_unstable();
    refs
}

fn memory_source_kind_str(kind: MemorySourceKind) -> &'static str {
    match kind {
        MemorySourceKind::OwnerDirect => "owner-direct",
        MemorySourceKind::SignedLocalArtifact => "signed-local-artifact",
        MemorySourceKind::VerifiedRemoteArtifact => "verified-remote-artifact",
        MemorySourceKind::AgentInference => "agent-inference",
        MemorySourceKind::ThirdParty => "third-party",
        MemorySourceKind::ImportedMemory => "imported-memory",
    }
}

fn push_field(out: &mut String, label: &str, value: &str) {
    out.push_str(label);
    out.push('=');
    out.push_str(&value.len().to_string());
    out.push(':');
    out.push_str(value);
    out.push(';');
}

fn push_u64(out: &mut String, label: &str, value: u64) {
    push_field(out, label, &value.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    struct InvalidDigest;

    impl Sha256Port for InvalidDigest {
        fn sha256_hex(&self, _canonical_preimage: &[u8]) -> ContextResult<String> {
            Ok("not-a-sha256".to_string())
        }
    }

    #[test]
    fn digest_port_must_return_lowercase_sha256_shape() {
        let task = ContextTask {
            task_id: "task:1".to_string(),
            owner_subject_ref: "human:owner".to_string(),
            purpose_ref: "purpose:test".to_string(),
            capability_ref: "capability:test".to_string(),
            instruction_set_sha256: "a".repeat(64),
            runtime_surface_sha256: "b".repeat(64),
            capability_surface_sha256: "c".repeat(64),
        };
        let limits = ContextLimits {
            max_items: 1,
            max_estimated_tokens: 10,
            sensitivity_ceiling: ContextSensitivity::Sensitive,
            require_provenance: true,
        };
        let candidate = ContextItemInput {
            item_ref: "item:1".to_string(),
            owner_subject_ref: "human:owner".to_string(),
            source_kind: ContextSourceKind::Artifact,
            content_sha256: "d".repeat(64),
            provenance_refs: vec!["source:1".to_string()],
            estimated_tokens: 1,
            sensitivity: ContextSensitivity::Public,
            priority: 0,
            required: true,
            state: ContextItemState::Active,
            authority_bearing: false,
            secret_material_embedded: false,
        };

        let error =
            ContextCompiler::compile(&task, &limits, &[candidate], &InvalidDigest).unwrap_err();
        assert_eq!(error.message(), "invalid context bundle sha256");
    }
}
