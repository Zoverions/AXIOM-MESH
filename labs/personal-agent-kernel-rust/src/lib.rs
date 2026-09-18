#![forbid(unsafe_code)]

pub mod state_lanes;

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KernelError {
    message: String,
}

impl KernelError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl Display for KernelError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for KernelError {}

pub type KernelResult<T> = Result<T, KernelError>;

fn require_id(value: &str, label: &str) -> KernelResult<()> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(KernelError::new(format!("invalid {label}")));
    }
    Ok(())
}

fn require_sha256(value: &str, label: &str) -> KernelResult<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(KernelError::new(format!("invalid {label}")));
    }
    Ok(())
}

fn require_currency(value: &str) -> KernelResult<()> {
    if value.len() != 3 || !value.bytes().all(|byte| byte.is_ascii_uppercase()) {
        return Err(KernelError::new(
            "currency must be three uppercase ASCII letters",
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AutonomyLevel {
    Observe,
    Draft,
    Prepare,
    RequestEffect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectClass {
    Observe,
    LocalMutation,
    ExternalMutation,
    Financial,
    Credential,
    Secret,
    Delegation,
}

impl EffectClass {
    pub fn is_effectful(self) -> bool {
        self != Self::Observe
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reversibility {
    Reversible,
    Compensatable,
    Irreversible,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum BudgetDimension {
    Actions,
    WallTimeSeconds,
    ComputeMilliseconds,
    NetworkBytes,
    DataItems,
    AttentionSeconds,
    MinorCurrencyUnits,
    DelegationHops,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeSurface {
    pub model_digest: String,
    pub runtime_digest: String,
    pub capability_surface_digest: String,
    pub attestation_epoch: u64,
}

impl RuntimeSurface {
    pub fn new(
        model_digest: impl Into<String>,
        runtime_digest: impl Into<String>,
        capability_surface_digest: impl Into<String>,
        attestation_epoch: u64,
    ) -> KernelResult<Self> {
        let value = Self {
            model_digest: model_digest.into(),
            runtime_digest: runtime_digest.into(),
            capability_surface_digest: capability_surface_digest.into(),
            attestation_epoch,
        };
        require_sha256(&value.model_digest, "model digest")?;
        require_sha256(&value.runtime_digest, "runtime digest")?;
        require_sha256(
            &value.capability_surface_digest,
            "capability surface digest",
        )?;
        Ok(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KernelIdentity {
    pub kernel_id: String,
    pub owner_subject_ref: String,
    pub principal_ref: String,
    pub personal_agent_pack_ref: String,
    pub personal_agent_pack_sha256: String,
}

impl KernelIdentity {
    pub fn validate(&self) -> KernelResult<()> {
        require_id(&self.kernel_id, "kernel id")?;
        require_id(&self.owner_subject_ref, "owner subject ref")?;
        require_id(&self.principal_ref, "principal ref")?;
        require_id(&self.personal_agent_pack_ref, "personal agent pack ref")?;
        require_sha256(
            &self.personal_agent_pack_sha256,
            "personal agent pack sha256",
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constitution {
    constitution_id: String,
    amendment_policy_ref: String,
    owner_stop_right: bool,
    owner_inspect_right: bool,
    owner_revoke_right: bool,
    owner_export_right: bool,
    self_amendment_allowed: bool,
    subdelegation_may_expand_authority: bool,
    authority_may_be_inferred_from_knowledge: bool,
    memory_may_create_authority: bool,
    model_output_may_create_authority: bool,
    earned_autonomy_may_create_authority: bool,
    effect_requires_mesh_authority: bool,
}

impl Constitution {
    pub fn strict(
        constitution_id: impl Into<String>,
        amendment_policy_ref: impl Into<String>,
    ) -> KernelResult<Self> {
        let value = Self {
            constitution_id: constitution_id.into(),
            amendment_policy_ref: amendment_policy_ref.into(),
            owner_stop_right: true,
            owner_inspect_right: true,
            owner_revoke_right: true,
            owner_export_right: true,
            self_amendment_allowed: false,
            subdelegation_may_expand_authority: false,
            authority_may_be_inferred_from_knowledge: false,
            memory_may_create_authority: false,
            model_output_may_create_authority: false,
            earned_autonomy_may_create_authority: false,
            effect_requires_mesh_authority: true,
        };
        value.validate()?;
        Ok(value)
    }

    pub fn validate(&self) -> KernelResult<()> {
        require_id(&self.constitution_id, "constitution id")?;
        require_id(&self.amendment_policy_ref, "amendment policy ref")?;
        if !self.owner_stop_right
            || !self.owner_inspect_right
            || !self.owner_revoke_right
            || !self.owner_export_right
            || self.self_amendment_allowed
            || self.subdelegation_may_expand_authority
            || self.authority_may_be_inferred_from_knowledge
            || self.memory_may_create_authority
            || self.model_output_may_create_authority
            || self.earned_autonomy_may_create_authority
            || !self.effect_requires_mesh_authority
        {
            return Err(KernelError::new(
                "constitution violates fail-closed personal-kernel invariants",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityBudget {
    pub budget_id: String,
    pub capability_ref: String,
    pub dimension: BudgetDimension,
    pub ceiling: u64,
    pub consumed: u64,
    pub currency: Option<String>,
    pub valid_from_unix_s: u64,
    pub expires_at_unix_s: u64,
}

impl AuthorityBudget {
    pub fn validate(&self) -> KernelResult<()> {
        require_id(&self.budget_id, "budget id")?;
        require_id(&self.capability_ref, "budget capability ref")?;
        if self.ceiling == 0 || self.consumed > self.ceiling {
            return Err(KernelError::new("invalid budget ceiling or consumption"));
        }
        if self.valid_from_unix_s >= self.expires_at_unix_s {
            return Err(KernelError::new("invalid budget time window"));
        }
        match (self.dimension, self.currency.as_deref()) {
            (BudgetDimension::MinorCurrencyUnits, Some(currency)) => require_currency(currency)?,
            (BudgetDimension::MinorCurrencyUnits, None) => {
                return Err(KernelError::new("currency budget requires currency"));
            }
            (_, Some(_)) => {
                return Err(KernelError::new(
                    "currency is only valid for minor-currency-unit budgets",
                ));
            }
            (_, None) => {}
        }
        Ok(())
    }

    pub fn remaining(&self) -> u64 {
        self.ceiling - self.consumed
    }

    fn is_current(&self, now_unix_s: u64) -> bool {
        now_unix_s >= self.valid_from_unix_s && now_unix_s < self.expires_at_unix_s
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetRequest {
    pub budget_id: String,
    pub amount: u64,
    pub currency: Option<String>,
}

impl BudgetRequest {
    fn validate(&self) -> KernelResult<()> {
        require_id(&self.budget_id, "budget request id")?;
        if self.amount == 0 {
            return Err(KernelError::new("budget request amount must be positive"));
        }
        if let Some(currency) = self.currency.as_deref() {
            require_currency(currency)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutonomyState {
    pub capability_ref: String,
    pub level: AutonomyLevel,
    pub surface: RuntimeSurface,
    pub successful_receipts: u64,
    pub failed_receipts: u64,
}

impl AutonomyState {
    pub fn effective_level(&self, current_surface: &RuntimeSurface) -> AutonomyLevel {
        if &self.surface == current_surface {
            self.level
        } else {
            AutonomyLevel::Observe
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyProposal {
    pub proposal_id: String,
    pub owner_subject_ref: String,
    pub capability_ref: String,
    pub requested_autonomy: AutonomyLevel,
    pub budget_requests: Vec<BudgetRequest>,
    pub uses_quarantined_memory: bool,
    pub effect_requested: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyAssessment {
    pub proposal_id: String,
    pub eligible_within_personal_policy: bool,
    pub blockers: Vec<String>,
}

impl PolicyAssessment {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AmbientCapability {
    Filesystem,
    Network,
    Environment,
    WallClock,
    Process,
    CredentialStore,
}

impl AmbientCapability {
    fn label(self) -> &'static str {
        match self {
            Self::Filesystem => "filesystem",
            Self::Network => "network",
            Self::Environment => "environment",
            Self::WallClock => "wall-clock",
            Self::Process => "process",
            Self::CredentialStore => "credential-store",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComponentManifest {
    pub component_id: String,
    pub imports: Vec<String>,
    pub requested_ambient_capabilities: Vec<AmbientCapability>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ComponentHostAssessment {
    pub component_id: String,
    pub allowed: bool,
    pub blockers: Vec<String>,
}

impl ComponentHostAssessment {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

pub fn assess_strict_component_host(
    manifest: &ComponentManifest,
) -> KernelResult<ComponentHostAssessment> {
    require_id(&manifest.component_id, "component id")?;

    const ALLOWED_IMPORTS: [&str; 3] = [
        "axiom:personal-kernel/mesh-authority",
        "axiom:personal-kernel/effect-host",
        "axiom:personal-kernel/mesh-observer",
    ];

    let mut blockers = BTreeSet::<String>::new();
    let mut imports = BTreeSet::<String>::new();

    for import in &manifest.imports {
        if import.is_empty() || import.len() > 192 || !import.is_ascii() {
            return Err(KernelError::new("invalid component import"));
        }
        if !imports.insert(import.clone()) {
            return Err(KernelError::new("duplicate component import"));
        }
        if !ALLOWED_IMPORTS.contains(&import.as_str()) {
            blockers.insert(format!("unapproved-component-import:{import}"));
        }
    }

    for capability in &manifest.requested_ambient_capabilities {
        blockers.insert(format!("ambient-capability-denied:{}", capability.label()));
    }

    Ok(ComponentHostAssessment {
        component_id: manifest.component_id.clone(),
        allowed: blockers.is_empty(),
        blockers: blockers.into_iter().collect(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanNode {
    pub node_id: String,
    pub depends_on: Vec<String>,
    pub capability_ref: String,
    pub requested_autonomy: AutonomyLevel,
    pub effect_class: EffectClass,
    pub reversibility: Reversibility,
    pub owner_confirmation_ref: Option<String>,
    pub budget_requests: Vec<BudgetRequest>,
    pub uses_quarantined_memory: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub plan_id: String,
    pub owner_subject_ref: String,
    pub plan_digest: String,
    pub nodes: Vec<PlanNode>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledPlan {
    plan: Plan,
    aggregate_budget_requests: BTreeMap<String, u64>,
}

impl CompiledPlan {
    pub fn plan(&self) -> &Plan {
        &self.plan
    }

    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn aggregate_budget_amount(&self, budget_id: &str) -> Option<u64> {
        self.aggregate_budget_requests.get(budget_id).copied()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShadowReport {
    pub plan_digest: String,
    pub effect_nodes: usize,
    pub irreversible_nodes: usize,
    pub all_effects_rehearsed: bool,
    pub rollback_or_confirmation_complete: bool,
}

impl ShadowReport {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityRequest {
    pub owner_subject_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub budget_requests: Vec<BudgetRequest>,
}

impl AuthorityRequest {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshAdapterRequest {
    pub schema: &'static str,
    pub kernel_id: String,
    pub principal_ref: String,
    pub owner_subject_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub budget_requests: Vec<BudgetRequest>,
}

impl MeshAdapterRequest {
    pub fn gateway_route_id(&self) -> &'static str {
        "intents.submit"
    }

    pub fn gateway_method(&self) -> &'static str {
        "POST"
    }

    pub fn gateway_relative_path(&self) -> &'static str {
        "/v1/intents"
    }

    pub fn gateway_request_schema(&self) -> &'static str {
        "axiom-intent-request.v1"
    }

    pub fn gateway_idempotency_required(&self) -> bool {
        true
    }

    pub fn direct_internal_service_access_allowed(&self) -> bool {
        false
    }

    pub fn requires_existing_mesh_verification(&self) -> bool {
        true
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshProofInput {
    pub grant_ref: String,
    pub owner_subject_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub expires_at_unix_s: u64,
    pub max_delegation_hops: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshProof {
    grant_ref: String,
    owner_subject_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
    revocation_epoch: u64,
    expires_at_unix_s: u64,
    max_delegation_hops: u8,
}

impl MeshProof {
    /// Constructs a proof object at the explicit trusted-adapter boundary.
    ///
    /// This laboratory does not verify signatures. Production code may call this
    /// only after the existing AXIOM-MESH authority path has independently
    /// authenticated and authorized the exact request.
    pub fn from_trusted_mesh_adapter(input: MeshProofInput) -> KernelResult<Self> {
        require_id(&input.grant_ref, "grant ref")?;
        require_id(&input.owner_subject_ref, "proof owner subject ref")?;
        require_sha256(&input.plan_digest, "proof plan digest")?;
        require_id(&input.node_id, "proof node id")?;
        require_id(&input.capability_ref, "proof capability ref")?;
        Ok(Self {
            grant_ref: input.grant_ref,
            owner_subject_ref: input.owner_subject_ref,
            plan_digest: input.plan_digest,
            node_id: input.node_id,
            capability_ref: input.capability_ref,
            revocation_epoch: input.revocation_epoch,
            expires_at_unix_s: input.expires_at_unix_s,
            max_delegation_hops: input.max_delegation_hops,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedAuthority {
    grant_ref: String,
    owner_subject_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
    revocation_epoch: u64,
    budget_requests: Vec<BudgetRequest>,
    max_delegation_hops: u8,
}

impl VerifiedAuthority {
    pub fn grant_ref(&self) -> &str {
        &self.grant_ref
    }

    pub fn owner_subject_ref(&self) -> &str {
        &self.owner_subject_ref
    }

    pub fn plan_digest(&self) -> &str {
        &self.plan_digest
    }

    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    pub fn capability_ref(&self) -> &str {
        &self.capability_ref
    }

    pub fn budget_requests(&self) -> &[BudgetRequest] {
        &self.budget_requests
    }

    pub fn max_delegation_hops(&self) -> u8 {
        self.max_delegation_hops
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineEnvelopeInput {
    pub envelope_ref: String,
    pub parent_grant_ref: String,
    pub owner_subject_ref: String,
    pub target_device_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub expires_at_unix_s: u64,
    pub max_effects: u64,
    pub budget_limits: Vec<BudgetRequest>,
    pub runtime_surface: RuntimeSurface,
    pub no_delegation: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineEnvelopeBinding {
    pub envelope_ref: String,
    pub parent_grant_ref: String,
    pub owner_subject_ref: String,
    pub target_device_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub expires_at_unix_s: u64,
    pub max_effects: u64,
    pub budget_limits: Vec<BudgetRequest>,
    pub runtime_surface: RuntimeSurface,
}

impl OfflineEnvelopeBinding {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug)]
pub struct OfflineEnvelope {
    envelope_ref: String,
    parent_grant_ref: String,
    owner_subject_ref: String,
    target_device_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
    revocation_epoch: u64,
    expires_at_unix_s: u64,
    max_effects: u64,
    budget_limits: BTreeMap<String, BudgetRequest>,
    runtime_surface: RuntimeSurface,
}

#[derive(Debug, Default)]
pub struct OfflineEnvelopeRegistry {
    imported_refs: BTreeSet<String>,
}

impl OfflineEnvelopeRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn import_from_trusted_mesh_adapter(
        &mut self,
        input: OfflineEnvelopeInput,
    ) -> KernelResult<OfflineEnvelopeLedger> {
        require_id(&input.envelope_ref, "offline envelope ref")?;
        require_id(&input.parent_grant_ref, "offline parent grant ref")?;
        require_id(&input.owner_subject_ref, "offline owner subject ref")?;
        require_id(&input.target_device_ref, "offline target device ref")?;
        require_sha256(&input.plan_digest, "offline plan digest")?;
        require_id(&input.node_id, "offline node id")?;
        require_id(&input.capability_ref, "offline capability ref")?;

        if !input.no_delegation {
            return Err(KernelError::new(
                "offline envelopes must be explicitly non-delegable",
            ));
        }
        if input.max_effects == 0 {
            return Err(KernelError::new(
                "offline envelope must permit at least one bounded effect",
            ));
        }
        if input.budget_limits.is_empty() {
            return Err(KernelError::new(
                "offline envelope requires at least one bounded budget",
            ));
        }
        let mut budget_limits = BTreeMap::<String, BudgetRequest>::new();
        for request in input.budget_limits {
            request.validate()?;
            if budget_limits
                .insert(request.budget_id.clone(), request)
                .is_some()
            {
                return Err(KernelError::new(
                    "offline envelope contains duplicate budget limits",
                ));
            }
        }

        if !self.imported_refs.insert(input.envelope_ref.clone()) {
            return Err(KernelError::new(
                "offline envelope replay detected in local registry",
            ));
        }

        Ok(OfflineEnvelopeLedger {
            envelope: OfflineEnvelope {
                envelope_ref: input.envelope_ref,
                parent_grant_ref: input.parent_grant_ref,
                owner_subject_ref: input.owner_subject_ref,
                target_device_ref: input.target_device_ref,
                plan_digest: input.plan_digest,
                node_id: input.node_id,
                capability_ref: input.capability_ref,
                revocation_epoch: input.revocation_epoch,
                expires_at_unix_s: input.expires_at_unix_s,
                max_effects: input.max_effects,
                budget_limits,
                runtime_surface: input.runtime_surface,
            },
            effects_consumed: 0,
            budget_consumed: BTreeMap::new(),
        })
    }
}

#[derive(Debug)]
pub struct OfflineEnvelopeLedger {
    envelope: OfflineEnvelope,
    effects_consumed: u64,
    budget_consumed: BTreeMap<String, u64>,
}

impl OfflineEnvelopeLedger {
    pub fn envelope_ref(&self) -> &str {
        &self.envelope.envelope_ref
    }

    pub fn binding(&self) -> OfflineEnvelopeBinding {
        OfflineEnvelopeBinding {
            envelope_ref: self.envelope.envelope_ref.clone(),
            parent_grant_ref: self.envelope.parent_grant_ref.clone(),
            owner_subject_ref: self.envelope.owner_subject_ref.clone(),
            target_device_ref: self.envelope.target_device_ref.clone(),
            plan_digest: self.envelope.plan_digest.clone(),
            node_id: self.envelope.node_id.clone(),
            capability_ref: self.envelope.capability_ref.clone(),
            revocation_epoch: self.envelope.revocation_epoch,
            expires_at_unix_s: self.envelope.expires_at_unix_s,
            max_effects: self.envelope.max_effects,
            budget_limits: self.envelope.budget_limits.values().cloned().collect(),
            runtime_surface: self.envelope.runtime_surface.clone(),
        }
    }

    pub fn effects_consumed(&self) -> u64 {
        self.effects_consumed
    }

    pub fn requires_reconciliation(&self) -> bool {
        self.effects_consumed > 0
    }

    pub fn remaining_effects(&self) -> u64 {
        self.envelope.max_effects - self.effects_consumed
    }

    pub fn prepare_consumption(
        &self,
        owner_subject_ref: &str,
        current_revocation_epoch: u64,
        target_device_ref: &str,
        current_surface: &RuntimeSurface,
        now_unix_s: u64,
        budget_requests: &[BudgetRequest],
    ) -> KernelResult<OfflineConsumptionIntent> {
        if owner_subject_ref != self.envelope.owner_subject_ref {
            return Err(KernelError::new("offline envelope owner mismatch"));
        }
        if current_revocation_epoch != self.envelope.revocation_epoch {
            return Err(KernelError::new(
                "offline envelope revocation epoch is stale",
            ));
        }
        if target_device_ref != self.envelope.target_device_ref {
            return Err(KernelError::new("offline envelope target device mismatch"));
        }
        if current_surface != &self.envelope.runtime_surface {
            return Err(KernelError::new("offline envelope runtime surface drift"));
        }
        if now_unix_s >= self.envelope.expires_at_unix_s {
            return Err(KernelError::new("offline envelope is expired"));
        }
        if self.effects_consumed >= self.envelope.max_effects {
            return Err(KernelError::new("offline envelope effect count exhausted"));
        }

        let normalized = self.normalize_budget_requests(budget_requests)?;
        self.validate_budget_fit(&normalized)?;

        let sequence = self
            .effects_consumed
            .checked_add(1)
            .ok_or_else(|| KernelError::new("offline effect sequence overflow"))?;

        Ok(OfflineConsumptionIntent {
            envelope_ref: self.envelope.envelope_ref.clone(),
            sequence,
            owner_subject_ref: self.envelope.owner_subject_ref.clone(),
            target_device_ref: self.envelope.target_device_ref.clone(),
            plan_digest: self.envelope.plan_digest.clone(),
            node_id: self.envelope.node_id.clone(),
            capability_ref: self.envelope.capability_ref.clone(),
            revocation_epoch: self.envelope.revocation_epoch,
            budget_requests: normalized,
        })
    }

    pub fn commit_consumption(
        &mut self,
        intent: &OfflineConsumptionIntent,
        current_surface: &RuntimeSurface,
        now_unix_s: u64,
    ) -> KernelResult<OfflineAuthorizedEffect> {
        if current_surface != &self.envelope.runtime_surface {
            return Err(KernelError::new(
                "offline envelope runtime surface drift before commit",
            ));
        }
        if now_unix_s >= self.envelope.expires_at_unix_s {
            return Err(KernelError::new(
                "offline envelope expired before durable commit",
            ));
        }
        self.apply_consumption_intent(intent)
    }

    pub fn replay_historical_consumption(
        &mut self,
        intent: &OfflineConsumptionIntent,
    ) -> KernelResult<()> {
        self.apply_consumption_intent(intent)?;
        Ok(())
    }

    fn apply_consumption_intent(
        &mut self,
        intent: &OfflineConsumptionIntent,
    ) -> KernelResult<OfflineAuthorizedEffect> {
        if intent.envelope_ref != self.envelope.envelope_ref
            || intent.owner_subject_ref != self.envelope.owner_subject_ref
            || intent.target_device_ref != self.envelope.target_device_ref
            || intent.plan_digest != self.envelope.plan_digest
            || intent.node_id != self.envelope.node_id
            || intent.capability_ref != self.envelope.capability_ref
            || intent.revocation_epoch != self.envelope.revocation_epoch
        {
            return Err(KernelError::new(
                "offline consumption intent binding mismatch",
            ));
        }

        let expected_sequence = self
            .effects_consumed
            .checked_add(1)
            .ok_or_else(|| KernelError::new("offline effect sequence overflow"))?;
        if intent.sequence != expected_sequence || intent.sequence > self.envelope.max_effects {
            return Err(KernelError::new(
                "offline consumption intent sequence mismatch",
            ));
        }

        let normalized = self.normalize_budget_requests(&intent.budget_requests)?;
        if normalized != intent.budget_requests {
            return Err(KernelError::new(
                "offline consumption intent budgets are not canonical",
            ));
        }
        self.validate_budget_fit(&normalized)?;

        for request in &normalized {
            *self
                .budget_consumed
                .entry(request.budget_id.clone())
                .or_default() += request.amount;
        }
        self.effects_consumed = intent.sequence;

        Ok(OfflineAuthorizedEffect {
            envelope_ref: self.envelope.envelope_ref.clone(),
            sequence: intent.sequence,
            parent_grant_ref: self.envelope.parent_grant_ref.clone(),
            owner_subject_ref: self.envelope.owner_subject_ref.clone(),
            plan_digest: self.envelope.plan_digest.clone(),
            node_id: self.envelope.node_id.clone(),
            capability_ref: self.envelope.capability_ref.clone(),
        })
    }

    fn normalize_budget_requests(
        &self,
        budget_requests: &[BudgetRequest],
    ) -> KernelResult<Vec<BudgetRequest>> {
        if budget_requests.is_empty() {
            return Err(KernelError::new(
                "offline effect must consume at least one bounded budget",
            ));
        }

        let mut local = BTreeMap::<String, BudgetRequest>::new();
        for request in budget_requests {
            request.validate()?;
            let Some(limit) = self.envelope.budget_limits.get(&request.budget_id) else {
                return Err(KernelError::new(format!(
                    "offline budget {} is outside envelope",
                    request.budget_id
                )));
            };
            if limit.currency != request.currency {
                return Err(KernelError::new(format!(
                    "offline budget {} currency mismatch",
                    request.budget_id
                )));
            }

            if let Some(existing) = local.get_mut(&request.budget_id) {
                existing.amount = existing
                    .amount
                    .checked_add(request.amount)
                    .ok_or_else(|| KernelError::new("offline budget request overflow"))?;
            } else {
                local.insert(request.budget_id.clone(), request.clone());
            }
        }
        Ok(local.into_values().collect())
    }

    fn validate_budget_fit(&self, normalized: &[BudgetRequest]) -> KernelResult<()> {
        for request in normalized {
            let limit = self
                .envelope
                .budget_limits
                .get(&request.budget_id)
                .ok_or_else(|| KernelError::new("missing offline budget limit"))?;
            let consumed = self
                .budget_consumed
                .get(&request.budget_id)
                .copied()
                .unwrap_or(0);
            let next = consumed
                .checked_add(request.amount)
                .ok_or_else(|| KernelError::new("offline budget consumption overflow"))?;
            if next > limit.amount {
                return Err(KernelError::new(format!(
                    "offline budget exhausted:{}",
                    request.budget_id
                )));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineConsumptionIntent {
    pub envelope_ref: String,
    pub sequence: u64,
    pub owner_subject_ref: String,
    pub target_device_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub revocation_epoch: u64,
    pub budget_requests: Vec<BudgetRequest>,
}

impl OfflineConsumptionIntent {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineAuthorizedEffect {
    envelope_ref: String,
    sequence: u64,
    parent_grant_ref: String,
    owner_subject_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineEffectReceipt {
    pub envelope_ref: String,
    pub sequence: u64,
    pub receipt: EffectReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineReconciliationReport {
    pub envelope_ref: String,
    pub consumed_effects: u64,
    pub observed_receipts: u64,
    pub missing_sequences: Vec<u64>,
    pub complete: bool,
}

impl OfflineReconciliationReport {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttestationEvidence {
    pub evidence_ref: String,
    pub verified: bool,
    pub trust_domain_ref: String,
    pub attestation_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionCandidate {
    pub node_ref: String,
    pub runtime_surface: RuntimeSurface,
    pub attestation: AttestationEvidence,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacementConstraints {
    pub required_surface: RuntimeSurface,
    pub require_verified_attestation: bool,
    pub minimum_attestation_epoch: u64,
    pub allowed_trust_domains: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidatePlacementAssessment {
    pub node_ref: String,
    pub eligible: bool,
    pub blockers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacementAssessment {
    pub candidates: Vec<CandidatePlacementAssessment>,
}

impl PlacementAssessment {
    pub fn eligible_node_refs(&self) -> Vec<&str> {
        self.candidates
            .iter()
            .filter(|candidate| candidate.eligible)
            .map(|candidate| candidate.node_ref.as_str())
            .collect()
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

pub fn assess_execution_placement(
    candidates: &[ExecutionCandidate],
    constraints: &PlacementConstraints,
) -> KernelResult<PlacementAssessment> {
    if candidates.is_empty() {
        return Err(KernelError::new(
            "execution placement requires at least one candidate",
        ));
    }

    let mut allowed_domains = BTreeSet::<String>::new();
    for domain in &constraints.allowed_trust_domains {
        require_id(domain, "allowed trust domain ref")?;
        if !allowed_domains.insert(domain.clone()) {
            return Err(KernelError::new("duplicate allowed trust domain"));
        }
    }

    let mut seen_nodes = BTreeSet::<String>::new();
    let mut assessments = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        require_id(&candidate.node_ref, "execution candidate node ref")?;
        require_id(
            &candidate.attestation.evidence_ref,
            "attestation evidence ref",
        )?;
        require_id(
            &candidate.attestation.trust_domain_ref,
            "attestation trust domain ref",
        )?;
        if !seen_nodes.insert(candidate.node_ref.clone()) {
            return Err(KernelError::new("duplicate execution candidate node"));
        }

        let mut blockers = BTreeSet::<String>::new();
        if candidate.runtime_surface != constraints.required_surface {
            blockers.insert("runtime-surface-mismatch".to_string());
        }
        if constraints.require_verified_attestation && !candidate.attestation.verified {
            blockers.insert("attestation-unverified".to_string());
        }
        if candidate.attestation.attestation_epoch < constraints.minimum_attestation_epoch {
            blockers.insert("attestation-epoch-stale".to_string());
        }
        if !allowed_domains.is_empty()
            && !allowed_domains.contains(&candidate.attestation.trust_domain_ref)
        {
            blockers.insert("trust-domain-not-allowed".to_string());
        }

        let blockers: Vec<String> = blockers.into_iter().collect();
        assessments.push(CandidatePlacementAssessment {
            node_ref: candidate.node_ref.clone(),
            eligible: blockers.is_empty(),
            blockers,
        });
    }

    Ok(PlacementAssessment {
        candidates: assessments,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedEffect {
    grant_ref: String,
    owner_subject_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
}

impl AuthorizedEffect {
    pub fn grant_ref(&self) -> &str {
        &self.grant_ref
    }

    pub fn owner_subject_ref(&self) -> &str {
        &self.owner_subject_ref
    }

    pub fn plan_digest(&self) -> &str {
        &self.plan_digest
    }

    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    pub fn capability_ref(&self) -> &str {
        &self.capability_ref
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EffectReceipt {
    pub receipt_ref: String,
    pub grant_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub effect_digest: String,
    pub success: bool,
}

pub trait EffectPort {
    fn execute(&mut self, effect: &AuthorizedEffect) -> KernelResult<EffectReceipt>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptEvidence {
    pub receipt_ref: String,
    pub success: bool,
}

impl ReceiptEvidence {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemorySourceKind {
    OwnerDirect,
    SignedLocalArtifact,
    VerifiedRemoteArtifact,
    AgentInference,
    ThirdParty,
    ImportedMemory,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryCandidate {
    pub candidate_id: String,
    pub owner_subject_ref: String,
    pub source_kind: MemorySourceKind,
    pub provenance_verified: bool,
    pub independent_evidence_refs: Vec<String>,
    pub receipt_refs: Vec<String>,
    pub contradicts_memory_refs: Vec<String>,
    pub requested_durable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryDisposition {
    AdmitDurable,
    RetainEphemeral,
    Quarantine,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryAssessment {
    pub candidate_id: String,
    pub disposition: MemoryDisposition,
    pub reasons: Vec<String>,
}

impl MemoryAssessment {
    pub fn truth_certified(&self) -> bool {
        false
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DelegationProposal {
    pub parent_grant_ref: String,
    pub child_id: String,
    pub capability_ref: String,
    pub budget_requests: Vec<BudgetRequest>,
    pub remaining_delegation_hops: u8,
}

impl DelegationProposal {
    pub fn requires_mesh_reauthorization(&self) -> bool {
        true
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
pub struct DelegationLedger {
    parent_grant_ref: String,
    capability_ref: String,
    parent_limits: BTreeMap<String, BudgetRequest>,
    reserved: BTreeMap<String, u64>,
    max_child_hops: u8,
    children: BTreeSet<String>,
}

impl DelegationLedger {
    pub fn new(parent: &VerifiedAuthority) -> Self {
        let parent_limits = parent
            .budget_requests
            .iter()
            .cloned()
            .map(|request| (request.budget_id.clone(), request))
            .collect();
        Self {
            parent_grant_ref: parent.grant_ref.clone(),
            capability_ref: parent.capability_ref.clone(),
            parent_limits,
            reserved: BTreeMap::new(),
            max_child_hops: parent.max_delegation_hops.saturating_sub(1),
            children: BTreeSet::new(),
        }
    }

    pub fn reserve(
        &mut self,
        child_id: impl Into<String>,
        capability_ref: &str,
        budget_requests: Vec<BudgetRequest>,
        requested_delegation_hops: u8,
    ) -> KernelResult<DelegationProposal> {
        let child_id = child_id.into();
        require_id(&child_id, "delegation child id")?;
        require_id(capability_ref, "delegation capability ref")?;
        if capability_ref != self.capability_ref {
            return Err(KernelError::new(
                "delegation cannot expand or change the parent capability",
            ));
        }
        if !self.children.insert(child_id.clone()) {
            return Err(KernelError::new("duplicate delegation child id"));
        }
        if requested_delegation_hops > self.max_child_hops {
            self.children.remove(&child_id);
            return Err(KernelError::new("delegation hop ceiling exceeded"));
        }

        let mut local_reservations = BTreeMap::<String, u64>::new();
        for request in &budget_requests {
            request.validate()?;
            let Some(parent_limit) = self.parent_limits.get(&request.budget_id) else {
                self.children.remove(&child_id);
                return Err(KernelError::new(format!(
                    "delegation budget {} is not present in parent grant",
                    request.budget_id
                )));
            };
            if parent_limit.currency != request.currency {
                self.children.remove(&child_id);
                return Err(KernelError::new(format!(
                    "delegation currency mismatch for {}",
                    request.budget_id
                )));
            }
            let entry = local_reservations
                .entry(request.budget_id.clone())
                .or_default();
            *entry = entry
                .checked_add(request.amount)
                .ok_or_else(|| KernelError::new("delegation budget overflow"))?;
        }

        for (budget_id, amount) in &local_reservations {
            let parent = self
                .parent_limits
                .get(budget_id)
                .ok_or_else(|| KernelError::new("missing parent delegation budget"))?;
            let already = self.reserved.get(budget_id).copied().unwrap_or(0);
            let total = already
                .checked_add(*amount)
                .ok_or_else(|| KernelError::new("delegation reservation overflow"))?;
            if total > parent.amount {
                self.children.remove(&child_id);
                return Err(KernelError::new(format!(
                    "delegation would overcommit conserved budget {budget_id}"
                )));
            }
        }

        for (budget_id, amount) in local_reservations {
            *self.reserved.entry(budget_id).or_default() += amount;
        }

        Ok(DelegationProposal {
            parent_grant_ref: self.parent_grant_ref.clone(),
            child_id,
            capability_ref: capability_ref.to_string(),
            budget_requests,
            remaining_delegation_hops: requested_delegation_hops,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityHandoffProposal {
    pub grant_ref: String,
    pub from_node_ref: String,
    pub target_node_ref: String,
    pub plan_digest: String,
    pub node_id: String,
    pub capability_ref: String,
    pub current_revocation_epoch: u64,
    pub proposed_revocation_epoch: u64,
}

impl AuthorityHandoffProposal {
    pub fn requires_mesh_reauthorization(&self) -> bool {
        true
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshWitness {
    pub witness_node_ref: String,
    pub receipt_ref: String,
    pub effect_digest: String,
    pub witnessed_at_unix_s: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptWitnessAssessment {
    pub receipt_ref: String,
    pub unique_witnesses: usize,
    pub required_witnesses: usize,
    pub quorum_met: bool,
}

impl ReceiptWitnessAssessment {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContinuityCapsule {
    pub kernel_id: String,
    pub owner_subject_ref: String,
    pub personal_agent_pack_ref: String,
    pub personal_agent_pack_sha256: String,
    pub memory_refs: Vec<String>,
    pub receipt_refs: Vec<String>,
    authority_carried: bool,
    active_grants: u64,
}

impl ContinuityCapsule {
    pub fn authority_carried(&self) -> bool {
        self.authority_carried
    }

    pub fn active_grants(&self) -> u64 {
        self.active_grants
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoredContinuity {
    pub memory_refs: Vec<String>,
    pub receipt_refs: Vec<String>,
}

impl RestoredContinuity {
    pub fn authority_restored(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone)]
pub struct Kernel {
    identity: KernelIdentity,
    constitution: Constitution,
    budgets: BTreeMap<String, AuthorityBudget>,
    autonomy: BTreeMap<String, AutonomyState>,
    revocation_epoch: u64,
}

impl Kernel {
    pub fn new(
        identity: KernelIdentity,
        constitution: Constitution,
        budgets: Vec<AuthorityBudget>,
        autonomy: Vec<AutonomyState>,
        revocation_epoch: u64,
    ) -> KernelResult<Self> {
        identity.validate()?;
        constitution.validate()?;

        let mut budget_map = BTreeMap::new();
        for budget in budgets {
            budget.validate()?;
            if budget_map
                .insert(budget.budget_id.clone(), budget)
                .is_some()
            {
                return Err(KernelError::new("duplicate authority budget id"));
            }
        }

        let mut autonomy_map = BTreeMap::new();
        for state in autonomy {
            require_id(&state.capability_ref, "autonomy capability ref")?;
            if autonomy_map
                .insert(state.capability_ref.clone(), state)
                .is_some()
            {
                return Err(KernelError::new("duplicate autonomy capability"));
            }
        }

        Ok(Self {
            identity,
            constitution,
            budgets: budget_map,
            autonomy: autonomy_map,
            revocation_epoch,
        })
    }

    pub fn identity(&self) -> &KernelIdentity {
        &self.identity
    }

    pub fn revocation_epoch(&self) -> u64 {
        self.revocation_epoch
    }

    pub fn assess_policy_proposal(
        &self,
        proposal: &PolicyProposal,
        now_unix_s: u64,
    ) -> KernelResult<PolicyAssessment> {
        self.constitution.validate()?;
        require_id(&proposal.proposal_id, "policy proposal id")?;
        require_id(
            &proposal.owner_subject_ref,
            "policy proposal owner subject ref",
        )?;
        require_id(&proposal.capability_ref, "policy proposal capability ref")?;

        if proposal.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new(
                "policy proposal owner does not match kernel owner",
            ));
        }

        let mut blockers = BTreeSet::<String>::new();

        match self.autonomy.get(&proposal.capability_ref) {
            Some(autonomy) if proposal.requested_autonomy > autonomy.level => {
                blockers.insert("requested-autonomy-exceeds-earned-ceiling".to_string());
            }
            None => {
                blockers.insert("capability-has-no-earned-autonomy-state".to_string());
            }
            Some(_) => {}
        }

        if proposal.effect_requested && proposal.requested_autonomy != AutonomyLevel::RequestEffect
        {
            blockers.insert("effect-request-requires-request-effect-level".to_string());
        }

        if proposal.uses_quarantined_memory {
            blockers.insert("quarantined-memory-cannot-support-proposal".to_string());
        }

        let mut requests_by_id = BTreeMap::<String, &BudgetRequest>::new();
        for request in &proposal.budget_requests {
            request.validate()?;
            if requests_by_id
                .insert(request.budget_id.clone(), request)
                .is_some()
            {
                return Err(KernelError::new(format!(
                    "duplicate proposal budget_id: {}",
                    request.budget_id
                )));
            }
        }

        let applicable: BTreeMap<&str, &AuthorityBudget> = self
            .budgets
            .values()
            .filter(|budget| budget.capability_ref == proposal.capability_ref)
            .map(|budget| (budget.budget_id.as_str(), budget))
            .collect();

        for request in &proposal.budget_requests {
            if !applicable.contains_key(request.budget_id.as_str()) {
                blockers.insert(format!("unbound-budget-request:{}", request.budget_id));
            }
        }

        for (budget_id, budget) in applicable {
            let Some(request) = requests_by_id.get(budget_id) else {
                blockers.insert(format!("missing-applicable-budget:{budget_id}"));
                continue;
            };

            if !budget.is_current(now_unix_s) {
                blockers.insert(format!("budget-not-current:{budget_id}"));
            }
            if request.currency != budget.currency {
                blockers.insert(format!("budget-currency-mismatch:{budget_id}"));
            }
            if request.amount > budget.remaining() {
                blockers.insert(format!("budget-exceeded:{budget_id}"));
            }
        }

        let blockers: Vec<String> = blockers.into_iter().collect();
        Ok(PolicyAssessment {
            proposal_id: proposal.proposal_id.clone(),
            eligible_within_personal_policy: blockers.is_empty(),
            blockers,
        })
    }

    pub fn build_mesh_adapter_request(
        &self,
        request: &AuthorityRequest,
    ) -> KernelResult<MeshAdapterRequest> {
        if request.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("mesh adapter owner binding mismatch"));
        }
        require_sha256(&request.plan_digest, "mesh adapter plan digest")?;
        require_id(&request.node_id, "mesh adapter node id")?;
        require_id(&request.capability_ref, "mesh adapter capability ref")?;
        if request.revocation_epoch != self.revocation_epoch {
            return Err(KernelError::new(
                "mesh adapter request revocation epoch is stale",
            ));
        }

        let mut budget_ids = BTreeSet::<String>::new();
        for budget in &request.budget_requests {
            budget.validate()?;
            if !budget_ids.insert(budget.budget_id.clone()) {
                return Err(KernelError::new(
                    "mesh adapter request contains duplicate budgets",
                ));
            }
        }

        Ok(MeshAdapterRequest {
            schema: "axiom-personal-kernel-mesh-adapter-request.v0",
            kernel_id: self.identity.kernel_id.clone(),
            principal_ref: self.identity.principal_ref.clone(),
            owner_subject_ref: request.owner_subject_ref.clone(),
            plan_digest: request.plan_digest.clone(),
            node_id: request.node_id.clone(),
            capability_ref: request.capability_ref.clone(),
            revocation_epoch: request.revocation_epoch,
            budget_requests: request.budget_requests.clone(),
        })
    }

    pub fn compile_plan(
        &self,
        plan: Plan,
        now_unix_s: u64,
        current_surface: &RuntimeSurface,
    ) -> KernelResult<CompiledPlan> {
        self.constitution.validate()?;
        require_id(&plan.plan_id, "plan id")?;
        require_id(&plan.owner_subject_ref, "plan owner subject ref")?;
        require_sha256(&plan.plan_digest, "plan digest")?;
        if plan.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("plan owner does not match kernel owner"));
        }
        if plan.nodes.is_empty() || plan.nodes.len() > 128 {
            return Err(KernelError::new(
                "plan must contain between 1 and 128 nodes",
            ));
        }

        let mut seen_nodes = BTreeSet::<String>::new();
        let mut aggregate = BTreeMap::<String, u64>::new();

        for node in &plan.nodes {
            require_id(&node.node_id, "plan node id")?;
            require_id(&node.capability_ref, "plan capability ref")?;
            if !seen_nodes.insert(node.node_id.clone()) {
                return Err(KernelError::new("duplicate plan node id"));
            }
            for dependency in &node.depends_on {
                require_id(dependency, "plan dependency id")?;
                if !seen_nodes.contains(dependency) {
                    return Err(KernelError::new(
                        "plan dependencies must reference an earlier node",
                    ));
                }
            }
            if node.uses_quarantined_memory {
                return Err(KernelError::new(
                    "quarantined memory cannot support a compiled plan",
                ));
            }

            let Some(autonomy) = self.autonomy.get(&node.capability_ref) else {
                return Err(KernelError::new(format!(
                    "capability {} has no autonomy state",
                    node.capability_ref
                )));
            };
            if node.requested_autonomy > autonomy.effective_level(current_surface) {
                return Err(KernelError::new(format!(
                    "requested autonomy exceeds effective ceiling for {}",
                    node.capability_ref
                )));
            }
            if node.effect_class.is_effectful()
                && node.requested_autonomy != AutonomyLevel::RequestEffect
            {
                return Err(KernelError::new(
                    "effectful plan node requires request-effect autonomy",
                ));
            }

            for request in &node.budget_requests {
                request.validate()?;
                let Some(budget) = self.budgets.get(&request.budget_id) else {
                    return Err(KernelError::new(format!(
                        "unknown authority budget {}",
                        request.budget_id
                    )));
                };
                if !budget.is_current(now_unix_s) {
                    return Err(KernelError::new(format!(
                        "authority budget {} is not current",
                        request.budget_id
                    )));
                }
                if budget.capability_ref != node.capability_ref {
                    return Err(KernelError::new(format!(
                        "authority budget {} is bound to another capability",
                        request.budget_id
                    )));
                }
                if budget.currency != request.currency {
                    return Err(KernelError::new(format!(
                        "authority budget {} currency mismatch",
                        request.budget_id
                    )));
                }
                let entry = aggregate.entry(request.budget_id.clone()).or_default();
                *entry = entry
                    .checked_add(request.amount)
                    .ok_or_else(|| KernelError::new("plan budget aggregate overflow"))?;
            }
        }

        for (budget_id, amount) in &aggregate {
            let budget = self
                .budgets
                .get(budget_id)
                .ok_or_else(|| KernelError::new("missing compiled authority budget"))?;
            if *amount > budget.remaining() {
                return Err(KernelError::new(format!(
                    "plan-wide authority budget exceeded for {budget_id}"
                )));
            }
        }

        Ok(CompiledPlan {
            plan,
            aggregate_budget_requests: aggregate,
        })
    }

    pub fn shadow(&self, compiled: &CompiledPlan) -> KernelResult<ShadowReport> {
        if compiled.plan.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("compiled plan owner drift"));
        }

        let mut effect_nodes = 0_usize;
        let mut irreversible_nodes = 0_usize;
        let mut complete = true;
        for node in &compiled.plan.nodes {
            if !node.effect_class.is_effectful() {
                continue;
            }
            effect_nodes += 1;
            if node.reversibility == Reversibility::Irreversible {
                irreversible_nodes += 1;
                let confirmed = node.owner_confirmation_ref.as_deref().is_some_and(|value| {
                    !value.is_empty() && require_id(value, "confirmation ref").is_ok()
                });
                if !confirmed {
                    complete = false;
                }
            }
        }

        Ok(ShadowReport {
            plan_digest: compiled.plan.plan_digest.clone(),
            effect_nodes,
            irreversible_nodes,
            all_effects_rehearsed: true,
            rollback_or_confirmation_complete: complete,
        })
    }

    pub fn authority_requests(
        &self,
        compiled: &CompiledPlan,
        shadow: &ShadowReport,
    ) -> KernelResult<Vec<AuthorityRequest>> {
        if shadow.plan_digest != compiled.plan.plan_digest {
            return Err(KernelError::new("shadow report is bound to another plan"));
        }
        if !shadow.all_effects_rehearsed || !shadow.rollback_or_confirmation_complete {
            return Err(KernelError::new(
                "shadow/reversibility evidence is incomplete",
            ));
        }

        let mut requests = Vec::new();
        for node in &compiled.plan.nodes {
            if !node.effect_class.is_effectful() {
                continue;
            }
            let mut aggregated = BTreeMap::<String, BudgetRequest>::new();
            for request in &node.budget_requests {
                if let Some(existing) = aggregated.get_mut(&request.budget_id) {
                    existing.amount = existing
                        .amount
                        .checked_add(request.amount)
                        .ok_or_else(|| KernelError::new("node budget overflow"))?;
                } else {
                    aggregated.insert(request.budget_id.clone(), request.clone());
                }
            }

            requests.push(AuthorityRequest {
                owner_subject_ref: self.identity.owner_subject_ref.clone(),
                plan_digest: compiled.plan.plan_digest.clone(),
                node_id: node.node_id.clone(),
                capability_ref: node.capability_ref.clone(),
                revocation_epoch: self.revocation_epoch,
                budget_requests: aggregated.into_values().collect(),
            });
        }
        Ok(requests)
    }

    pub fn verify_mesh_proof(
        &self,
        request: &AuthorityRequest,
        proof: MeshProof,
        now_unix_s: u64,
    ) -> KernelResult<VerifiedAuthority> {
        if proof.owner_subject_ref != self.identity.owner_subject_ref
            || proof.owner_subject_ref != request.owner_subject_ref
        {
            return Err(KernelError::new("mesh proof owner binding mismatch"));
        }
        if proof.plan_digest != request.plan_digest {
            return Err(KernelError::new("mesh proof plan binding mismatch"));
        }
        if proof.node_id != request.node_id {
            return Err(KernelError::new("mesh proof node binding mismatch"));
        }
        if proof.capability_ref != request.capability_ref {
            return Err(KernelError::new("mesh proof capability binding mismatch"));
        }
        if proof.revocation_epoch != self.revocation_epoch
            || request.revocation_epoch != self.revocation_epoch
        {
            return Err(KernelError::new("mesh proof revocation epoch is stale"));
        }
        if now_unix_s >= proof.expires_at_unix_s {
            return Err(KernelError::new("mesh proof is expired"));
        }

        Ok(VerifiedAuthority {
            grant_ref: proof.grant_ref,
            owner_subject_ref: proof.owner_subject_ref,
            plan_digest: proof.plan_digest,
            node_id: proof.node_id,
            capability_ref: proof.capability_ref,
            revocation_epoch: proof.revocation_epoch,
            budget_requests: request.budget_requests.clone(),
            max_delegation_hops: proof.max_delegation_hops,
        })
    }

    pub fn execute_authorized(
        &self,
        authority: &VerifiedAuthority,
        port: &mut impl EffectPort,
    ) -> KernelResult<EffectReceipt> {
        if authority.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("verified authority owner drift"));
        }
        if authority.revocation_epoch != self.revocation_epoch {
            return Err(KernelError::new(
                "verified authority became stale before execution",
            ));
        }

        let effect = AuthorizedEffect {
            grant_ref: authority.grant_ref.clone(),
            owner_subject_ref: authority.owner_subject_ref.clone(),
            plan_digest: authority.plan_digest.clone(),
            node_id: authority.node_id.clone(),
            capability_ref: authority.capability_ref.clone(),
        };
        port.execute(&effect)
    }

    pub fn prepare_offline_consumption(
        &self,
        ledger: &OfflineEnvelopeLedger,
        target_device_ref: &str,
        current_surface: &RuntimeSurface,
        now_unix_s: u64,
        budget_requests: &[BudgetRequest],
    ) -> KernelResult<OfflineConsumptionIntent> {
        ledger.prepare_consumption(
            &self.identity.owner_subject_ref,
            self.revocation_epoch,
            target_device_ref,
            current_surface,
            now_unix_s,
            budget_requests,
        )
    }

    pub fn commit_offline_consumption(
        &self,
        ledger: &mut OfflineEnvelopeLedger,
        intent: &OfflineConsumptionIntent,
        current_surface: &RuntimeSurface,
        now_unix_s: u64,
    ) -> KernelResult<OfflineAuthorizedEffect> {
        if intent.owner_subject_ref != self.identity.owner_subject_ref
            || intent.revocation_epoch != self.revocation_epoch
        {
            return Err(KernelError::new(
                "offline consumption intent no longer matches kernel authority epoch",
            ));
        }
        ledger.commit_consumption(intent, current_surface, now_unix_s)
    }

    pub fn replay_offline_consumption(
        &self,
        ledger: &mut OfflineEnvelopeLedger,
        intent: &OfflineConsumptionIntent,
    ) -> KernelResult<()> {
        if intent.owner_subject_ref != self.identity.owner_subject_ref
            || intent.revocation_epoch != self.revocation_epoch
        {
            return Err(KernelError::new(
                "historical offline consumption does not match kernel authority epoch",
            ));
        }
        ledger.replay_historical_consumption(intent)
    }

    pub fn execute_committed_offline(
        &self,
        offline: &OfflineAuthorizedEffect,
        port: &mut impl EffectPort,
    ) -> KernelResult<OfflineEffectReceipt> {
        if offline.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("committed offline effect owner drift"));
        }

        let effect = AuthorizedEffect {
            grant_ref: offline.parent_grant_ref.clone(),
            owner_subject_ref: offline.owner_subject_ref.clone(),
            plan_digest: offline.plan_digest.clone(),
            node_id: offline.node_id.clone(),
            capability_ref: offline.capability_ref.clone(),
        };
        let receipt = port.execute(&effect)?;

        if receipt.grant_ref != effect.grant_ref
            || receipt.plan_digest != effect.plan_digest
            || receipt.node_id != effect.node_id
            || receipt.capability_ref != effect.capability_ref
        {
            return Err(KernelError::new(
                "offline effect receipt does not bind to envelope authority",
            ));
        }

        Ok(OfflineEffectReceipt {
            envelope_ref: offline.envelope_ref.clone(),
            sequence: offline.sequence,
            receipt,
        })
    }

    pub fn execute_offline_authorized(
        &self,
        ledger: &mut OfflineEnvelopeLedger,
        target_device_ref: &str,
        current_surface: &RuntimeSurface,
        now_unix_s: u64,
        budget_requests: &[BudgetRequest],
        port: &mut impl EffectPort,
    ) -> KernelResult<OfflineEffectReceipt> {
        let intent = self.prepare_offline_consumption(
            ledger,
            target_device_ref,
            current_surface,
            now_unix_s,
            budget_requests,
        )?;
        let offline =
            self.commit_offline_consumption(ledger, &intent, current_surface, now_unix_s)?;
        self.execute_committed_offline(&offline, port)
    }

    pub fn reconcile_offline_receipts(
        &self,
        ledger: &OfflineEnvelopeLedger,
        receipts: &[OfflineEffectReceipt],
    ) -> KernelResult<OfflineReconciliationReport> {
        let consumed = ledger.effects_consumed();
        let mut sequences = BTreeSet::<u64>::new();

        for item in receipts {
            if item.envelope_ref != ledger.envelope.envelope_ref {
                return Err(KernelError::new(
                    "offline receipt belongs to another envelope",
                ));
            }
            if item.sequence == 0 || item.sequence > consumed {
                return Err(KernelError::new("offline receipt sequence is invalid"));
            }
            if !sequences.insert(item.sequence) {
                return Err(KernelError::new("duplicate offline receipt sequence"));
            }
            if item.receipt.grant_ref != ledger.envelope.parent_grant_ref
                || item.receipt.plan_digest != ledger.envelope.plan_digest
                || item.receipt.node_id != ledger.envelope.node_id
                || item.receipt.capability_ref != ledger.envelope.capability_ref
            {
                return Err(KernelError::new(
                    "offline receipt binding differs from envelope",
                ));
            }
        }

        let missing_sequences: Vec<u64> = (1..=consumed)
            .filter(|sequence| !sequences.contains(sequence))
            .collect();
        Ok(OfflineReconciliationReport {
            envelope_ref: ledger.envelope.envelope_ref.clone(),
            consumed_effects: consumed,
            observed_receipts: receipts.len() as u64,
            complete: missing_sequences.is_empty(),
            missing_sequences,
        })
    }

    pub fn admit_receipt(
        &self,
        authority: &VerifiedAuthority,
        receipt: &EffectReceipt,
    ) -> KernelResult<ReceiptEvidence> {
        require_id(&receipt.receipt_ref, "receipt ref")?;
        require_sha256(&receipt.effect_digest, "effect digest")?;
        if receipt.grant_ref != authority.grant_ref
            || receipt.plan_digest != authority.plan_digest
            || receipt.node_id != authority.node_id
            || receipt.capability_ref != authority.capability_ref
        {
            return Err(KernelError::new(
                "effect receipt does not bind to verified authority",
            ));
        }
        Ok(ReceiptEvidence {
            receipt_ref: receipt.receipt_ref.clone(),
            success: receipt.success,
        })
    }

    pub fn assess_memory(
        &self,
        candidate: &MemoryCandidate,
        observed_receipts: &BTreeSet<String>,
    ) -> KernelResult<MemoryAssessment> {
        require_id(&candidate.candidate_id, "memory candidate id")?;
        require_id(&candidate.owner_subject_ref, "memory owner subject ref")?;
        if candidate.owner_subject_ref != self.identity.owner_subject_ref {
            return Err(KernelError::new("memory owner does not match kernel owner"));
        }
        for reference in candidate
            .independent_evidence_refs
            .iter()
            .chain(candidate.receipt_refs.iter())
            .chain(candidate.contradicts_memory_refs.iter())
        {
            require_id(reference, "memory evidence ref")?;
        }

        let mut reasons = BTreeSet::<String>::new();
        if !candidate.provenance_verified {
            reasons.insert("provenance-unverified".to_string());
        }
        if !candidate.contradicts_memory_refs.is_empty() {
            reasons.insert("contradiction-requires-review".to_string());
        }

        match candidate.source_kind {
            MemorySourceKind::OwnerDirect | MemorySourceKind::SignedLocalArtifact => {}
            MemorySourceKind::VerifiedRemoteArtifact | MemorySourceKind::ThirdParty => {
                if candidate.independent_evidence_refs.is_empty() {
                    reasons.insert("independent-evidence-required".to_string());
                }
            }
            MemorySourceKind::AgentInference | MemorySourceKind::ImportedMemory => {
                if candidate.independent_evidence_refs.len() < 2 {
                    reasons.insert("two-independent-evidence-refs-required".to_string());
                }
                if candidate.receipt_refs.is_empty() {
                    reasons.insert("receipt-link-required".to_string());
                }
                if candidate
                    .receipt_refs
                    .iter()
                    .any(|reference| !observed_receipts.contains(reference))
                {
                    reasons.insert("receipt-link-not-observed".to_string());
                }
            }
        }

        let disposition = if reasons.is_empty() {
            if candidate.requested_durable {
                MemoryDisposition::AdmitDurable
            } else {
                MemoryDisposition::RetainEphemeral
            }
        } else {
            MemoryDisposition::Quarantine
        };

        Ok(MemoryAssessment {
            candidate_id: candidate.candidate_id.clone(),
            disposition,
            reasons: reasons.into_iter().collect(),
        })
    }

    pub fn propose_authority_handoff(
        &self,
        authority: &VerifiedAuthority,
        from_node_ref: &str,
        target_node_ref: &str,
    ) -> KernelResult<AuthorityHandoffProposal> {
        require_id(from_node_ref, "handoff source node ref")?;
        require_id(target_node_ref, "handoff target node ref")?;
        if from_node_ref == target_node_ref {
            return Err(KernelError::new(
                "authority handoff source and target must differ",
            ));
        }
        if authority.owner_subject_ref != self.identity.owner_subject_ref
            || authority.revocation_epoch != self.revocation_epoch
        {
            return Err(KernelError::new(
                "authority handoff requires current verified authority",
            ));
        }
        let proposed_revocation_epoch = self
            .revocation_epoch
            .checked_add(1)
            .ok_or_else(|| KernelError::new("revocation epoch overflow"))?;

        Ok(AuthorityHandoffProposal {
            grant_ref: authority.grant_ref.clone(),
            from_node_ref: from_node_ref.to_string(),
            target_node_ref: target_node_ref.to_string(),
            plan_digest: authority.plan_digest.clone(),
            node_id: authority.node_id.clone(),
            capability_ref: authority.capability_ref.clone(),
            current_revocation_epoch: self.revocation_epoch,
            proposed_revocation_epoch,
        })
    }

    pub fn assess_receipt_witnesses(
        &self,
        receipt: &EffectReceipt,
        witnesses: &[MeshWitness],
        required_unique_witnesses: usize,
        now_unix_s: u64,
        max_witness_age_s: u64,
    ) -> KernelResult<ReceiptWitnessAssessment> {
        if required_unique_witnesses == 0 {
            return Err(KernelError::new(
                "receipt witness quorum must require at least one witness",
            ));
        }
        if max_witness_age_s == 0 {
            return Err(KernelError::new(
                "receipt witness freshness window must be positive",
            ));
        }
        require_id(&receipt.receipt_ref, "witnessed receipt ref")?;
        require_sha256(&receipt.effect_digest, "witnessed effect digest")?;

        let mut unique = BTreeSet::<String>::new();
        for witness in witnesses {
            require_id(&witness.witness_node_ref, "mesh witness node ref")?;
            require_id(&witness.receipt_ref, "mesh witness receipt ref")?;
            require_sha256(&witness.effect_digest, "mesh witness effect digest")?;
            if witness.receipt_ref != receipt.receipt_ref
                || witness.effect_digest != receipt.effect_digest
            {
                return Err(KernelError::new(
                    "mesh witness does not bind to the exact effect receipt",
                ));
            }
            if witness.witnessed_at_unix_s > now_unix_s
                || now_unix_s - witness.witnessed_at_unix_s > max_witness_age_s
            {
                return Err(KernelError::new("mesh witness is outside freshness window"));
            }
            unique.insert(witness.witness_node_ref.clone());
        }

        let unique_witnesses = unique.len();
        Ok(ReceiptWitnessAssessment {
            receipt_ref: receipt.receipt_ref.clone(),
            unique_witnesses,
            required_witnesses: required_unique_witnesses,
            quorum_met: unique_witnesses >= required_unique_witnesses,
        })
    }

    pub fn export_continuity(
        &self,
        memory_refs: Vec<String>,
        receipt_refs: Vec<String>,
    ) -> KernelResult<ContinuityCapsule> {
        for reference in memory_refs.iter().chain(receipt_refs.iter()) {
            require_id(reference, "continuity reference")?;
        }
        Ok(ContinuityCapsule {
            kernel_id: self.identity.kernel_id.clone(),
            owner_subject_ref: self.identity.owner_subject_ref.clone(),
            personal_agent_pack_ref: self.identity.personal_agent_pack_ref.clone(),
            personal_agent_pack_sha256: self.identity.personal_agent_pack_sha256.clone(),
            memory_refs,
            receipt_refs,
            authority_carried: false,
            active_grants: 0,
        })
    }

    pub fn restore_continuity(
        &self,
        capsule: &ContinuityCapsule,
    ) -> KernelResult<RestoredContinuity> {
        if capsule.kernel_id != self.identity.kernel_id
            || capsule.owner_subject_ref != self.identity.owner_subject_ref
            || capsule.personal_agent_pack_ref != self.identity.personal_agent_pack_ref
            || capsule.personal_agent_pack_sha256 != self.identity.personal_agent_pack_sha256
        {
            return Err(KernelError::new(
                "continuity capsule identity binding mismatch",
            ));
        }
        if capsule.authority_carried || capsule.active_grants != 0 {
            return Err(KernelError::new(
                "continuity restore refuses carried authority",
            ));
        }
        Ok(RestoredContinuity {
            memory_refs: capsule.memory_refs.clone(),
            receipt_refs: capsule.receipt_refs.clone(),
        })
    }
}
