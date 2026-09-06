use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

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
