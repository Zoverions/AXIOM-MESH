use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

const MAX_SET_ITEMS: usize = 128;
const MAX_IDENTIFIER_BYTES: usize = 192;
const FIXTURE_HEADER: &str = "case_id\tgrant_verified\tintent_bound\tgrant_actions\tgrant_purposes\tgrant_destinations\tgrant_resources\tintent_actions\tintent_purposes\tintent_destinations\tintent_resources";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntentAttenuationError {
    message: String,
}

impl IntentAttenuationError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for IntentAttenuationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for IntentAttenuationError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntentAttenuationCase {
    case_id: String,
    grant_verified: bool,
    intent_bound: bool,
    grant_actions: Vec<String>,
    grant_purposes: Vec<String>,
    grant_destinations: Vec<String>,
    grant_resources: Vec<String>,
    intent_actions: Vec<String>,
    intent_purposes: Vec<String>,
    intent_destinations: Vec<String>,
    intent_resources: Vec<String>,
}

impl IntentAttenuationCase {
    pub fn case_id(&self) -> &str {
        &self.case_id
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IntentAttenuationChecks {
    pub actions: bool,
    pub purposes: bool,
    pub destinations: bool,
    pub resources: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IntentAttenuationResult {
    pub valid: bool,
    pub checks: IntentAttenuationChecks,
}

pub fn parse_intent_attenuation_vector_row(
    line: &str,
) -> Result<IntentAttenuationCase, IntentAttenuationError> {
    let columns = line.split('\t').collect::<Vec<_>>();
    if columns.len() != 11 {
        return Err(IntentAttenuationError::new(
            "Intent attenuation vector row must contain exactly 11 TSV columns",
        ));
    }

    validate_identifier(columns[0], "case_id")?;

    Ok(IntentAttenuationCase {
        case_id: columns[0].to_owned(),
        grant_verified: parse_bool(columns[1], "grant_verified")?,
        intent_bound: parse_bool(columns[2], "intent_bound")?,
        grant_actions: parse_set(columns[3], "grant_actions")?,
        grant_purposes: parse_set(columns[4], "grant_purposes")?,
        grant_destinations: parse_set(columns[5], "grant_destinations")?,
        grant_resources: parse_set(columns[6], "grant_resources")?,
        intent_actions: parse_set(columns[7], "intent_actions")?,
        intent_purposes: parse_set(columns[8], "intent_purposes")?,
        intent_destinations: parse_set(columns[9], "intent_destinations")?,
        intent_resources: parse_set(columns[10], "intent_resources")?,
    })
}

pub fn parse_intent_attenuation_fixture(
    text: &str,
) -> Result<Vec<IntentAttenuationCase>, IntentAttenuationError> {
    let normalized = text.replace("\r\n", "\n");
    let mut lines = normalized.lines();
    if lines.next() != Some(FIXTURE_HEADER) {
        return Err(IntentAttenuationError::new(
            "Intent attenuation fixture header is invalid",
        ));
    }

    let mut seen = BTreeSet::new();
    let mut cases = Vec::new();
    for line in lines {
        let case = parse_intent_attenuation_vector_row(line)?;
        if !seen.insert(case.case_id.clone()) {
            return Err(IntentAttenuationError::new(format!(
                "Duplicate intent attenuation case_id: {}",
                case.case_id
            )));
        }
        cases.push(case);
    }
    Ok(cases)
}

pub fn verify_intent_attenuation(
    case: &IntentAttenuationCase,
) -> Result<IntentAttenuationResult, IntentAttenuationError> {
    if !case.grant_verified {
        return Err(IntentAttenuationError::new(
            "Authority grant must be independently verified before attenuation evaluation",
        ));
    }
    if !case.intent_bound {
        return Err(IntentAttenuationError::new(
            "Authority intent must be pre-bound before attenuation evaluation",
        ));
    }

    let checks = IntentAttenuationChecks {
        actions: contains_all(&case.grant_actions, &case.intent_actions),
        purposes: contains_all(&case.grant_purposes, &case.intent_purposes),
        destinations: contains_all(&case.grant_destinations, &case.intent_destinations),
        resources: contains_all(&case.grant_resources, &case.intent_resources),
    };

    Ok(IntentAttenuationResult {
        valid: checks.actions && checks.purposes && checks.destinations && checks.resources,
        checks,
    })
}

fn parse_bool(value: &str, label: &str) -> Result<bool, IntentAttenuationError> {
    match value {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(IntentAttenuationError::new(format!(
            "{label} must be literal true or false"
        ))),
    }
}

fn parse_set(value: &str, label: &str) -> Result<Vec<String>, IntentAttenuationError> {
    if value.is_empty() {
        return Ok(Vec::new());
    }

    let values = value.split(',').map(str::to_owned).collect::<Vec<_>>();
    if values.len() > MAX_SET_ITEMS {
        return Err(IntentAttenuationError::new(format!(
            "{label} exceeds {MAX_SET_ITEMS} items"
        )));
    }

    for item in &values {
        validate_identifier(item, label)?;
    }
    for pair in values.windows(2) {
        if pair[0].as_str() >= pair[1].as_str() {
            return Err(IntentAttenuationError::new(format!(
                "{label} must be sorted and unique"
            )));
        }
    }

    Ok(values)
}

fn validate_identifier(value: &str, label: &str) -> Result<(), IntentAttenuationError> {
    if value.len() > MAX_IDENTIFIER_BYTES {
        return Err(IntentAttenuationError::new(format!(
            "{label} exceeds {MAX_IDENTIFIER_BYTES} bytes"
        )));
    }

    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return Err(IntentAttenuationError::new(format!(
            "{label} must be a non-empty identifier"
        )));
    };
    if !first.is_ascii_alphanumeric() || !bytes.all(is_identifier_tail_byte) {
        return Err(IntentAttenuationError::new(format!(
            "{label} contains an invalid identifier"
        )));
    }
    Ok(())
}

fn is_identifier_tail_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'/' | b'-')
}

fn contains_all(parent: &[String], child: &[String]) -> bool {
    child.iter().all(|item| parent.binary_search(item).is_ok())
}
