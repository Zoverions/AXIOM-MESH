use axiom_personal_agent_kernel_rust_lab::{
    AuthorityBudget, AutonomyLevel, AutonomyState, BudgetDimension, BudgetRequest, Constitution,
    Kernel, KernelIdentity, PolicyProposal, RuntimeSurface,
};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const NOW: u64 = 1_789_733_000;

fn sha(ch: char) -> String {
    std::iter::repeat_n(ch, 64).collect()
}

fn surface() -> RuntimeSurface {
    RuntimeSurface::new(sha('a'), sha('b'), sha('c'), 4).expect("valid surface")
}

fn autonomy(value: &str) -> AutonomyLevel {
    match value {
        "observe" => AutonomyLevel::Observe,
        "draft" => AutonomyLevel::Draft,
        "prepare" => AutonomyLevel::Prepare,
        "request-effect" => AutonomyLevel::RequestEffect,
        other => panic!("unknown autonomy level {other}"),
    }
}

fn parse_tsv(path: PathBuf) -> Vec<BTreeMap<String, String>> {
    let text = fs::read_to_string(path).expect("read fixture");
    let mut lines = text.trim().lines();
    let header: Vec<String> = lines
        .next()
        .expect("header")
        .split('\t')
        .map(str::to_string)
        .collect();

    lines
        .map(|line| {
            let values: Vec<&str> = line.split('\t').collect();
            assert_eq!(values.len(), header.len());
            header
                .iter()
                .cloned()
                .zip(values.into_iter().map(str::to_string))
                .collect()
        })
        .collect()
}

fn kernel(row: &BTreeMap<String, String>) -> Kernel {
    let expires_at = if row["expired"] == "1" {
        NOW
    } else {
        NOW + 10_000
    };

    let identity = KernelIdentity {
        kernel_id: "personal-kernel:oracle".into(),
        owner_subject_ref: "subject:owner-1".into(),
        principal_ref: "principal:personal-agent-1".into(),
        personal_agent_pack_ref: "pack:owner-1".into(),
        personal_agent_pack_sha256: sha('a'),
    };
    let constitution =
        Constitution::strict("constitution:owner-1", "policy:constitution-amendment-1")
            .expect("strict constitution");
    let budgets = vec![
        AuthorityBudget {
            budget_id: "budget:purchase-actions".into(),
            capability_ref: "capability:purchase".into(),
            dimension: BudgetDimension::Actions,
            ceiling: 10,
            consumed: 3,
            currency: None,
            valid_from_unix_s: NOW - 10_000,
            expires_at_unix_s: expires_at,
        },
        AuthorityBudget {
            budget_id: "budget:purchase-cad".into(),
            capability_ref: "capability:purchase".into(),
            dimension: BudgetDimension::MinorCurrencyUnits,
            ceiling: 20_000,
            consumed: 5_000,
            currency: Some("CAD".into()),
            valid_from_unix_s: NOW - 10_000,
            expires_at_unix_s: expires_at,
        },
    ];
    let autonomy = vec![AutonomyState {
        capability_ref: "capability:purchase".into(),
        level: autonomy(&row["kernel_autonomy"]),
        surface: surface(),
        successful_receipts: 8,
        failed_receipts: 0,
    }];

    Kernel::new(identity, constitution, budgets, autonomy, 7).expect("oracle kernel")
}

fn proposal(row: &BTreeMap<String, String>) -> PolicyProposal {
    let mut budget_requests = Vec::new();

    if row["include_actions"] == "1" {
        budget_requests.push(BudgetRequest {
            budget_id: "budget:purchase-actions".into(),
            amount: row["action_amount"].parse().expect("action amount"),
            currency: None,
        });
    }
    if row["include_cad"] == "1" {
        budget_requests.push(BudgetRequest {
            budget_id: "budget:purchase-cad".into(),
            amount: row["cad_amount"].parse().expect("CAD amount"),
            currency: Some(row["cad_currency"].clone()),
        });
    }
    if row["extra_budget"] == "1" {
        budget_requests.push(BudgetRequest {
            budget_id: "budget:extra".into(),
            amount: 1,
            currency: None,
        });
    }

    PolicyProposal {
        proposal_id: format!("proposal:{}", row["case_id"]),
        owner_subject_ref: "subject:owner-1".into(),
        capability_ref: "capability:purchase".into(),
        requested_autonomy: autonomy(&row["requested_autonomy"]),
        budget_requests,
        uses_quarantined_memory: row["quarantined"] == "1",
        effect_requested: row["effect_requested"] == "1",
    }
}

#[test]
fn rust_policy_semantics_match_node_v0_golden_corpus() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let rows = parse_tsv(root.join("fixtures/policy-conformance.v0.tsv"));
    let golden = parse_tsv(root.join("fixtures/policy-node-golden.v0.tsv"));
    let expected: BTreeMap<String, BTreeMap<String, String>> = golden
        .into_iter()
        .map(|row| (row["case_id"].clone(), row))
        .collect();

    assert_eq!(rows.len(), expected.len());

    for row in rows {
        let case_id = row["case_id"].clone();
        let assessment = kernel(&row)
            .assess_policy_proposal(&proposal(&row), NOW)
            .unwrap_or_else(|error| panic!("{case_id}: {}", error.message()));

        let golden = expected
            .get(&case_id)
            .unwrap_or_else(|| panic!("missing golden row for {case_id}"));
        let status = if assessment.eligible_within_personal_policy {
            "allow"
        } else {
            "deny"
        };
        let blockers = if assessment.blockers.is_empty() {
            "-".to_string()
        } else {
            assessment.blockers.join(",")
        };

        assert_eq!(status, golden["status"], "{case_id} status");
        assert_eq!(blockers, golden["blockers"], "{case_id} blockers");
        assert!(!assessment.grants_authority());
    }
}
