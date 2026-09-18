#![forbid(unsafe_code)]

use axiom_personal_agent_kernel_rust_lab::{
    BudgetRequest, EffectPort, Kernel, KernelError, OfflineConsumptionIntent, OfflineEffectReceipt,
    OfflineEnvelopeLedger, RuntimeSurface,
};
use axiom_personal_kernel_offline_journal_lab::{JournalError, OfflineJournal};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};

const STORED_SCHEMA: &str = "axiom-personal-offline-consumption-intent.v0";

#[derive(Debug)]
pub enum DurableOfflineError {
    Kernel(KernelError),
    Journal(JournalError),
    InvalidPayload,
    SchemaMismatch,
    SequenceMismatch,
}

impl Display for DurableOfflineError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::Kernel(_) => "offline semantic-core validation failed",
            Self::Journal(_) => "offline durable journal operation failed",
            Self::InvalidPayload => "offline durable payload is invalid or noncanonical",
            Self::SchemaMismatch => "offline durable payload schema is unsupported",
            Self::SequenceMismatch => "offline durable payload sequence does not match journal",
        };
        f.write_str(message)
    }
}

impl Error for DurableOfflineError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Kernel(error) => Some(error),
            Self::Journal(error) => Some(error),
            _ => None,
        }
    }
}

impl From<KernelError> for DurableOfflineError {
    fn from(value: KernelError) -> Self {
        Self::Kernel(value)
    }
}

impl From<JournalError> for DurableOfflineError {
    fn from(value: JournalError) -> Self {
        Self::Journal(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredBudgetRequest {
    budget_id: String,
    amount: u64,
    currency: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredIntent {
    schema: String,
    envelope_ref: String,
    sequence: u64,
    owner_subject_ref: String,
    target_device_ref: String,
    plan_digest: String,
    node_id: String,
    capability_ref: String,
    revocation_epoch: u64,
    budget_requests: Vec<StoredBudgetRequest>,
}

pub fn recover_or_register(
    kernel: &Kernel,
    ledger: &mut OfflineEnvelopeLedger,
    journal: &mut OfflineJournal,
) -> Result<u64, DurableOfflineError> {
    let envelope_ref = ledger.envelope_ref();

    match journal.consumed_sequence(envelope_ref) {
        None => {
            journal.register_envelope(envelope_ref)?;
            Ok(0)
        }
        Some(_) => {
            let records = journal.consumptions_for(envelope_ref)?;
            for record in records {
                let intent = decode_intent(&record.payload)?;
                if intent.sequence != record.sequence {
                    return Err(DurableOfflineError::SequenceMismatch);
                }
                kernel.replay_offline_consumption(ledger, &intent)?;
            }
            Ok(ledger.effects_consumed())
        }
    }
}

pub fn persist_prepared_intent(
    journal: &mut OfflineJournal,
    intent: &OfflineConsumptionIntent,
) -> Result<(), DurableOfflineError> {
    let payload = encode_intent(intent)?;
    journal.consume_effect(&intent.envelope_ref, intent.sequence, &payload)?;
    Ok(())
}

pub fn execute_durable_offline(
    kernel: &Kernel,
    ledger: &mut OfflineEnvelopeLedger,
    journal: &mut OfflineJournal,
    target_device_ref: &str,
    current_surface: &RuntimeSurface,
    now_unix_s: u64,
    budget_requests: &[BudgetRequest],
    port: &mut impl EffectPort,
) -> Result<OfflineEffectReceipt, DurableOfflineError> {
    let intent = kernel.prepare_offline_consumption(
        ledger,
        target_device_ref,
        current_surface,
        now_unix_s,
        budget_requests,
    )?;

    persist_prepared_intent(journal, &intent)?;

    let committed = kernel.commit_offline_consumption(
        ledger,
        &intent,
        current_surface,
        now_unix_s,
    )?;

    Ok(kernel.execute_committed_offline(&committed, port)?)
}

fn encode_intent(intent: &OfflineConsumptionIntent) -> Result<Vec<u8>, DurableOfflineError> {
    let stored = StoredIntent {
        schema: STORED_SCHEMA.to_string(),
        envelope_ref: intent.envelope_ref.clone(),
        sequence: intent.sequence,
        owner_subject_ref: intent.owner_subject_ref.clone(),
        target_device_ref: intent.target_device_ref.clone(),
        plan_digest: intent.plan_digest.clone(),
        node_id: intent.node_id.clone(),
        capability_ref: intent.capability_ref.clone(),
        revocation_epoch: intent.revocation_epoch,
        budget_requests: intent
            .budget_requests
            .iter()
            .map(|request| StoredBudgetRequest {
                budget_id: request.budget_id.clone(),
                amount: request.amount,
                currency: request.currency.clone(),
            })
            .collect(),
    };
    serde_json::to_vec(&stored).map_err(|_| DurableOfflineError::InvalidPayload)
}

fn decode_intent(payload: &[u8]) -> Result<OfflineConsumptionIntent, DurableOfflineError> {
    let stored: StoredIntent =
        serde_json::from_slice(payload).map_err(|_| DurableOfflineError::InvalidPayload)?;
    let canonical =
        serde_json::to_vec(&stored).map_err(|_| DurableOfflineError::InvalidPayload)?;
    if canonical != payload {
        return Err(DurableOfflineError::InvalidPayload);
    }
    if stored.schema != STORED_SCHEMA {
        return Err(DurableOfflineError::SchemaMismatch);
    }

    Ok(OfflineConsumptionIntent {
        envelope_ref: stored.envelope_ref,
        sequence: stored.sequence,
        owner_subject_ref: stored.owner_subject_ref,
        target_device_ref: stored.target_device_ref,
        plan_digest: stored.plan_digest,
        node_id: stored.node_id,
        capability_ref: stored.capability_ref,
        revocation_epoch: stored.revocation_epoch,
        budget_requests: stored
            .budget_requests
            .into_iter()
            .map(|request| BudgetRequest {
                budget_id: request.budget_id,
                amount: request.amount,
                currency: request.currency,
            })
            .collect(),
    })
}
