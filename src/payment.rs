//! Minimal payment flow stub used for the “prepare → sign → submit” negative fixture.
//! The real AXIOM mesh would involve cryptographic signing and on‑chain settlement.
//! This file provides just enough structure for the integration test to verify
//! that stale or mismatched effects are rejected.

use std::collections::HashMap;
use thiserror::Error;

/// Errors that can arise during the payment workflow.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum PaymentError {
    #[error("prepared effect does not match submitted effect")]
    EffectMismatch,
    #[error("payment request is stale")]
    StaleRequest,
    #[error("signature verification failed")]
    InvalidSignature,
}

/// Represents a prepared payment effect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedEffect {
    /// Arbitrary identifier of the payment (e.g., invoice id).
    pub id: String,
    /// Amount in the smallest denomination.
    pub amount: u64,
    /// Timestamp of preparation (seconds since epoch).
    pub timestamp: u64,
}

/// Represents a signed payment ready for submission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedPayment {
    pub prepared: PreparedEffect,
    /// Mock signature – in real code this would be a cryptographic blob.
    pub signature: Vec<u8>,
}

/// Simulate signing a prepared effect.
///
/// The mock simply returns the effect wrapped with a deterministic “signature”.
pub fn sign(prepared: &PreparedEffect) -> SignedPayment {
    let mut sig = prepared.id.as_bytes().to_vec();
    sig.extend_from_slice(&prepared.amount.to_be_bytes());
    sig.extend_from_slice(&prepared.timestamp.to_be_bytes());
    SignedPayment {
        prepared: prepared.clone(),
        signature: sig,
    }
}

/// Submit a signed payment.
///
/// The function checks two negative conditions:
/// 1. The submitted effect must be identical to the one that was prepared.
/// 2. The request must not be older than `max_age_secs`.
pub fn submit(
    signed: &SignedPayment,
    // The original prepared effect that the caller claims to be submitting.
    claimed_prepared: &PreparedEffect,
    // Current time supplied by the test harness.
    now_secs: u64,
    // Maximum allowed age for a prepared effect.
    max_age_secs: u64,
) -> Result<(), PaymentError> {
    // 1. Effect mismatch.
    if signed.prepared != *claimed_prepared {
        return Err(PaymentError::EffectMismatch);
    }

    // 2. Staleness check.
    if now_secs.saturating_sub(claimed_prepared.timestamp) > max_age_secs {
        return Err(PaymentError::StaleRequest);
    }

    // In a real implementation we would verify the signature cryptographically.
    // Here we assume the mock signature is always valid.

    Ok(())
}
