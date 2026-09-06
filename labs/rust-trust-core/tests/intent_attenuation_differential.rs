use axiom_trust_core_lab::{
    parse_intent_attenuation_fixture, parse_intent_attenuation_vector_row,
    verify_intent_attenuation,
};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::Command;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/intent-attenuation-v0.tsv")
}

fn invalid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/intent-attenuation-v0-invalid.tsv")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/intent_attenuation_oracle.mjs")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OracleResult {
    valid: bool,
    actions: bool,
    purposes: bool,
    destinations: bool,
    resources: bool,
}

fn parse_bool(value: &str) -> Result<bool, String> {
    match value {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(format!("invalid oracle boolean: {value}")),
    }
}

fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, OracleResult>, String> {
    let mut outputs = BTreeMap::new();
    for line in stdout.lines() {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() != 6 {
            return Err(format!(
                "Node attenuation oracle output must contain 6 TSV columns: {line}"
            ));
        }
        let result = OracleResult {
            valid: parse_bool(columns[1])?,
            actions: parse_bool(columns[2])?,
            purposes: parse_bool(columns[3])?,
            destinations: parse_bool(columns[4])?,
            resources: parse_bool(columns[5])?,
        };
        if outputs.insert(columns[0].to_owned(), result).is_some() {
            return Err(format!(
                "duplicate Node attenuation oracle case_id: {}",
                columns[0]
            ));
        }
    }
    Ok(outputs)
}

fn node_outputs_for_fixture() -> BTreeMap<String, OracleResult> {
    let output = Command::new("node")
        .arg(oracle_path())
        .arg(fixture_path())
        .output()
        .expect("Node attenuation oracle process must start");
    assert!(
        output.status.success(),
        "Node attenuation oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("oracle output must be UTF-8");
    parse_node_outputs(&stdout).expect("oracle output must be unique and well formed")
}

fn decode_escaped_row(encoded: &str) -> String {
    encoded.replace("\\t", "\t").replace("\\n", "\n")
}

#[test]
fn rust_attenuation_matches_real_node_oracle_for_hand_curated_vectors() {
    let fixture = std::fs::read_to_string(fixture_path()).expect("fixture must be readable");
    let cases = parse_intent_attenuation_fixture(&fixture).expect("valid fixture must parse");
    let node = node_outputs_for_fixture();
    assert_eq!(cases.len(), 16);
    assert_eq!(node.len(), cases.len());

    for case in &cases {
        let rust = verify_intent_attenuation(case).expect("valid vector must evaluate");
        let expected = node
            .get(case.case_id())
            .unwrap_or_else(|| panic!("Node oracle missing case {}", case.case_id()));
        assert_eq!(
            rust.valid,
            expected.valid,
            "{} valid mismatch",
            case.case_id()
        );
        assert_eq!(
            rust.checks.actions,
            expected.actions,
            "{} actions mismatch",
            case.case_id()
        );
        assert_eq!(
            rust.checks.purposes,
            expected.purposes,
            "{} purposes mismatch",
            case.case_id()
        );
        assert_eq!(
            rust.checks.destinations,
            expected.destinations,
            "{} destinations mismatch",
            case.case_id()
        );
        assert_eq!(
            rust.checks.resources,
            expected.resources,
            "{} resources mismatch",
            case.case_id()
        );
    }
}

#[test]
fn rust_attenuation_has_expected_subset_and_widening_semantics() {
    let fixture = std::fs::read_to_string(fixture_path()).expect("fixture must be readable");
    let cases = parse_intent_attenuation_fixture(&fixture).expect("valid fixture must parse");
    let results = cases
        .iter()
        .map(|case| {
            (
                case.case_id(),
                verify_intent_attenuation(case).expect("case must evaluate"),
            )
        })
        .collect::<BTreeMap<_, _>>();

    for case_id in [
        "exact_empty",
        "exact_single",
        "exact_multi",
        "subset_actions",
        "subset_purposes",
        "subset_destinations",
        "subset_resources",
        "empty_intent_nonempty",
        "partial_multi",
    ] {
        assert!(results[case_id].valid, "{case_id} must attenuate");
    }

    assert_eq!(
        results["widen_actions"].checks,
        axiom_trust_core_lab::IntentAttenuationChecks {
            actions: false,
            purposes: true,
            destinations: true,
            resources: true,
        }
    );
    assert_eq!(
        results["widen_resources"].checks,
        axiom_trust_core_lab::IntentAttenuationChecks {
            actions: true,
            purposes: true,
            destinations: true,
            resources: false,
        }
    );
    assert!(!results["disjoint_all"].valid);
}

#[test]
fn malformed_unverified_and_unbound_rows_fail_closed() {
    let fixture =
        std::fs::read_to_string(invalid_fixture_path()).expect("invalid fixture must be readable");
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some("case_id\tencoded_row"));
    let rows = lines.collect::<Vec<_>>();
    assert_eq!(rows.len(), 12);

    for line in rows {
        let (case_id, encoded) = line
            .split_once('\t')
            .expect("invalid fixture row must have id and encoded row");
        let row = decode_escaped_row(encoded);
        match parse_intent_attenuation_vector_row(&row) {
            Ok(case) => assert!(
                verify_intent_attenuation(&case).is_err(),
                "{case_id} must fail closed during evaluation"
            ),
            Err(_) => {}
        }
    }
}

#[test]
fn node_output_parser_rejects_duplicate_case_ids() {
    let duplicate =
        "same\ttrue\ttrue\ttrue\ttrue\ttrue\nsame\tfalse\tfalse\ttrue\ttrue\ttrue\n";
    let error = parse_node_outputs(duplicate).expect_err("duplicate output ids must fail closed");
    assert!(error.contains("duplicate Node attenuation oracle case_id: same"));
}
