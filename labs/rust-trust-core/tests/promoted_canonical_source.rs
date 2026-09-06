#[path = "../../../trust-core/rust/canonical_value_v0.rs"]
mod canonical_value_v0;

use canonical_value_v0::{canonicalize_case, parse_canonical_vector_row};

#[test]
fn promoted_source_matches_stage2_canonical_value_v0_contract() {
    let object = parse_canonical_vector_row(
        "object_order\tascii_key_object\tz=i:2;a=i:1"
    ).expect("approved Stage 3 candidate must parse the frozen v0 row");
    assert_eq!(canonicalize_case(&object), "{\"a\":1,\"z\":2}");

    let negative_zero = parse_canonical_vector_row("negative_zero\tnegative_zero\t-0")
        .expect("negative zero must remain admitted in v0 input");
    assert_eq!(canonicalize_case(&negative_zero), "0");
}

#[test]
fn promoted_source_remains_fail_closed_on_out_of_contract_input() {
    assert!(parse_canonical_vector_row("unsafe\tsafe_integer\t9007199254740992").is_err());
    assert!(parse_canonical_vector_row("escape\tascii_string\tbad\\value").is_err());
    assert!(parse_canonical_vector_row("unknown\tmap\t").is_err());
}
