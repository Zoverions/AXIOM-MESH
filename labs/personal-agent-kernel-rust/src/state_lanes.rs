#![forbid(unsafe_code)]

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

const MAX_LANES_PER_MERGE: usize = 64;
const MAX_PROVENANCE_REFS: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateLaneError {
    message: String,
}

impl StateLaneError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl Display for StateLaneError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for StateLaneError {}

pub type StateLaneResult<T> = Result<T, StateLaneError>;

fn require_id(value: &str, label: &str) -> StateLaneResult<()> {
    if value.is_empty()
        || value.len() > 160
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(StateLaneError::new(format!("invalid {label}")));
    }
    Ok(())
}

fn require_sha256(value: &str, label: &str) -> StateLaneResult<()> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(StateLaneError::new(format!("invalid {label}")));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneMutationInput {
    pub operation_id: String,
    pub actor_tool_ref: String,
    pub expected_lane_revision: u64,
    pub state_key: String,
    pub value_digest: String,
    pub provenance_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneEntry {
    pub operation_id: String,
    pub lane_revision: u64,
    pub state_key: String,
    pub value_digest: String,
    pub provenance_refs: Vec<String>,
}

#[derive(Debug, Clone)]
struct StateLane {
    lane_id: String,
    owner_tool_ref: String,
    revision: u64,
    entries: Vec<LaneEntry>,
    operation_ids: BTreeSet<String>,
}

impl StateLane {
    fn new(lane_id: String, owner_tool_ref: String) -> Self {
        Self {
            lane_id,
            owner_tool_ref,
            revision: 0,
            entries: Vec::new(),
            operation_ids: BTreeSet::new(),
        }
    }

    fn append(&mut self, input: LaneMutationInput) -> StateLaneResult<LaneEntry> {
        require_id(&input.operation_id, "lane operation id")?;
        require_id(&input.actor_tool_ref, "lane actor tool ref")?;
        require_id(&input.state_key, "lane state key")?;
        require_sha256(&input.value_digest, "lane value digest")?;

        if input.actor_tool_ref != self.owner_tool_ref {
            return Err(StateLaneError::new(
                "tool cannot write outside its owned state lane",
            ));
        }
        if input.expected_lane_revision != self.revision {
            return Err(StateLaneError::new(format!(
                "stale lane revision:{} expected:{}",
                input.expected_lane_revision, self.revision
            )));
        }
        if input.provenance_refs.is_empty() || input.provenance_refs.len() > MAX_PROVENANCE_REFS {
            return Err(StateLaneError::new(
                "lane mutation requires bounded provenance",
            ));
        }

        let mut provenance = BTreeSet::<String>::new();
        for reference in &input.provenance_refs {
            require_id(reference, "lane provenance ref")?;
            if !provenance.insert(reference.clone()) {
                return Err(StateLaneError::new("duplicate lane provenance ref"));
            }
        }

        if self.operation_ids.contains(&input.operation_id) {
            return Err(StateLaneError::new("duplicate lane operation id"));
        }

        let next_revision = self
            .revision
            .checked_add(1)
            .ok_or_else(|| StateLaneError::new("lane revision overflow"))?;

        let entry = LaneEntry {
            operation_id: input.operation_id.clone(),
            lane_revision: next_revision,
            state_key: input.state_key,
            value_digest: input.value_digest,
            provenance_refs: provenance.into_iter().collect(),
        };

        self.operation_ids.insert(input.operation_id);
        self.revision = next_revision;
        self.entries.push(entry.clone());
        Ok(entry)
    }

    fn owner_history(&self, actor_tool_ref: &str) -> StateLaneResult<Vec<LaneEntry>> {
        require_id(actor_tool_ref, "lane reader tool ref")?;
        if actor_tool_ref != self.owner_tool_ref {
            return Err(StateLaneError::new(
                "cross-tool raw lane reads require an explicit merge",
            ));
        }
        Ok(self.entries.clone())
    }

    fn latest_by_key(&self) -> BTreeMap<&str, &LaneEntry> {
        let mut latest = BTreeMap::<&str, &LaneEntry>::new();
        for entry in &self.entries {
            latest.insert(entry.state_key.as_str(), entry);
        }
        latest
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeInput {
    pub lane_id: String,
    pub expected_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeRequest {
    pub merge_id: String,
    pub consumer_tool_ref: String,
    pub inputs: Vec<MergeInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MergeOrigin {
    pub lane_id: String,
    pub owner_tool_ref: String,
    pub operation_id: String,
    pub lane_revision: u64,
    pub provenance_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergedValue {
    pub state_key: String,
    pub value_digest: String,
    pub origins: Vec<MergeOrigin>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeVariant {
    pub value_digest: String,
    pub origins: Vec<MergeOrigin>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeConflict {
    pub state_key: String,
    pub variants: Vec<MergeVariant>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeView {
    merge_id: String,
    consumer_tool_ref: String,
    inputs: Vec<MergeInput>,
    values: Vec<MergedValue>,
    conflicts: Vec<MergeConflict>,
}

impl MergeView {
    pub fn merge_id(&self) -> &str {
        &self.merge_id
    }

    pub fn consumer_tool_ref(&self) -> &str {
        &self.consumer_tool_ref
    }

    pub fn inputs(&self) -> &[MergeInput] {
        &self.inputs
    }

    pub fn values(&self) -> &[MergedValue] {
        &self.values
    }

    pub fn conflicts(&self) -> &[MergeConflict] {
        &self.conflicts
    }

    pub fn is_consistent(&self) -> bool {
        self.conflicts.is_empty()
    }

    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn truth_certified(&self) -> bool {
        false
    }

    pub fn require_consistent(&self) -> StateLaneResult<()> {
        if self.is_consistent() {
            Ok(())
        } else {
            Err(StateLaneError::new(
                "merged state contains unresolved cross-lane conflicts",
            ))
        }
    }

    pub fn value_digest(&self, state_key: &str) -> StateLaneResult<Option<&str>> {
        if self
            .conflicts
            .iter()
            .any(|conflict| conflict.state_key == state_key)
        {
            return Err(StateLaneError::new(
                "conflicted state key has no merged value",
            ));
        }
        Ok(self
            .values
            .iter()
            .find(|value| value.state_key == state_key)
            .map(|value| value.value_digest.as_str()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationDisposition {
    Conforms,
    DoesNotConform,
    Inconclusive,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationEvidenceInput {
    pub validation_id: String,
    pub validator_tool_ref: String,
    pub merge_id: String,
    pub disposition: ValidationDisposition,
    pub result_digest: String,
    pub evidence_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationReceipt {
    validation_id: String,
    validator_tool_ref: String,
    merge_id: String,
    inputs: Vec<MergeInput>,
    values: Vec<MergedValue>,
    disposition: ValidationDisposition,
    result_digest: String,
    evidence_refs: Vec<String>,
}

impl ValidationReceipt {
    pub fn validation_id(&self) -> &str {
        &self.validation_id
    }

    pub fn validator_tool_ref(&self) -> &str {
        &self.validator_tool_ref
    }

    pub fn merge_id(&self) -> &str {
        &self.merge_id
    }

    pub fn inputs(&self) -> &[MergeInput] {
        &self.inputs
    }

    pub fn values(&self) -> &[MergedValue] {
        &self.values
    }

    pub fn disposition(&self) -> ValidationDisposition {
        self.disposition
    }

    pub fn result_digest(&self) -> &str {
        &self.result_digest
    }

    pub fn evidence_refs(&self) -> &[String] {
        &self.evidence_refs
    }

    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn truth_certified(&self) -> bool {
        false
    }
}

#[derive(Debug, Default)]
pub struct StateLaneRegistry {
    lanes: BTreeMap<String, StateLane>,
    owner_lanes: BTreeMap<String, String>,
    validation_ids: BTreeSet<String>,
}

impl StateLaneRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn grants_authority(&self) -> bool {
        false
    }

    pub fn register_lane(
        &mut self,
        lane_id: impl Into<String>,
        owner_tool_ref: impl Into<String>,
    ) -> StateLaneResult<()> {
        let lane_id = lane_id.into();
        let owner_tool_ref = owner_tool_ref.into();
        require_id(&lane_id, "state lane id")?;
        require_id(&owner_tool_ref, "state lane owner tool ref")?;

        if self.lanes.contains_key(&lane_id) {
            return Err(StateLaneError::new("duplicate state lane id"));
        }
        if self.owner_lanes.contains_key(&owner_tool_ref) {
            return Err(StateLaneError::new("tool already owns a state lane"));
        }

        self.owner_lanes
            .insert(owner_tool_ref.clone(), lane_id.clone());
        self.lanes
            .insert(lane_id.clone(), StateLane::new(lane_id, owner_tool_ref));
        Ok(())
    }

    pub fn lane_revision(&self, lane_id: &str) -> StateLaneResult<u64> {
        require_id(lane_id, "state lane id")?;
        self.lanes
            .get(lane_id)
            .map(|lane| lane.revision)
            .ok_or_else(|| StateLaneError::new("unknown state lane"))
    }

    pub fn append(
        &mut self,
        lane_id: &str,
        input: LaneMutationInput,
    ) -> StateLaneResult<LaneEntry> {
        require_id(lane_id, "state lane id")?;
        let lane = self
            .lanes
            .get_mut(lane_id)
            .ok_or_else(|| StateLaneError::new("unknown state lane"))?;
        lane.append(input)
    }

    pub fn owner_history(
        &self,
        lane_id: &str,
        actor_tool_ref: &str,
    ) -> StateLaneResult<Vec<LaneEntry>> {
        require_id(lane_id, "state lane id")?;
        let lane = self
            .lanes
            .get(lane_id)
            .ok_or_else(|| StateLaneError::new("unknown state lane"))?;
        lane.owner_history(actor_tool_ref)
    }

    pub fn merge(&self, request: &MergeRequest) -> StateLaneResult<MergeView> {
        require_id(&request.merge_id, "state merge id")?;
        require_id(&request.consumer_tool_ref, "state merge consumer tool ref")?;
        if request.inputs.is_empty() || request.inputs.len() > MAX_LANES_PER_MERGE {
            return Err(StateLaneError::new(
                "state merge requires between 1 and 64 lanes",
            ));
        }

        let mut requested = BTreeMap::<String, u64>::new();
        for input in &request.inputs {
            require_id(&input.lane_id, "merge lane id")?;
            if requested
                .insert(input.lane_id.clone(), input.expected_revision)
                .is_some()
            {
                return Err(StateLaneError::new("duplicate merge lane input"));
            }
        }

        let mut normalized_inputs = Vec::<MergeInput>::new();
        let mut values = BTreeMap::<String, BTreeMap<String, Vec<MergeOrigin>>>::new();

        for (lane_id, expected_revision) in requested {
            let lane = self
                .lanes
                .get(&lane_id)
                .ok_or_else(|| StateLaneError::new("merge references unknown state lane"))?;
            if lane.revision != expected_revision {
                return Err(StateLaneError::new(format!(
                    "stale merge input:{lane_id} expected:{expected_revision} current:{}",
                    lane.revision
                )));
            }

            normalized_inputs.push(MergeInput {
                lane_id: lane_id.clone(),
                expected_revision,
            });

            for (state_key, entry) in lane.latest_by_key() {
                let origin = MergeOrigin {
                    lane_id: lane.lane_id.clone(),
                    owner_tool_ref: lane.owner_tool_ref.clone(),
                    operation_id: entry.operation_id.clone(),
                    lane_revision: entry.lane_revision,
                    provenance_refs: entry.provenance_refs.clone(),
                };
                values
                    .entry(state_key.to_string())
                    .or_default()
                    .entry(entry.value_digest.clone())
                    .or_default()
                    .push(origin);
            }
        }

        let mut merged_values = Vec::<MergedValue>::new();
        let mut conflicts = Vec::<MergeConflict>::new();

        for (state_key, by_digest) in values {
            if by_digest.len() == 1 {
                let (value_digest, mut origins) = by_digest
                    .into_iter()
                    .next()
                    .ok_or_else(|| StateLaneError::new("empty merge digest set"))?;
                origins.sort();
                merged_values.push(MergedValue {
                    state_key,
                    value_digest,
                    origins,
                });
                continue;
            }

            let mut variants = Vec::<MergeVariant>::new();
            for (value_digest, mut origins) in by_digest {
                origins.sort();
                variants.push(MergeVariant {
                    value_digest,
                    origins,
                });
            }
            conflicts.push(MergeConflict {
                state_key,
                variants,
            });
        }

        Ok(MergeView {
            merge_id: request.merge_id.clone(),
            consumer_tool_ref: request.consumer_tool_ref.clone(),
            inputs: normalized_inputs,
            values: merged_values,
            conflicts,
        })
    }

    pub fn issue_validation_receipt(
        &mut self,
        view: &MergeView,
        evidence: ValidationEvidenceInput,
    ) -> StateLaneResult<ValidationReceipt> {
        self.require_merge_fresh(view)?;
        view.require_consistent()?;

        require_id(&evidence.validation_id, "validation id")?;
        require_id(&evidence.validator_tool_ref, "validator tool ref")?;
        require_id(&evidence.merge_id, "validation merge id")?;
        require_sha256(&evidence.result_digest, "validation result digest")?;

        if evidence.merge_id != view.merge_id {
            return Err(StateLaneError::new(
                "validation evidence is bound to another merge",
            ));
        }
        if evidence.validator_tool_ref != view.consumer_tool_ref {
            return Err(StateLaneError::new(
                "validator did not consume the merge view being validated",
            ));
        }
        if view.values.is_empty() {
            return Err(StateLaneError::new(
                "validation requires at least one merged state value",
            ));
        }
        if evidence.evidence_refs.is_empty() || evidence.evidence_refs.len() > MAX_PROVENANCE_REFS {
            return Err(StateLaneError::new(
                "validation requires bounded supporting evidence",
            ));
        }

        let mut refs = BTreeSet::<String>::new();
        for reference in &evidence.evidence_refs {
            require_id(reference, "validation evidence ref")?;
            if !refs.insert(reference.clone()) {
                return Err(StateLaneError::new("duplicate validation evidence ref"));
            }
        }

        if self.validation_ids.contains(&evidence.validation_id) {
            return Err(StateLaneError::new("duplicate validation id"));
        }

        let receipt = ValidationReceipt {
            validation_id: evidence.validation_id.clone(),
            validator_tool_ref: evidence.validator_tool_ref,
            merge_id: evidence.merge_id,
            inputs: view.inputs.clone(),
            values: view.values.clone(),
            disposition: evidence.disposition,
            result_digest: evidence.result_digest,
            evidence_refs: refs.into_iter().collect(),
        };

        self.validation_ids.insert(evidence.validation_id);
        Ok(receipt)
    }

    pub fn require_validation_current(&self, receipt: &ValidationReceipt) -> StateLaneResult<()> {
        if receipt.inputs.is_empty() || receipt.inputs.len() > MAX_LANES_PER_MERGE {
            return Err(StateLaneError::new(
                "validation receipt has invalid lane bindings",
            ));
        }
        if receipt.values.is_empty() {
            return Err(StateLaneError::new(
                "validation receipt has no validated values",
            ));
        }

        let mut seen = BTreeSet::<String>::new();
        for input in &receipt.inputs {
            if !seen.insert(input.lane_id.clone()) {
                return Err(StateLaneError::new(
                    "validation receipt contains duplicate lane binding",
                ));
            }
            let lane = self
                .lanes
                .get(&input.lane_id)
                .ok_or_else(|| StateLaneError::new("validated lane no longer exists"))?;
            if lane.revision != input.expected_revision {
                return Err(StateLaneError::new(format!(
                    "validation receipt is stale:{} expected:{} current:{}",
                    input.lane_id, input.expected_revision, lane.revision
                )));
            }
        }
        Ok(())
    }

    pub fn require_merge_fresh(&self, view: &MergeView) -> StateLaneResult<()> {
        if view.inputs.is_empty() || view.inputs.len() > MAX_LANES_PER_MERGE {
            return Err(StateLaneError::new("invalid merge view lane set"));
        }

        let mut seen = BTreeSet::<String>::new();
        for input in &view.inputs {
            if !seen.insert(input.lane_id.clone()) {
                return Err(StateLaneError::new("duplicate merge view lane input"));
            }
            let lane = self
                .lanes
                .get(&input.lane_id)
                .ok_or_else(|| StateLaneError::new("merge view lane no longer exists"))?;
            if lane.revision != input.expected_revision {
                return Err(StateLaneError::new(format!(
                    "merge view is stale:{} expected:{} current:{}",
                    input.lane_id, input.expected_revision, lane.revision
                )));
            }
        }
        Ok(())
    }
}
