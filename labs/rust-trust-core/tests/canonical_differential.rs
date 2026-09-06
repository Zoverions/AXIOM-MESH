use axiom_trust_core_lab::{canonicalize_case, parse_canonical_vector_row};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::Command;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/canonical-value-v0.tsv")
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

    String::from_utf8(output.stdout)
        .expect("Node oracle output must be UTF-8")
        .lines()
        .map(|line| {
            let (case_id, canonical) = line
                .split_once('\t')
                .expect("Node oracle output must contain case_id and canonical bytes");
            (case_id.to_owned(), canonical.to_owned())
        })
        .collect()
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
    assert!(
        result.is_err(),
        "byte divergence must fail the differential harness"
    );
}
