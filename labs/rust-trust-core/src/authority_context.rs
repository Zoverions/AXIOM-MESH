use std::collections::BTreeSet;
use std::fmt;

const MAX_JSONL_LINE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
enum JsonValue {
    Object(Vec<(String, JsonValue)>),
    Array(Vec<JsonValue>),
    String(String),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityContextError {
    message: String,
}

impl AuthorityContextError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for AuthorityContextError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for AuthorityContextError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorityContextCase {
    case_id: String,
    context: JsonValue,
}

impl AuthorityContextCase {
    pub fn case_id(&self) -> &str {
        &self.case_id
    }
}

struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Result<Self, AuthorityContextError> {
        if text.is_empty() {
            return Err(AuthorityContextError::new(
                "Stage 5B JSON line must not be empty",
            ));
        }
        if text.len() > MAX_JSONL_LINE_BYTES {
            return Err(AuthorityContextError::new(
                "Stage 5B JSON line exceeds the 2 MiB laboratory limit",
            ));
        }
        if !text.is_ascii() {
            return Err(AuthorityContextError::new(
                "Stage 5B JSON transport must contain ASCII only",
            ));
        }
        Ok(Self {
            bytes: text.as_bytes(),
            position: 0,
        })
    }

    fn parse(mut self) -> Result<JsonValue, AuthorityContextError> {
        self.skip_spaces();
        let value = self.parse_value()?;
        self.skip_spaces();
        if self.position != self.bytes.len() {
            return Err(AuthorityContextError::new(
                "Stage 5B JSON line contains trailing data",
            ));
        }
        Ok(value)
    }

    fn skip_spaces(&mut self) {
        while self.peek() == Some(b' ') {
            self.position += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn take(&mut self) -> Option<u8> {
        let value = self.peek()?;
        self.position += 1;
        Some(value)
    }

    fn consume_literal(&mut self, literal: &[u8]) -> bool {
        let end = self.position.saturating_add(literal.len());
        if self.bytes.get(self.position..end) == Some(literal) {
            self.position = end;
            true
        } else {
            false
        }
    }

    fn parse_value(&mut self) -> Result<JsonValue, AuthorityContextError> {
        self.skip_spaces();
        match self.peek() {
            Some(b'{') => self.parse_object(),
            Some(b'[') => self.parse_array(),
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b't') if self.consume_literal(b"true") => Ok(JsonValue::Bool(true)),
            Some(b'f') if self.consume_literal(b"false") => Ok(JsonValue::Bool(false)),
            Some(b'n') if self.consume_literal(b"null") => Ok(JsonValue::Null),
            Some(_) => Err(AuthorityContextError::new(
                "Stage 5B JSON transport admits only object, array, string, boolean, and null values",
            )),
            None => Err(AuthorityContextError::new(
                "Stage 5B JSON value is unexpectedly empty",
            )),
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, AuthorityContextError> {
        self.expect_byte(b'{', "object must begin with {")?;
        self.skip_spaces();
        let mut fields = Vec::new();
        let mut keys = BTreeSet::new();
        if self.peek() == Some(b'}') {
            self.position += 1;
            return Ok(JsonValue::Object(fields));
        }

        loop {
            self.skip_spaces();
            if self.peek() != Some(b'"') {
                return Err(AuthorityContextError::new(
                    "Stage 5B JSON object keys must be strings",
                ));
            }
            let key = self.parse_string()?;
            if !keys.insert(key.clone()) {
                return Err(AuthorityContextError::new(format!(
                    "Stage 5B JSON object contains duplicate key {key}"
                )));
            }
            self.skip_spaces();
            self.expect_byte(b':', "object key must be followed by :")?;
            let value = self.parse_value()?;
            fields.push((key, value));
            self.skip_spaces();
            match self.take() {
                Some(b',') => continue,
                Some(b'}') => break,
                _ => {
                    return Err(AuthorityContextError::new(
                        "Stage 5B JSON object must use comma-separated fields",
                    ));
                }
            }
        }

        Ok(JsonValue::Object(fields))
    }

    fn parse_array(&mut self) -> Result<JsonValue, AuthorityContextError> {
        self.expect_byte(b'[', "array must begin with [")?;
        self.skip_spaces();
        let mut values = Vec::new();
        if self.peek() == Some(b']') {
            self.position += 1;
            return Ok(JsonValue::Array(values));
        }

        loop {
            values.push(self.parse_value()?);
            self.skip_spaces();
            match self.take() {
                Some(b',') => continue,
                Some(b']') => break,
                _ => {
                    return Err(AuthorityContextError::new(
                        "Stage 5B JSON array must use comma-separated values",
                    ));
                }
            }
        }

        Ok(JsonValue::Array(values))
    }

    fn parse_string(&mut self) -> Result<String, AuthorityContextError> {
        self.expect_byte(b'"', "string must begin with a quote")?;
        let mut decoded = String::new();
        loop {
            match self.take() {
                Some(b'"') => return Ok(decoded),
                Some(b'\\') => match self.take() {
                    Some(b'"') => decoded.push('"'),
                    Some(b'\\') => decoded.push('\\'),
                    _ => {
                        return Err(AuthorityContextError::new(
                            "Stage 5B JSON strings admit only quote and backslash escapes",
                        ));
                    }
                },
                Some(byte @ 0x20..=0x7e) => decoded.push(char::from(byte)),
                Some(_) => {
                    return Err(AuthorityContextError::new(
                        "Stage 5B JSON strings must contain printable ASCII only",
                    ));
                }
                None => {
                    return Err(AuthorityContextError::new(
                        "Stage 5B JSON string is unterminated",
                    ));
                }
            }
        }
    }

    fn expect_byte(&mut self, expected: u8, message: &str) -> Result<(), AuthorityContextError> {
        if self.take() == Some(expected) {
            Ok(())
        } else {
            Err(AuthorityContextError::new(message))
        }
    }
}

fn parse_json(text: &str) -> Result<JsonValue, AuthorityContextError> {
    Parser::new(text)?.parse()
}

fn exact_object<'a>(
    value: &'a JsonValue,
    fields: &[&str],
    label: &str,
) -> Result<&'a [(String, JsonValue)], AuthorityContextError> {
    let JsonValue::Object(object) = value else {
        return Err(AuthorityContextError::new(format!(
            "{label} must be an object"
        )));
    };
    if object.len() != fields.len() {
        return Err(AuthorityContextError::new(format!(
            "{label} must contain exactly the declared fields"
        )));
    }
    for (key, _) in object {
        if !fields.contains(&key.as_str()) {
            return Err(AuthorityContextError::new(format!(
                "{label} contains unsupported field {key}"
            )));
        }
    }
    for field in fields {
        if !object.iter().any(|(key, _)| key == field) {
            return Err(AuthorityContextError::new(format!(
                "{label} is missing required field {field}"
            )));
        }
    }
    Ok(object)
}

fn object_field<'a>(
    object: &'a [(String, JsonValue)],
    key: &str,
) -> Result<&'a JsonValue, AuthorityContextError> {
    object
        .iter()
        .find_map(|(candidate, value)| (candidate == key).then_some(value))
        .ok_or_else(|| AuthorityContextError::new(format!("missing required field {key}")))
}

