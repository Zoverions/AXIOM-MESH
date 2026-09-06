mod support;

use axiom_trust_core_lab::{canonicalize_case, parse_canonical_fixture};
use std::collections::BTreeMap;
use std::path::PathBuf;
use support::adversarial::{
    assert_generated_exact_match, catch_generated_mismatch, parse_node_outputs,
    run_node_with_stdin,
};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn generator_path() -> PathBuf {
    manifest_dir().join("node/canonical_adversarial_corpus.mjs")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/canonical_oracle.mjs")
}

fn generated_valid_fixture() -> String {
    run_node_with_stdin(&generator_path(), &["valid"], "")
        .expect("Stage 4 valid corpus generator must succeed")
}

fn generated_node_outputs(fixture: &str) -> BTreeMap<String, String> {
    let stdout = run_node_with_stdin(&oracle_path(), &["-"], fixture)
        .expect("Node oracle must accept generated fixture text over stdin");
    parse_node_outputs(&stdout).expect("Node oracle output must be unique and well formed")
}

fn seed_from_case_id(case_id: &str) -> u32 {
    let seed_hex = case_id
        .strip_prefix("adv_")
        .and_then(|rest| rest.split('_').next())
        .unwrap_or_else(|| panic!("generated case id lacks seed: {case_id}"));
    u32::from_str_radix(seed_hex, 16)
        .unwrap_or_else(|_| panic!("generated case id has invalid seed: {case_id}"))
}

#[test]
fn promoted_candidate_matches_all_1024_generated_node_oracle_cases() {
    let fixture = generated_valid_fixture();
    let cases =
        parse_canonical_fixture(&fixture).expect("generated valid fixture must parse in Rust");
    assert_eq!(cases.len(), 1024);

    let node = generated_node_outputs(&fixture);
    assert_eq!(node.len(), 1024);

    let mut matched = 0usize;
    for case in &cases {
        let rust = canonicalize_case(case);
        let expected = node
            .get(case.case_id())
            .unwrap_or_else(|| panic!("Node oracle missing generated case {}", case.case_id()));
        assert_generated_exact_match(
            seed_from_case_id(case.case_id()),
            case.case_id(),
            expected,
            &rust,
        );
        matched += 1;
    }

    assert_eq!(matched, 1024);
}

#[test]
fn generated_object_permutations_have_identical_verified_node_bytes() {
    let fixture = generated_valid_fixture();
    let node = generated_node_outputs(&fixture);
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for (case_id, canonical) in &node {
        if case_id.contains("_perm_") && (case_id.ends_with("_a") || case_id.ends_with("_b")) {
            let group = case_id
                .strip_suffix("_a")
                .or_else(|| case_id.strip_suffix("_b"))
                .expect("permutation id suffix must exist")
                .to_owned();
            groups.entry(group).or_default().push(canonical.clone());
        }
    }

    assert_eq!(groups.len(), 64);
    for (group, outputs) in groups {
        assert_eq!(
            outputs.len(),
            2,
            "permutation group {group} must contain a pair"
        );
        assert_eq!(
            outputs[0].as_bytes(),
            outputs[1].as_bytes(),
            "permutation group {group} must canonicalize identically"
        );
    }
}

#[test]
fn generated_comparator_rejects_controlled_real_case_divergence() {
    let fixture = generated_valid_fixture();
    let cases =
        parse_canonical_fixture(&fixture).expect("generated valid fixture must parse in Rust");
    let case = cases.first().expect("generated corpus must contain a first case");
    assert_eq!(seed_from_case_id(case.case_id()), 0x4158494F);

    let node = generated_node_outputs(&fixture);
    let expected = node
        .get(case.case_id())
        .unwrap_or_else(|| panic!("Node oracle missing generated case {}", case.case_id()));
    let rust = canonicalize_case(case);
    assert_generated_exact_match(0x4158494F, case.case_id(), expected, &rust);

    let diagnostic = catch_generated_mismatch(0x4158494F, case.case_id(), expected, &rust)
        .expect_err("controlled generated mismatch must be rejected");
    assert!(diagnostic.contains("seed=0x4158494f"));
    assert!(diagnostic.contains("case="));
    assert!(diagnostic.contains("node="));
    assert!(diagnostic.contains("rust="));
}
