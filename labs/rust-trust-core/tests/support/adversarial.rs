use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

pub const MAX_TOTAL_CASES: usize = 2048;
pub const MAX_ARRAY_ITEMS: usize = 32;
pub const MAX_OBJECT_MEMBERS: usize = 32;
pub const MAX_KEY_LENGTH: usize = 64;
pub const MAX_PAYLOAD_BYTES: usize = 4096;

pub fn validate_stage4_row_limits(line: &str) -> Result<(), String> {
    let columns: Vec<&str> = line.split('\t').collect();
    if columns.len() != 3 {
        return Err(format!(
            "Stage 4 row must contain exactly 3 TSV columns: {line}"
        ));
    }

    let kind = columns[1];
    let payload = columns[2];
    let payload_bytes = payload.len();
    if payload_bytes > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Stage 4 MAX_PAYLOAD_BYTES exceeded: {payload_bytes} > {MAX_PAYLOAD_BYTES}"
        ));
    }

    if kind == "scalar_array" {
        let items = if payload.is_empty() {
            0
        } else {
            payload.split(',').count()
        };
        if items > MAX_ARRAY_ITEMS {
            return Err(format!(
                "Stage 4 MAX_ARRAY_ITEMS exceeded: {items} > {MAX_ARRAY_ITEMS}"
            ));
        }
    }

    if kind == "ascii_key_object" {
        let members: Vec<&str> = if payload.is_empty() {
            Vec::new()
        } else {
            payload.split(';').collect()
        };
        if members.len() > MAX_OBJECT_MEMBERS {
            return Err(format!(
                "Stage 4 MAX_OBJECT_MEMBERS exceeded: {} > {MAX_OBJECT_MEMBERS}",
                members.len()
            ));
        }

        for member in members {
            let key = member.split_once('=').map_or(member, |(key, _)| key);
            let key_bytes = key.len();
            if key_bytes > MAX_KEY_LENGTH {
                return Err(format!(
                    "Stage 4 MAX_KEY_LENGTH exceeded: {key_bytes} > {MAX_KEY_LENGTH}"
                ));
            }
        }
    }

    Ok(())
}

pub fn validate_stage4_fixture_limits(text: &str) -> Result<(), String> {
    let normalized = text.replace("\r\n", "\n");
    let without_one_trailing_empty = normalized.strip_suffix('\n').unwrap_or(&normalized);
    let mut lines = without_one_trailing_empty.split('\n');

    if lines.next() != Some("case_id\tkind\tpayload") {
        return Err("Stage 4 fixture header is invalid".to_owned());
    }

    let total_cases = lines.count();
    if total_cases > MAX_TOTAL_CASES {
        return Err(format!(
            "Stage 4 MAX_TOTAL_CASES exceeded: {total_cases} > {MAX_TOTAL_CASES}"
        ));
    }

    Ok(())
}

pub fn run_node_with_stdin(script: &Path, args: &[&str], stdin: &str) -> Result<String, String> {
    let mut child = Command::new("node")
        .arg(script)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Node process must start: {error}"))?;

    if let Some(mut child_stdin) = child.stdin.take() {
        child_stdin
            .write_all(stdin.as_bytes())
            .map_err(|error| format!("Node stdin write failed: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Node process wait failed: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Node process failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    String::from_utf8(output.stdout).map_err(|error| format!("Node stdout must be UTF-8: {error}"))
}

pub fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, String>, String> {
    let mut outputs = BTreeMap::new();

    for line in stdout.lines() {
        let (case_id, canonical) = line.split_once('\t').ok_or_else(|| {
            "Node oracle output must contain case_id and canonical bytes".to_owned()
        })?;

        if outputs
            .insert(case_id.to_owned(), canonical.to_owned())
            .is_some()
        {
            return Err(format!("duplicate Node oracle case_id: {case_id}"));
        }
    }

    Ok(outputs)
}

pub fn assert_generated_exact_match(seed: u32, case_id: &str, node: &str, rust: &str) {
    assert_eq!(
        node.as_bytes(),
        rust.as_bytes(),
        "seed=0x{seed:08x} case={case_id}: canonical byte mismatch; node={node:?}; rust={rust:?}"
    );
}

pub fn catch_generated_mismatch(
    seed: u32,
    case_id: &str,
    node: &str,
    rust: &str,
) -> Result<(), String> {
    let mut perturbed_rust = rust.to_owned();
    perturbed_rust.push(' ');

    match std::panic::catch_unwind(|| {
        assert_generated_exact_match(seed, case_id, node, &perturbed_rust);
    }) {
        Ok(()) => Ok(()),
        Err(payload) => {
            if let Some(message) = payload.downcast_ref::<String>() {
                Err(message.clone())
            } else if let Some(message) = payload.downcast_ref::<&str>() {
                Err((*message).to_owned())
            } else {
                Err("generated comparator panicked without a string diagnostic".to_owned())
            }
        }
    }
}