fn ascii_string<'a>(
    value: &'a JsonValue,
    label: &str,
    min: usize,
    max: usize,
) -> Result<&'a str, AuthorityContextError> {
    let JsonValue::String(text) = value else {
        return Err(AuthorityContextError::new(format!(
            "{label} must be a string"
        )));
    };
    if text.len() < min || text.len() > max || !text.is_ascii() {
        return Err(AuthorityContextError::new(format!(
            "{label} length must be between {min} and {max} printable-ASCII characters"
        )));
    }
    Ok(text)
}

fn valid_identifier_text(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.is_empty() || bytes.len() > 192 || !bytes[0].is_ascii_alphanumeric() {
        return false;
    }
    bytes[1..].iter().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'/' | b'-')
    })
}

fn identifier<'a>(value: &'a JsonValue, label: &str) -> Result<&'a str, AuthorityContextError> {
    let text = ascii_string(value, label, 1, 192)?;
    if !valid_identifier_text(text) {
        return Err(AuthorityContextError::new(format!(
            "{label} contains an invalid identifier"
        )));
    }
    Ok(text)
}

fn digest<'a>(value: &'a JsonValue, label: &str) -> Result<&'a str, AuthorityContextError> {
    let text = ascii_string(value, label, 64, 64)?;
    if !text
        .bytes()
        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(AuthorityContextError::new(format!(
            "{label} must be exactly 64 lowercase hexadecimal characters"
        )));
    }
    Ok(text)
}

fn decimal(bytes: &[u8]) -> Option<u32> {
    if !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    bytes.iter().try_fold(0_u32, |value, digit| {
        value.checked_mul(10)?.checked_add(u32::from(*digit - b'0'))
    })
}

