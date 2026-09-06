use axiom_trust_core_lab::{
    AuthorityEvidence, CapabilityEvidence, ConsentEvidence, EffectBudgetEvidence,
    PrincipalEvidence, evaluate_authority,
};

const HEADER: &str = "case_id\tprincipal_verified\tcapability_authorized\tconsent_required\tconsent_valid\tbudget_required\tbudget_remaining\texpected";

fn parse_bool(value: &str) -> bool {
    match value {
        "true" => true,
        "false" => false,
        other => panic!("invalid boolean fixture value: {other}"),
    }
}

#[test]
fn authority_vectors_match_expected_decisions() {
    let fixture = include_str!("../fixtures/authority-vectors.v0.tsv");
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some(HEADER));

    for (index, line) in lines.enumerate() {
        if line.is_empty() {
            continue;
        }

        let fields: Vec<_> = line.split('\t').collect();
        assert_eq!(fields.len(), 8, "invalid fixture row {}", index + 2);

        let case_id = fields[0];
        let input = AuthorityEvidence {
            principal: PrincipalEvidence {
                subject: case_id,
                verified: parse_bool(fields[1]),
            },
            capability: CapabilityEvidence {
                capability: "synthetic.effect",
                authorized: parse_bool(fields[2]),
            },
            consent: ConsentEvidence {
                required: parse_bool(fields[3]),
                valid: parse_bool(fields[4]),
            },
            budget: EffectBudgetEvidence {
                required: parse_bool(fields[5]),
                remaining: fields[6]
                    .parse::<u64>()
                    .unwrap_or_else(|_| panic!("invalid budget fixture value for {case_id}")),
            },
        };

        let allowed = evaluate_authority(input).is_ok();
        let expected_allowed = match fields[7] {
            "allow" => true,
            "deny" => false,
            other => panic!("invalid expected fixture value for {case_id}: {other}"),
        };

        assert_eq!(allowed, expected_allowed, "case {case_id}");
    }
}
