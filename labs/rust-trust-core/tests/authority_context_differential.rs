use axiom_trust_core_lab::{
    parse_authority_context_fixture, parse_authority_context_line, validate_authority_context,
};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const GENERATED_SEED: u32 = 0x5354_3542;
const GENERATED_VALID_CASES: usize = 256;
const GENERATED_INVALID_CASES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AdmissionClass {
    EnvelopeRejected,
    StructuralRejected,
    Admitted,
}

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn valid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/authority-context-v0.jsonl")
}

fn invalid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/authority-context-v0-invalid.jsonl")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/authority_context_oracle.mjs")
}

fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, bool>, String> {
    let mut outputs = BTreeMap::new();
    for line in stdout.lines() {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() != 2 {
            return Err(format!(
                "Stage 5B oracle output must have 2 columns: {line}"
            ));
        }
        let admitted = match columns[1] {
            "true" => true,
            "false" => false,
            other => return Err(format!("invalid Stage 5B oracle boolean: {other}")),
        };
        if outputs.insert(columns[0].to_owned(), admitted).is_some() {
            return Err(format!("duplicate Stage 5B oracle case_id: {}", columns[0]));
        }
    }
    Ok(outputs)
}

fn run_node(text: &str) -> std::process::Output {
    let mut child = Command::new("node")
        .arg(oracle_path())
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Stage 5B Node oracle process must start");
    child
        .stdin
        .take()
        .expect("Stage 5B Node oracle stdin must be available")
        .write_all(text.as_bytes())
        .expect("Stage 5B fixture must be writable to Node oracle stdin");
    child
        .wait_with_output()
        .expect("Stage 5B Node oracle process must finish")
}

fn node_outputs_for_text(text: &str) -> BTreeMap<String, bool> {
    let output = run_node(text);
    assert!(
        output.status.success(),
        "Stage 5B Node oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("Stage 5B oracle output must be UTF-8");
    parse_node_outputs(stdout.trim_end()).expect("Stage 5B oracle output must be well formed")
}

fn rust_classify_line(line: &str) -> AdmissionClass {
    match parse_authority_context_line(line) {
        Err(_) => AdmissionClass::EnvelopeRejected,
        Ok(case) => match validate_authority_context(&case) {
            Ok(()) => AdmissionClass::Admitted,
            Err(_) => AdmissionClass::StructuralRejected,
        },
    }
}

fn node_classify_line(line: &str) -> AdmissionClass {
    let output = run_node(&format!("{line}\n"));
    if !output.status.success() {
        return AdmissionClass::EnvelopeRejected;
    }
    let stdout = String::from_utf8(output.stdout).expect("Stage 5B oracle output must be UTF-8");
    let outputs = parse_node_outputs(stdout.trim_end()).expect("Stage 5B oracle output must parse");
    assert_eq!(outputs.len(), 1, "single-line oracle must emit one result");
    if *outputs
        .values()
        .next()
        .expect("single Node result must exist")
    {
        AdmissionClass::Admitted
    } else {
        AdmissionClass::StructuralRejected
    }
}

fn compare_admissions(
    rust: &BTreeMap<String, bool>,
    node: &BTreeMap<String, bool>,
) -> Result<(), String> {
    if rust.len() != node.len() {
        return Err(format!(
            "Stage 5B comparison count mismatch: Rust={} Node={}",
            rust.len(),
            node.len()
        ));
    }
    for (case_id, rust_admitted) in rust {
        let node_admitted = node
            .get(case_id)
            .ok_or_else(|| format!("Node oracle missing Stage 5B case {case_id}"))?;
        if rust_admitted != node_admitted {
            return Err(format!(
                "Stage 5B admission mismatch for {case_id}: Rust={rust_admitted} Node={node_admitted}"
            ));
        }
    }
    Ok(())
}

#[test]
fn stage5b_valid_fixture_requires_structural_validator() {
    let text =
        std::fs::read_to_string(valid_fixture_path()).expect("Stage 5B fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    assert_eq!(cases.len(), 11);
    for case in &cases {
        validate_authority_context(case)
            .unwrap_or_else(|error| panic!("{}: {error}", case.case_id()));
    }
}

#[test]
fn hand_curated_valid_contexts_match_real_node_structural_oracle() {
    let text = std::fs::read_to_string(valid_fixture_path())
        .expect("Stage 5B valid fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    let rust = cases
        .iter()
        .map(|case| {
            (
                case.case_id().to_owned(),
                validate_authority_context(case).is_ok(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let node = node_outputs_for_text(&text);
    assert!(rust.values().all(|admitted| *admitted));
    assert!(node.values().all(|admitted| *admitted));
    compare_admissions(&rust, &node).expect("hand-curated valid Stage 5B corpus must match");
}

#[test]
fn hand_curated_invalid_contexts_match_declared_rejection_layer() {
    const ENVELOPE_CASES: &[&str] = &[
        "missing_top_level_history",
        "missing_top_level_restrictions",
        "extra_top_level_field",
    ];

    let text = std::fs::read_to_string(invalid_fixture_path())
        .expect("Stage 5B invalid fixture must be readable");
    let lines = text.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 24);

    for line in lines {
        let raw: serde_free_case_id::CaseId = serde_free_case_id::extract(line)
            .unwrap_or_else(|error| panic!("invalid fixture case_id must be extractable: {error}"));
        let expected = if ENVELOPE_CASES.contains(&raw.0.as_str()) {
            AdmissionClass::EnvelopeRejected
        } else {
            AdmissionClass::StructuralRejected
        };
        assert_eq!(
            rust_classify_line(line),
            expected,
            "{} Rust rejection layer mismatch",
            raw.0
        );
        assert_eq!(
            node_classify_line(line),
            expected,
            "{} Node rejection layer mismatch",
            raw.0
        );
    }
}

#[test]
fn differential_comparator_detects_deliberate_perturbation() {
    let text = std::fs::read_to_string(valid_fixture_path())
        .expect("Stage 5B valid fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    let rust = cases
        .iter()
        .map(|case| {
            (
                case.case_id().to_owned(),
                validate_authority_context(case).is_ok(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut perturbed = node_outputs_for_text(&text);
    let first_case = perturbed
        .keys()
        .next()
        .expect("Stage 5B valid corpus must not be empty")
        .clone();
    let current = perturbed[&first_case];
    perturbed.insert(first_case.clone(), !current);
    let error = compare_admissions(&rust, &perturbed)
        .expect_err("deliberate Stage 5B comparator perturbation must fail");
    assert!(error.contains(&first_case));
}

#[test]
fn generated_stage5b_campaign_matches_real_node_oracle() {
    let valid = generated_valid_contexts(GENERATED_SEED, GENERATED_VALID_CASES);
    let invalid = generated_invalid_contexts(GENERATED_SEED, GENERATED_INVALID_CASES);
    assert_eq!(valid.len(), GENERATED_VALID_CASES);
    assert_eq!(invalid.len(), GENERATED_INVALID_CASES);
}

mod serde_free_case_id {
    #[derive(Debug)]
    pub struct CaseId(pub String);

    pub fn extract(line: &str) -> Result<CaseId, String> {
        const PREFIX: &str = "{\"case_id\":\"";
        let rest = line
            .strip_prefix(PREFIX)
            .ok_or_else(|| "case_id must be the first Stage 5B fixture field".to_owned())?;
        let end = rest
            .find('"')
            .ok_or_else(|| "case_id string is unterminated".to_owned())?;
        Ok(CaseId(rest[..end].to_owned()))
    }
}