fn leap_year(year: u32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn canonical_utc_timestamp<'a>(
    value: &'a JsonValue,
    label: &str,
) -> Result<&'a str, AuthorityContextError> {
    let text = ascii_string(value, label, 24, 24)?;
    let bytes = text.as_bytes();
    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return Err(AuthorityContextError::new(format!(
            "{label} must be canonical UTC ISO"
        )));
    }

    let year = decimal(&bytes[0..4]);
    let month = decimal(&bytes[5..7]);
    let day = decimal(&bytes[8..10]);
    let hour = decimal(&bytes[11..13]);
    let minute = decimal(&bytes[14..16]);
    let second = decimal(&bytes[17..19]);
    let millis = decimal(&bytes[20..23]);
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second), Some(millis)) =
        (year, month, day, hour, minute, second, millis)
    else {
        return Err(AuthorityContextError::new(format!(
            "{label} must be canonical UTC ISO"
        )));
    };

    let month_days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year(year) => 29,
        2 => 28,
        _ => 0,
    };
    if day == 0 || day > month_days || hour > 23 || minute > 59 || second > 59 || millis > 999 {
        return Err(AuthorityContextError::new(format!(
            "{label} must be canonical UTC ISO"
        )));
    }
    Ok(text)
}

fn sorted_unique_ascii_set(
    value: &JsonValue,
    label: &str,
    max_items: usize,
) -> Result<(), AuthorityContextError> {
    let JsonValue::Array(items) = value else {
        return Err(AuthorityContextError::new(format!(
            "{label} must be an array of at most {max_items} strings"
        )));
    };
    if items.len() > max_items {
        return Err(AuthorityContextError::new(format!(
            "{label} must be an array of at most {max_items} strings"
        )));
    }
    let mut previous: Option<&str> = None;
    for (index, item) in items.iter().enumerate() {
        let current = ascii_string(item, &format!("{label}[{index}]"), 1, 256)?;
        if previous.is_some_and(|prior| prior >= current) {
            return Err(AuthorityContextError::new(format!(
                "{label} must be sorted and unique"
            )));
        }
        previous = Some(current);
    }
    Ok(())
}

fn require_true(value: &JsonValue, label: &str) -> Result<(), AuthorityContextError> {
    if value == &JsonValue::Bool(true) {
        Ok(())
    } else {
        Err(AuthorityContextError::new(format!(
            "{label} must be literal true"
        )))
    }
}

fn validate_grant(value: &JsonValue) -> Result<(), AuthorityContextError> {
    let object = exact_object(
        value,
        &[
            "verified",
            "grant_id",
            "issuer",
            "principal_id",
            "resources",
            "actions",
            "purposes",
            "destinations",
            "expires_at",
            "policy_digest",
        ],
        "authority grant",
    )?;
    require_true(
        object_field(object, "verified")?,
        "authority grant verified",
    )?;
    identifier(
        object_field(object, "grant_id")?,
        "authority grant grant_id",
    )?;
    identifier(object_field(object, "issuer")?, "authority grant issuer")?;
    identifier(
        object_field(object, "principal_id")?,
        "authority grant principal_id",
    )?;
    sorted_unique_ascii_set(
        object_field(object, "resources")?,
        "authority grant resources",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "actions")?,
        "authority grant actions",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "purposes")?,
        "authority grant purposes",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "destinations")?,
        "authority grant destinations",
        128,
    )?;
    canonical_utc_timestamp(
        object_field(object, "expires_at")?,
        "authority grant expires_at",
    )?;
    digest(
        object_field(object, "policy_digest")?,
        "authority grant policy_digest",
    )?;
    Ok(())
}

fn validate_intent(value: &JsonValue) -> Result<(), AuthorityContextError> {
    let object = exact_object(
        value,
        &["bound", "actions", "purposes", "destinations", "resources"],
        "authority intent",
    )?;
    require_true(object_field(object, "bound")?, "authority intent bound")?;
    sorted_unique_ascii_set(
        object_field(object, "actions")?,
        "authority intent actions",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "purposes")?,
        "authority intent purposes",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "destinations")?,
        "authority intent destinations",
        128,
    )?;
    sorted_unique_ascii_set(
        object_field(object, "resources")?,
        "authority intent resources",
        128,
    )?;
    Ok(())
}

fn validate_request(value: &JsonValue) -> Result<(), AuthorityContextError> {
    let object = exact_object(
        value,
        &[
            "principal_id",
            "resource",
            "action",
            "purpose",
            "destination",
            "protocol",
            "causal_scope_id",
            "policy_digest",
        ],
        "authority request",
    )?;
    for key in [
        "principal_id",
        "resource",
        "action",
        "purpose",
        "destination",
        "protocol",
        "causal_scope_id",
    ] {
        identifier(
            object_field(object, key)?,
            &format!("authority request {key}"),
        )?;
    }
    digest(
        object_field(object, "policy_digest")?,
        "authority request policy_digest",
    )?;
    Ok(())
}

