//! Integration tests that encode the negative fixtures described in issue #1575.
//! Each test targets a specific AXIOM watch finding and asserts that the
//! system behaves safely when the adverse condition is exercised.

use axiom_mesh::a2a::{query_supported_interfaces, A2aScenario, A2aError};
use axiom_mesh::payment::{
    sign, submit, PreparedEffect, PaymentError,
};

/// Test that a missing `supportedInterfaces` endpoint is detected and
/// that callers can safely fall back to an empty set.
#[test]
fn test_a2a_supported_interfaces_endpoint_missing() {
    let result = query_supported_interfaces(A2aScenario::Missing);
    assert!(matches!(result, Err(A2aError::EndpointMissing)));

    // Fallback behaviour – callers may replace the error with an empty set.
    let fallback = SupportedInterfaces::empty();
    assert!(fallback.interfaces.is_empty());
}

/// Test that a malformed payload from the endpoint is rejected.
#[test]
fn test_a2a_supported_interfaces_malformed_payload() {
    let result = query_supported_interfaces(A2aScenario::Malformed);
    assert!(matches!(result, Err(A2aError::InvalidPayload)));
}

/// Test the happy‑path of a successful query.
#[test]
fn test_a2a_supported_interfaces_success() {
    let data = vec![
        ("http".to_string(), "1.0".to_string()),
        ("grpc".to_string(), "2.1".to_string()),
    ];
    let result = query_supported_interfaces(A2aScenario::Success(data.clone()));
    assert!(result.is_ok());
    let interfaces = result.unwrap();
    for (k, v) in data {
        assert_eq!(interfaces.interfaces.get(&k).unwrap(), &v);
    }
}

/// Verify that a payment submission fails when the claimed prepared effect
/// does not match the signed payload (Effect Mismatch finding).
#[test]
fn test_payment_effect_mismatch() {
    let prepared = PreparedEffect {
        id: "inv-001".into(),
        amount: 1000,
        timestamp: 1_700_000_000,
    };
    let signed = sign(&prepared);

    // Tamper with the claimed prepared effect.
    let claimed = PreparedEffect {
        id: "inv-001".into(),
        amount: 2000, // different amount
        timestamp: 1_700_000_000,
    };

    let now = 1_700_000_100;
    let max_age = 300;
    let res = submit(&signed, &claimed, now, max_age);
    assert!(matches!(res, Err(PaymentError::EffectMismatch)));
}

/// Verify that a payment submission fails when the request is stale
/// (Stale‑Simulation finding).
#[test]
fn test_payment_stale_request() {
    let prepared = PreparedEffect {
        id: "inv-002".into(),
        amount: 500,
        timestamp: 1_600_000_000, // far in the past
    };
    let signed = sign(&prepared);

    // Claim the same prepared effect (no mismatch).
    let claimed = prepared.clone();

    let now = 1_700_000_000; // 100_000_000 seconds later
    let max_age = 86_400; // 1 day

    let res = submit(&signed, &claimed, now, max_age);
    assert!(matches!(res, Err(PaymentError::StaleRequest)));
}
