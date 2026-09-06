use axiom_trust_core_lab::{parse_intent_attenuation_fixture, verify_intent_attenuation};

#[test]
fn stage5a_intent_attenuation_api_is_required() {
    let fixture = include_str!("../fixtures/intent-attenuation-v0.tsv");
    let cases = parse_intent_attenuation_fixture(fixture).expect("valid fixture must parse");
    let result = verify_intent_attenuation(&cases[0]).expect("valid vector must evaluate");
    assert!(result.valid);
}