fn validate_history(value: &JsonValue) -> Result<(), AuthorityContextError> {
    let JsonValue::Array(entries) = value else {
        return Err(AuthorityContextError::new(
            "authority history must be an array of at most 4096 entries",
        ));
    };
    if entries.len() > 4096 {
        return Err(AuthorityContextError::new(
            "authority history must be an array of at most 4096 entries",
        ));
    }
    for (index, entry) in entries.iter().enumerate() {
        let label = format!("authority history[{index}]");
        let object = exact_object(
            entry,
            &[
                "causal_scope_id",
                "action",
                "resource",
                "purpose",
                "destination",
            ],
            &label,
        )?;
        for key in [
            "causal_scope_id",
            "action",
            "resource",
            "purpose",
            "destination",
        ] {
            identifier(object_field(object, key)?, &format!("{label}.{key}"))?;
        }
    }
    Ok(())
}

fn validate_restrictions(value: &JsonValue) -> Result<(), AuthorityContextError> {
    let JsonValue::Array(entries) = value else {
        return Err(AuthorityContextError::new(
            "composition restrictions must be an array of at most 256 entries",
        ));
    };
    if entries.len() > 256 {
        return Err(AuthorityContextError::new(
            "composition restrictions must be an array of at most 256 entries",
        ));
    }
    for (index, entry) in entries.iter().enumerate() {
        let label = format!("composition restrictions[{index}]");
        let object = exact_object(entry, &["id", "ordered_actions"], &label)?;
        identifier(object_field(object, "id")?, &format!("{label}.id"))?;
        let actions = object_field(object, "ordered_actions")?;
        let JsonValue::Array(actions) = actions else {
            return Err(AuthorityContextError::new(format!(
                "{label}.ordered_actions must be an array of at most 16 action IDs"
            )));
        };
        if actions.len() < 2 || actions.len() > 16 {
            return Err(AuthorityContextError::new(
                "composition restriction must contain between two and sixteen actions",
            ));
        }
        for (action_index, action) in actions.iter().enumerate() {
            identifier(action, &format!("{label}.ordered_actions[{action_index}]"))?;
        }
    }
    Ok(())
}

pub fn parse_authority_context_line(
    line: &str,
) -> Result<AuthorityContextCase, AuthorityContextError> {
    let context = parse_json(line)?;
    let object = exact_object(
        &context,
        &[
            "case_id",
            "grant",
            "intent",
            "request",
            "history",
            "restrictions",
        ],
        "Stage 5B fixture envelope",
    )?;
    let case_id = identifier(object_field(object, "case_id")?, "Stage 5B case_id")?.to_owned();
    Ok(AuthorityContextCase { case_id, context })
}

pub fn parse_authority_context_fixture(
    text: &str,
) -> Result<Vec<AuthorityContextCase>, AuthorityContextError> {
    let normalized = text.replace("\r\n", "\n");
    if normalized.contains('\r') {
        return Err(AuthorityContextError::new(
            "Stage 5B JSONL fixture contains unsupported carriage return",
        ));
    }
    let mut cases = Vec::new();
    let mut seen = BTreeSet::new();
    for line in normalized.lines() {
        let case = parse_authority_context_line(line)?;
        if !seen.insert(case.case_id.clone()) {
            return Err(AuthorityContextError::new(format!(
                "duplicate Stage 5B case_id: {}",
                case.case_id
            )));
        }
        cases.push(case);
    }
    if cases.is_empty() {
        return Err(AuthorityContextError::new(
            "Stage 5B JSONL fixture must contain at least one case",
        ));
    }
    Ok(cases)
}

pub fn validate_authority_context(
    case: &AuthorityContextCase,
) -> Result<(), AuthorityContextError> {
    let object = exact_object(
        &case.context,
        &[
            "case_id",
            "grant",
            "intent",
            "request",
            "history",
            "restrictions",
        ],
        "Stage 5B fixture envelope",
    )?;
    validate_grant(object_field(object, "grant")?)?;
    validate_intent(object_field(object, "intent")?)?;
    validate_request(object_field(object, "request")?)?;
    validate_history(object_field(object, "history")?)?;
    validate_restrictions(object_field(object, "restrictions")?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_json;

    #[test]
    fn restricted_json_rejects_number_values() {
        assert!(parse_json("{\"x\":1}").is_err());
    }

    #[test]
    fn restricted_json_rejects_duplicate_object_keys() {
        assert!(parse_json("{\"x\":true,\"x\":false}").is_err());
    }

    #[test]
    fn restricted_json_accepts_quote_and_backslash_escapes() {
        assert!(parse_json(r#"{"x":"quote:\" slash:\\"}"#).is_ok());
    }
}
