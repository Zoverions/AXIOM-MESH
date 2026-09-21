//! A2A (Agent‑to‑Agent) support utilities.
//! This module provides a very small stub that mimics the
//! `supportedInterfaces` endpoint used by the AXIOM mesh.
//! The implementation is deliberately minimal – it only
//! exists to give the integration tests a concrete target
//! for the “endpoint‑loss and fallback substitution” finding.

use std::collections::HashMap;

/// Errors that can be returned by the A2A helpers.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum A2aError {
    /// The `supportedInterfaces` endpoint is unavailable.
    #[error("supportedInterfaces endpoint missing")]
    EndpointMissing,
    /// The response payload could not be parsed.
    #[error("invalid payload")]
    InvalidPayload,
}

/// Represents the (mock) response of the `supportedInterfaces` endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SupportedInterfaces {
    /// Mapping from interface name to a version string.
    pub interfaces: HashMap<String, String>,
}

impl SupportedInterfaces {
    /// Construct a new empty set – used as a fallback when the endpoint is missing.
    pub fn empty() -> Self {
        Self {
            interfaces: HashMap::new(),
        }
    }
}

/// Query the (mock) `supportedInterfaces` endpoint.
///
/// In a real implementation this would perform an HTTP request
/// against a remote agent.  Here we simulate three scenarios:
///
/// * `Some(data)` – the endpoint is reachable and returns a JSON payload.
/// * `None` – the endpoint is missing (simulated network 404).
/// * `Err(_)` – the endpoint returned malformed data.
///
/// The function returns a `Result` that callers can match on to decide
/// whether to fall back to an empty set.
pub fn query_supported_interfaces(
    // In production this would be a URL or agent identifier.
    // For the test harness we simply pass a flag that selects the scenario.
    scenario: A2aScenario,
) -> Result<SupportedInterfaces, A2aError> {
    match scenario {
        A2aScenario::Success(data) => {
            // Simulate successful JSON parsing.
            let mut map = HashMap::new();
            for (k, v) in data {
                map.insert(k, v);
            }
            Ok(SupportedInterfaces { interfaces: map })
        }
        A2aScenario::Missing => Err(A2aError::EndpointMissing),
        A2aScenario::Malformed => Err(A2aError::InvalidPayload),
    }
}

/// Helper enum used only by the test harness to drive the stub behaviour.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum A2aScenario {
    /// Successful response with the supplied key/value pairs.
    Success(Vec<(String, String)>),
    /// The endpoint cannot be reached.
    Missing,
    /// The endpoint returns data that cannot be parsed.
    Malformed,
}
