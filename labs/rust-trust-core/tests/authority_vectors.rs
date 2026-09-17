use std::collections::BTreeSet;

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
fn authority_fixture_exhausts_the_six_input_boolean_state_space() {
    let fixture = include_str!("../fixtures/authority-vectors.v0.tsv");
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some(HEADER));

    let mut case_ids = BTreeSet::new();
    let mut combinations = BTreeSet::new();
    let mut row_count = 0usize;

    for (index, line) in lines.enumerate() {
        if line.is_empty() {
            continue;
        }

        let fields: Vec<_> = line.split('\t').collect();
        assert_eq!(fields.len(), 8, "invalid fixture row {}", index + 2);

        let case_id = fields[0];
        let principal_verified = parse_bool(fields[1]);
        let capability_authorized = parse_bool(fields[2]);
        let consent_required = parse_bool(fields[3]);
        let consent_valid = parse_bool(fields[4]);
        let budget_required = parse_bool(fields[5]);
        let budget_remaining = fields[6]
            .parse::<u64>()
            .unwrap_or_else(|_| panic!("invalid budget fixture value for {case_id}"));
        let budget_positive = budget_remaining > 0;

        assert!(case_ids.insert(case_id), "duplicate case id: {case_id}");
        assert!(
            combinations.insert((
                principal_verified,
                capability_authorized,
                consent_required,
                consent_valid,
                budget_required,
                budget_positive,
            )),
            "duplicate semantic authority state: {case_id}"
        );

        let expected_allowed = principal_verified
            && capability_authorized
            && (!consent_required || consent_valid)
            && (!budget_required || budget_positive);
        let expected = if expected_allowed { "allow" } else { "deny" };
        assert_eq!(
            fields[7], expected,
            "fixture formula mismatch for {case_id}"
        );
        row_count += 1;
    }

    assert_eq!(
        row_count, 64,
        "authority fixture must contain all 64 semantic states"
    );
    assert_eq!(
        combinations.len(),
        64,
        "authority fixture must cover every semantic state exactly once"
    );
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
