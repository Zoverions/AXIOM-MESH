use axiom_trust_core_lab::{
    AuthorityEvidence, CapabilityEvidence, ConsentEvidence, DenyReason, EffectBudgetEvidence,
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

fn state_bit(index: usize, mask: usize) -> bool {
    index & mask != 0
}

fn valid_input() -> AuthorityEvidence<'static> {
    AuthorityEvidence {
        principal: PrincipalEvidence {
            subject: "principal:test",
            verified: true,
        },
        capability: CapabilityEvidence {
            capability: "synthetic.effect",
            authorized: true,
        },
        consent: ConsentEvidence {
            required: true,
            valid: true,
        },
        budget: EffectBudgetEvidence {
            required: true,
            remaining: 1,
        },
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

#[test]
fn authority_truth_table_exhausts_the_six_input_boolean_state_space() {
    let source = include_str!("../fixtures/authority-truth-table.v0.txt");
    let truth_table: String = source
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();

    assert_eq!(
        truth_table.len(),
        64,
        "authority truth table must contain exactly 64 decisions"
    );
    assert_eq!(
        truth_table
            .bytes()
            .filter(|decision| *decision == b'1')
            .count(),
        9,
        "authority v0 should allow exactly nine semantic states"
    );

    for (index, decision) in truth_table.bytes().enumerate() {
        let principal_verified = state_bit(index, 0b100000);
        let capability_authorized = state_bit(index, 0b010000);
        let consent_required = state_bit(index, 0b001000);
        let consent_valid = state_bit(index, 0b000100);
        let budget_required = state_bit(index, 0b000010);
        let budget_positive = state_bit(index, 0b000001);

        let expected_from_table = match decision {
            b'0' => false,
            b'1' => true,
            other => panic!("invalid authority truth-table decision byte: {other}"),
        };
        let expected_from_formula = principal_verified
            && capability_authorized
            && (!consent_required || consent_valid)
            && (!budget_required || budget_positive);

        assert_eq!(
            expected_from_table, expected_from_formula,
            "truth-table formula mismatch at state index {index}"
        );

        let input = AuthorityEvidence {
            principal: PrincipalEvidence {
                subject: "truth-table-state",
                verified: principal_verified,
            },
            capability: CapabilityEvidence {
                capability: "synthetic.effect",
                authorized: capability_authorized,
            },
            consent: ConsentEvidence {
                required: consent_required,
                valid: consent_valid,
            },
            budget: EffectBudgetEvidence {
                required: budget_required,
                remaining: u64::from(budget_positive),
            },
        };

        assert_eq!(
            evaluate_authority(input).is_ok(),
            expected_from_table,
            "Rust evaluator drift at state index {index}"
        );
    }
}

#[test]
fn deny_order_is_fail_closed_and_stable() {
    let mut input = valid_input();
    input.principal.verified = false;
    input.capability.authorized = false;
    input.consent.valid = false;
    input.budget.remaining = 0;
    assert_eq!(
        evaluate_authority(input),
        Err(DenyReason::UnverifiedPrincipal)
    );

    let mut input = valid_input();
    input.capability.authorized = false;
    input.consent.valid = false;
    input.budget.remaining = 0;
    assert_eq!(
        evaluate_authority(input),
        Err(DenyReason::UnauthorizedCapability)
    );

    let mut input = valid_input();
    input.consent.valid = false;
    input.budget.remaining = 0;
    assert_eq!(
        evaluate_authority(input),
        Err(DenyReason::MissingRequiredConsent)
    );

    let mut input = valid_input();
    input.budget.remaining = 0;
    assert_eq!(
        evaluate_authority(input),
        Err(DenyReason::ExhaustedEffectBudget)
    );
}

#[test]
fn authority_grant_is_bound_to_evaluated_subject_and_capability() {
    let grant = evaluate_authority(valid_input()).expect("valid evidence should grant authority");
    assert_eq!(grant.subject(), "principal:test");
    assert_eq!(grant.capability(), "synthetic.effect");
}
