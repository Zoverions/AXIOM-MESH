use axiom_trust_core_lab::{parse_authority_context_fixture, validate_authority_context};
use std::path::PathBuf;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn stage5b_valid_fixture_requires_structural_validator() {
    let text = std::fs::read_to_string(manifest_dir().join("fixtures/authority-context-v0.jsonl"))
        .expect("Stage 5B fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    assert!(cases.len() >= 10);
    for case in &cases {
        validate_authority_context(case)
            .unwrap_or_else(|error| panic!("{}: {error}", case.case_id()));
    }
}
