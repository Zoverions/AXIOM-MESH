mod support;

use axiom_trust_core_lab::{
    canonicalize_case, parse_canonical_fixture, parse_canonical_vector_row,
};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use support::adversarial::{
    MAX_ARRAY_ITEMS, MAX_KEY_LENGTH, MAX_OBJECT_MEMBERS, MAX_PAYLOAD_BYTES, MAX_TOTAL_CASES,
    assert_generated_exact_match, catch_generated_mismatch, parse_node_outputs,
    run_node_with_stdin, validate_stage4_fixture_limits, validate_stage4_row_limits,
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

fn generated_invalid_fixture() -> String {
    run_node_with_stdin(&generator_path(), &["invalid"], "")
        .expect("Stage 4 invalid corpus generator must succeed")
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

fn decode_invalid_row(encoded: &str) -> String {
    let mut decoded = String::new();
    let mut characters = encoded.chars();

    while let Some(character) = characters.next() {
        if character != '\\' {
            decoded.push(character);
            continue;
        }

        match characters.next() {
            Some('\\') => decoded.push('\\'),
            Some('t') => decoded.push('\t'),
            Some('n') => decoded.push('\n'),
            Some(other) => panic!("unsupported generated invalid escape: \\{other}"),
            None => panic!("generated invalid row ends with a bare escape"),
        }
    }

    decoded
}

fn invalid_category(case_id: &str) -> String {
    let rest = case_id
        .strip_prefix("adv_invalid_")
        .unwrap_or_else(|| panic!("generated invalid case id lacks prefix: {case_id}"));
    let (_, after_seed) = rest
        .split_once('_')
        .unwrap_or_else(|| panic!("generated invalid case id lacks seed separator: {case_id}"));
    after_seed
        .rsplit_once('_')
        .map(|(category, _)| category.to_owned())
        .unwrap_or_else(|| panic!("generated invalid case id lacks ordinal: {case_id}"))
}

fn generated_invalid_rows() -> Vec<(String, String, String)> {
    let fixture = generated_invalid_fixture();
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some("case_id\tencoded_row"));

    lines
        .map(|line| {
            let (case_id, encoded) = line
                .split_once('\t')
                .unwrap_or_else(|| panic!("generated invalid fixture row lacks separator: {line}"));
            (
                case_id.to_owned(),
                invalid_category(case_id),
                decode_invalid_row(encoded),
            )
        })
        .collect()
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
    let case = cases
        .first()
        .expect("generated corpus must contain a first case");
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

#[test]
fn stage4_rust_harness_limits_are_exact_and_fail_closed() {
    assert_eq!(MAX_TOTAL_CASES, 2048);
    assert_eq!(MAX_ARRAY_ITEMS, 32);
    assert_eq!(MAX_OBJECT_MEMBERS, 32);
    assert_eq!(MAX_KEY_LENGTH, 64);
    assert_eq!(MAX_PAYLOAD_BYTES, 4096);

    validate_stage4_row_limits("ok\tscalar_array\tn,b:true")
        .expect("ordinary generated row must be within Stage 4 limits");

    let payload_row = format!(
        "payload\tascii_string\t{}",
        "a".repeat(MAX_PAYLOAD_BYTES + 1)
    );
    assert!(
        validate_stage4_row_limits(&payload_row)
            .expect_err("payload limit plus one must fail")
            .contains("MAX_PAYLOAD_BYTES")
    );

    let array_row = format!(
        "array\tscalar_array\t{}",
        vec!["n"; MAX_ARRAY_ITEMS + 1].join(",")
    );
    assert!(
        validate_stage4_row_limits(&array_row)
            .expect_err("array limit plus one must fail")
            .contains("MAX_ARRAY_ITEMS")
    );

    let object_payload = (0..=MAX_OBJECT_MEMBERS)
        .map(|index| format!("k{index}=n"))
        .collect::<Vec<_>>()
        .join(";");
    let object_row = format!("object\tascii_key_object\t{object_payload}");
    assert!(
        validate_stage4_row_limits(&object_row)
            .expect_err("object member limit plus one must fail")
            .contains("MAX_OBJECT_MEMBERS")
    );

    let key_row = format!(
        "key\tascii_key_object\t{}=n",
        "k".repeat(MAX_KEY_LENGTH + 1)
    );
    assert!(
        validate_stage4_row_limits(&key_row)
            .expect_err("key length limit plus one must fail")
            .contains("MAX_KEY_LENGTH")
    );

    let fixture = format!(
        "case_id\tkind\tpayload\n{}\n",
        (0..=MAX_TOTAL_CASES)
            .map(|index| format!("case_{index}\tbool\ttrue"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    assert!(
        validate_stage4_fixture_limits(&fixture)
            .expect_err("fixture case limit plus one must fail")
            .contains("MAX_TOTAL_CASES")
    );
}

#[test]
fn all_256_generated_invalid_or_over_bound_cases_fail_closed_in_rust() {
    let rows = generated_invalid_rows();
    assert_eq!(rows.len(), 256);

    let limit_categories: BTreeSet<&str> = [
        "payload_over_limit",
        "array_over_limit",
        "object_over_limit",
        "key_over_limit",
    ]
    .into_iter()
    .collect();
    let expected_categories: BTreeSet<&str> = [
        "unknown_kind",
        "duplicate_case_id",
        "invalid_boolean",
        "integer_above_max",
        "integer_below_min",
        "invalid_negative_zero",
        "excluded_string_character",
        "malformed_array_token",
        "nested_token",
        "invalid_object_key",
        "duplicate_object_key",
        "wrong_tsv_columns",
        "payload_over_limit",
        "array_over_limit",
        "object_over_limit",
        "key_over_limit",
    ]
    .into_iter()
    .collect();

    let mut categories = BTreeSet::new();
    let mut rejected = 0usize;

    for (case_id, category, row) in &rows {
        categories.insert(category.as_str());

        let failed = if limit_categories.contains(category.as_str()) {
            validate_stage4_row_limits(row).is_err()
        } else if category == "duplicate_case_id" {
            parse_canonical_fixture(&format!("case_id\tkind\tpayload\n{row}\n")).is_err()
        } else {
            match validate_stage4_row_limits(row) {
                Err(_) => true,
                Ok(()) => parse_canonical_vector_row(row).is_err(),
            }
        };

        assert!(
            failed,
            "generated invalid case unexpectedly accepted: {case_id}"
        );
        rejected += 1;
    }

    assert_eq!(rejected, 256);
    assert_eq!(categories, expected_categories);
}
