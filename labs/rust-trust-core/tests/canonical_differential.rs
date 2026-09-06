use axiom_trust_core_lab::{
    canonicalize_case, parse_canonical_fixture, parse_canonical_vector_row,
};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::Command;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/canonical-value-v0.tsv")
}

fn invalid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/canonical-value-v0-invalid.tsv")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/canonical_oracle.mjs")
}

fn node_outputs() -> BTreeMap<String, String> {
    let output = Command::new("node")
        .arg(oracle_path())
        .arg(fixture_path())
        .output()
        .expect("Node oracle process must start");

    assert!(
        output.status.success(),
        "Node oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8(output.stdout).expect("Node oracle output must be UTF-8");
    parse_node_outputs(&stdout).expect("Node oracle output must be unique and well formed")
}

fn assert_exact_match(case_id: &str, node: &str, rust: &str) {
    assert_eq!(
        node.as_bytes(),
        rust.as_bytes(),
        "case {case_id}: canonical byte mismatch; node={node:?}; rust={rust:?}"
    );
}

fn decode_escaped_row(encoded: &str) -> String {
    encoded.replace("\\t", "\t").replace("\\n", "\n")
}

#[test]
fn rust_candidate_matches_exact_node_oracle_bytes_for_all_v0_vectors() {
    let fixture = std::fs::read_to_string(fixture_path()).expect("fixture must be readable");
    let node = node_outputs();
    let mut rust_count = 0usize;

    for (index, line) in fixture.lines().enumerate() {
        if index == 0 {
            assert_eq!(line, "case_id\tkind\tpayload");
            continue;
        }
        let case = parse_canonical_vector_row(line).expect("valid shared vector must parse");
        let rust = canonicalize_case(&case);
        let expected = node
            .get(case.case_id())
            .unwrap_or_else(|| panic!("Node oracle missing case {}", case.case_id()));
        assert_exact_match(case.case_id(), expected, &rust);
        rust_count += 1;
    }

    assert_eq!(rust_count, node.len());
    assert_eq!(rust_count, 17);
}

#[test]
fn differential_comparison_rejects_real_byte_divergence() {
    let result = std::panic::catch_unwind(|| {
        assert_exact_match("mismatch_probe", "{\"a\":1}", "{\"a\":2}");
    });
    let panic = result.expect_err("byte divergence must fail the differential harness");
    let message = panic
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| panic.downcast_ref::<&str>().copied())
        .expect("mismatch panic must carry a readable message");
    assert!(message.contains("mismatch_probe"));
    assert!(message.contains("node=\"{\\\"a\\\":1}\""));
    assert!(message.contains("rust=\"{\\\"a\\\":2}\""));
}

#[test]
fn node_output_parser_rejects_duplicate_case_ids() {
    let duplicate = "same\t{\"a\":1}\nsame\t{\"a\":2}\n";
    let error = parse_node_outputs(duplicate).expect_err("duplicate Node case ids must fail closed");
    assert!(error.contains("duplicate Node oracle case_id: same"));
}

#[test]
fn rust_candidate_fails_closed_on_every_malformed_canonical_value_v0_case() {
    let fixture =
        std::fs::read_to_string(invalid_fixture_path()).expect("invalid fixture must be readable");
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some("case_id\tencoded_row"));
    let cases = lines.collect::<Vec<_>>();
    assert_eq!(cases.len(), 12);

    for line in cases {
        let (case_id, encoded) = line
            .split_once('\t')
            .expect("invalid corpus row must contain case id and encoded row");
        let decoded = decode_escaped_row(encoded);

        if case_id == "duplicate_case_id_fixture" {
            let duplicate_fixture = format!("case_id\tkind\tpayload\n{decoded}");
            assert!(
                parse_canonical_fixture(&duplicate_fixture).is_err(),
                "case {case_id} must be rejected"
            );
        } else {
            assert!(
                parse_canonical_vector_row(&decoded).is_err(),
                "case {case_id} must be rejected"
            );
        }
    }
}
