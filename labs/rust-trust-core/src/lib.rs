#![forbid(unsafe_code)]

use std::collections::HashSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

const SAFE_INTEGER_MIN: i64 = -9_007_199_254_740_991;
const SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrincipalEvidence<'a> {
    pub subject: &'a str,
    pub verified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapabilityEvidence<'a> {
    pub capability: &'a str,
    pub authorized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConsentEvidence {
    pub required: bool,
    pub valid: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EffectBudgetEvidence {
    pub required: bool,
    pub remaining: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorityEvidence<'a> {
    pub principal: PrincipalEvidence<'a>,
    pub capability: CapabilityEvidence<'a>,
    pub consent: ConsentEvidence,
    pub budget: EffectBudgetEvidence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DenyReason {
    UnverifiedPrincipal,
    UnauthorizedCapability,
    MissingRequiredConsent,
    ExhaustedEffectBudget,
}

/// A validated authority token. Callers cannot construct one directly.
///
/// Authority grants are intentionally non-copyable so later effect-bearing APIs
/// can consume a grant rather than accidentally treating it as reusable ambient
/// authority.
///
/// ```compile_fail
/// use axiom_trust_core_lab::{
///     AuthorityEvidence, CapabilityEvidence, ConsentEvidence, EffectBudgetEvidence,
///     PrincipalEvidence, evaluate_authority,
/// };
///
/// let grant = evaluate_authority(AuthorityEvidence {
///     principal: PrincipalEvidence { subject: "principal:test", verified: true },
///     capability: CapabilityEvidence { capability: "synthetic.effect", authorized: true },
///     consent: ConsentEvidence { required: false, valid: false },
///     budget: EffectBudgetEvidence { required: false, remaining: 0 },
/// }).unwrap();
/// let consumed = grant;
/// let reused = grant;
/// # let _ = (consumed, reused);
/// ```
///
/// ```compile_fail
/// use axiom_trust_core_lab::AuthorityGrant;
/// let _ = AuthorityGrant {
///     subject: "principal:test",
///     capability: "synthetic.effect",
/// };
/// ```
#[derive(Debug, PartialEq, Eq)]
pub struct AuthorityGrant<'a> {
    subject: &'a str,
    capability: &'a str,
}

impl<'a> AuthorityGrant<'a> {
    pub fn subject(&self) -> &'a str {
        self.subject
    }

    pub fn capability(&self) -> &'a str {
        self.capability
    }
}

pub fn evaluate_authority<'a>(
    evidence: AuthorityEvidence<'a>,
) -> Result<AuthorityGrant<'a>, DenyReason> {
    if !evidence.principal.verified {
        return Err(DenyReason::UnverifiedPrincipal);
    }

    if !evidence.capability.authorized {
        return Err(DenyReason::UnauthorizedCapability);
    }

    if evidence.consent.required && !evidence.consent.valid {
        return Err(DenyReason::MissingRequiredConsent);
    }

    if evidence.budget.required && evidence.budget.remaining == 0 {
        return Err(DenyReason::ExhaustedEffectBudget);
    }

    Ok(AuthorityGrant {
        subject: evidence.principal.subject,
        capability: evidence.capability.capability,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalScalar {
    Null,
    Bool(bool),
    SafeInteger(i64),
    NegativeZero,
    AsciiString(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CanonicalValue {
    Scalar(CanonicalScalar),
    ScalarArray(Vec<CanonicalScalar>),
    AsciiKeyObject(Vec<(String, CanonicalScalar)>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalCase {
    case_id: String,
    value: CanonicalValue,
}

impl CanonicalCase {
    pub fn case_id(&self) -> &str {
        &self.case_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VectorError {
    message: String,
}

impl VectorError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for VectorError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for VectorError {}

pub fn parse_canonical_vector_row(line: &str) -> Result<CanonicalCase, VectorError> {
    let columns: Vec<_> = line.split('\t').collect();
    if columns.len() != 3 {
        return Err(VectorError::new(format!(
            "canonical vector row must contain exactly 3 TSV columns: {line}"
        )));
    }

    let case_id = columns[0];
    let kind = columns[1];
    let payload = columns[2];
    if case_id.is_empty() {
        return Err(VectorError::new(
            "canonical vector case_id must be non-empty",
        ));
    }

    let value = match kind {
        "null" => {
            if !payload.is_empty() {
                return Err(VectorError::new("null payload must be empty"));
            }
            CanonicalValue::Scalar(CanonicalScalar::Null)
        }
        "bool" => CanonicalValue::Scalar(match payload {
            "true" => CanonicalScalar::Bool(true),
            "false" => CanonicalScalar::Bool(false),
            _ => {
                return Err(VectorError::new(format!(
                    "invalid boolean payload: {payload}"
                )));
            }
        }),
        "safe_integer" => {
            CanonicalValue::Scalar(CanonicalScalar::SafeInteger(parse_safe_integer(payload)?))
        }
        "negative_zero" => {
            if payload != "-0" {
                return Err(VectorError::new("negative_zero payload must be -0"));
            }
            CanonicalValue::Scalar(CanonicalScalar::NegativeZero)
        }
        "ascii_string" => CanonicalValue::Scalar(CanonicalScalar::AsciiString(
            parse_ascii_string(payload)?.to_owned(),
        )),
        "scalar_array" => {
            let values = if payload.is_empty() {
                Vec::new()
            } else {
                payload
                    .split(',')
                    .map(parse_scalar_token)
                    .collect::<Result<Vec<_>, _>>()?
            };
            CanonicalValue::ScalarArray(values)
        }
        "ascii_key_object" => CanonicalValue::AsciiKeyObject(parse_ascii_key_object(payload)?),
        _ => {
            return Err(VectorError::new(format!(
                "unknown canonical vector kind: {kind}"
            )));
        }
    };

    Ok(CanonicalCase {
        case_id: case_id.to_owned(),
        value,
    })
}

pub fn canonicalize_case(case: &CanonicalCase) -> String {
    match &case.value {
        CanonicalValue::Scalar(value) => canonicalize_scalar(value),
        CanonicalValue::ScalarArray(values) => {
            let items = values
                .iter()
                .map(canonicalize_scalar)
                .collect::<Vec<_>>()
                .join(",");
            format!("[{items}]")
        }
        CanonicalValue::AsciiKeyObject(values) => {
            let mut sorted = values.iter().collect::<Vec<_>>();
            sorted.sort_by(|left, right| left.0.cmp(&right.0));
            let items = sorted
                .into_iter()
                .map(|(key, value)| format!("\"{key}\":{}", canonicalize_scalar(value)))
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{items}}}")
        }
    }
}

fn parse_scalar_token(token: &str) -> Result<CanonicalScalar, VectorError> {
    match token {
        "n" => Ok(CanonicalScalar::Null),
        "b:true" => Ok(CanonicalScalar::Bool(true)),
        "b:false" => Ok(CanonicalScalar::Bool(false)),
        "z" => Ok(CanonicalScalar::NegativeZero),
        _ if token.starts_with("i:") => Ok(CanonicalScalar::SafeInteger(parse_safe_integer(
            &token[2..],
        )?)),
        _ if token.starts_with("s:") => Ok(CanonicalScalar::AsciiString(
            parse_ascii_string(&token[2..])?.to_owned(),
        )),
        _ => Err(VectorError::new(format!(
            "unsupported scalar token: {token}"
        ))),
    }
}

fn parse_safe_integer(payload: &str) -> Result<i64, VectorError> {
    if !has_canonical_integer_syntax(payload) || payload == "-0" {
        return Err(VectorError::new(format!(
            "invalid safe integer payload: {payload}"
        )));
    }

    let value = payload.parse::<i64>().map_err(|_| {
        VectorError::new(format!(
            "safe integer payload is outside the admitted range: {payload}"
        ))
    })?;
    if !(SAFE_INTEGER_MIN..=SAFE_INTEGER_MAX).contains(&value) {
        return Err(VectorError::new(format!(
            "safe integer payload is outside the admitted range: {payload}"
        )));
    }
    Ok(value)
}

fn has_canonical_integer_syntax(payload: &str) -> bool {
    if payload.is_empty() {
        return false;
    }
    let digits = payload.strip_prefix('-').unwrap_or(payload);
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    digits == "0" || !digits.starts_with('0')
}

fn parse_ascii_string(payload: &str) -> Result<&str, VectorError> {
    if payload
        .bytes()
        .any(|byte| !(0x20..=0x7e).contains(&byte) || byte == b'"' || byte == b'\\')
    {
        return Err(VectorError::new(format!(
            "string payload is outside canonical-value-v0 ASCII: {payload}"
        )));
    }
    Ok(payload)
}

fn parse_ascii_key_object(payload: &str) -> Result<Vec<(String, CanonicalScalar)>, VectorError> {
    if payload.is_empty() {
        return Ok(Vec::new());
    }

    let mut seen = HashSet::new();
    let mut values = Vec::new();
    for pair in payload.split(';') {
        let (key, token) = pair
            .split_once('=')
            .ok_or_else(|| VectorError::new(format!("malformed object pair: {pair}")))?;
        if key.is_empty() || token.is_empty() {
            return Err(VectorError::new(format!("malformed object pair: {pair}")));
        }
        if !is_valid_object_key(key) {
            return Err(VectorError::new(format!("invalid object key: {key}")));
        }
        if !seen.insert(key.to_owned()) {
            return Err(VectorError::new(format!("duplicate object key: {key}")));
        }
        values.push((key.to_owned(), parse_scalar_token(token)?));
    }
    Ok(values)
}

fn is_valid_object_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn canonicalize_scalar(value: &CanonicalScalar) -> String {
    match value {
        CanonicalScalar::Null => "null".to_owned(),
        CanonicalScalar::Bool(true) => "true".to_owned(),
        CanonicalScalar::Bool(false) => "false".to_owned(),
        CanonicalScalar::SafeInteger(value) => value.to_string(),
        CanonicalScalar::NegativeZero => "0".to_owned(),
        CanonicalScalar::AsciiString(value) => format!("\"{value}\""),
    }
}
