use axiom_personal_agent_kernel_rust_lab::state_lanes::{
    LaneMutationInput, MergeInput, MergeRequest, StateLaneRegistry, ValidationDisposition,
    ValidationEvidenceInput,
};

fn digest(byte: char) -> String {
    std::iter::repeat_n(byte, 64).collect()
}

fn mutation(
    operation_id: &str,
    actor_tool_ref: &str,
    expected_lane_revision: u64,
    state_key: &str,
    value_digest: String,
    provenance_ref: &str,
) -> LaneMutationInput {
    LaneMutationInput {
        operation_id: operation_id.to_string(),
        actor_tool_ref: actor_tool_ref.to_string(),
        expected_lane_revision,
        state_key: state_key.to_string(),
        value_digest,
        provenance_refs: vec![provenance_ref.to_string()],
    }
}

fn merge_request(inputs: Vec<MergeInput>) -> MergeRequest {
    MergeRequest {
        merge_id: "merge.operator.1".to_string(),
        consumer_tool_ref: "tool.operator.console".to_string(),
        inputs,
    }
}

#[test]
fn one_tool_owns_exactly_one_write_lane_and_cross_tool_raw_reads_fail() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.coder", "tool.coder")
        .expect("register coder lane");

    assert!(
        registry
            .register_lane("lane.coder.second", "tool.coder")
            .is_err(),
        "one tool must not silently acquire a second mutation lane"
    );

    assert!(
        registry
            .append(
                "lane.coder",
                mutation(
                    "op.coder.1",
                    "tool.reviewer",
                    0,
                    "spec.digest",
                    digest('a'),
                    "prov.coder.1",
                ),
            )
            .is_err(),
        "a different tool must not write the coder lane"
    );

    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.1",
                "tool.coder",
                0,
                "spec.digest",
                digest('a'),
                "prov.coder.1",
            ),
        )
        .expect("owner write");

    assert!(
        registry
            .owner_history("lane.coder", "tool.reviewer")
            .is_err(),
        "cross-tool raw reads must go through an explicit merge"
    );
    assert_eq!(
        registry
            .owner_history("lane.coder", "tool.coder")
            .expect("owner history")
            .len(),
        1
    );
}

#[test]
fn stale_writer_is_rejected_and_lane_history_remains_append_only() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.coder", "tool.coder")
        .expect("register");

    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.1",
                "tool.coder",
                0,
                "fix.digest",
                digest('a'),
                "prov.coder.1",
            ),
        )
        .expect("first append");

    assert!(
        registry
            .append(
                "lane.coder",
                mutation(
                    "op.coder.stale",
                    "tool.coder",
                    0,
                    "fix.digest",
                    digest('b'),
                    "prov.coder.stale",
                ),
            )
            .is_err(),
        "stale expected revision must fail closed"
    );

    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.2",
                "tool.coder",
                1,
                "fix.digest",
                digest('b'),
                "prov.coder.2",
            ),
        )
        .expect("second append");

    let history = registry
        .owner_history("lane.coder", "tool.coder")
        .expect("history");
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].value_digest, digest('a'));
    assert_eq!(history[1].value_digest, digest('b'));
    assert_eq!(registry.lane_revision("lane.coder").expect("revision"), 2);
}

#[test]
fn merge_rejects_a_stale_cross_tool_read_and_existing_view_can_be_revalidated() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.spec", "tool.spec")
        .expect("register spec");
    registry
        .register_lane("lane.validator", "tool.validator")
        .expect("register validator");

    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.1",
                "tool.spec",
                0,
                "spec.digest",
                digest('a'),
                "prov.spec.1",
            ),
        )
        .expect("spec write");
    registry
        .append(
            "lane.validator",
            mutation(
                "op.validator.1",
                "tool.validator",
                0,
                "validator.digest",
                digest('c'),
                "prov.validator.1",
            ),
        )
        .expect("validator write");

    let request = merge_request(vec![
        MergeInput {
            lane_id: "lane.spec".to_string(),
            expected_revision: 1,
        },
        MergeInput {
            lane_id: "lane.validator".to_string(),
            expected_revision: 1,
        },
    ]);
    let view = registry.merge(&request).expect("fresh merge");
    registry.require_merge_fresh(&view).expect("fresh view");

    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.2",
                "tool.spec",
                1,
                "spec.digest",
                digest('b'),
                "prov.spec.2",
            ),
        )
        .expect("spec advances");

    assert!(
        registry.merge(&request).is_err(),
        "reusing a request bound to revision 1 must fail after the spec advances"
    );
    assert!(
        registry.require_merge_fresh(&view).is_err(),
        "a previously materialized merge must also be detectable as stale"
    );
}

#[test]
fn divergent_same_key_values_surface_as_conflict_instead_of_last_writer_wins() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.coder", "tool.coder")
        .expect("coder lane");
    registry
        .register_lane("lane.reviewer", "tool.reviewer")
        .expect("reviewer lane");

    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.1",
                "tool.coder",
                0,
                "release.spec",
                digest('a'),
                "prov.coder.1",
            ),
        )
        .expect("coder write");
    registry
        .append(
            "lane.reviewer",
            mutation(
                "op.reviewer.1",
                "tool.reviewer",
                0,
                "release.spec",
                digest('b'),
                "prov.reviewer.1",
            ),
        )
        .expect("reviewer write");

    let view = registry
        .merge(&merge_request(vec![
            MergeInput {
                lane_id: "lane.reviewer".to_string(),
                expected_revision: 1,
            },
            MergeInput {
                lane_id: "lane.coder".to_string(),
                expected_revision: 1,
            },
        ]))
        .expect("merge");

    assert!(!view.is_consistent());
    assert_eq!(view.conflicts().len(), 1);
    assert_eq!(view.conflicts()[0].state_key, "release.spec");
    assert_eq!(view.conflicts()[0].variants.len(), 2);
    assert!(
        view.value_digest("release.spec").is_err(),
        "a conflicted key must have no silent merged value"
    );
    assert!(view.require_consistent().is_err());
}

#[test]
fn identical_cross_lane_values_coalesce_without_erasing_provenance() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.coder", "tool.coder")
        .expect("coder lane");
    registry
        .register_lane("lane.reviewer", "tool.reviewer")
        .expect("reviewer lane");

    let shared = digest('d');
    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.1",
                "tool.coder",
                0,
                "tested.head",
                shared.clone(),
                "prov.coder.1",
            ),
        )
        .expect("coder write");
    registry
        .append(
            "lane.reviewer",
            mutation(
                "op.reviewer.1",
                "tool.reviewer",
                0,
                "tested.head",
                shared.clone(),
                "prov.reviewer.1",
            ),
        )
        .expect("reviewer write");

    let view = registry
        .merge(&merge_request(vec![
            MergeInput {
                lane_id: "lane.coder".to_string(),
                expected_revision: 1,
            },
            MergeInput {
                lane_id: "lane.reviewer".to_string(),
                expected_revision: 1,
            },
        ]))
        .expect("merge");

    assert!(view.is_consistent());
    assert_eq!(view.values().len(), 1);
    assert_eq!(view.values()[0].value_digest, shared);
    assert_eq!(view.values()[0].origins.len(), 2);
    assert_eq!(
        view.value_digest("tested.head")
            .expect("not conflicted")
            .expect("value"),
        digest('d')
    );
}

#[test]
fn merge_is_deterministic_and_neither_registry_nor_view_grants_authority() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.alpha", "tool.alpha")
        .expect("alpha lane");
    registry
        .register_lane("lane.beta", "tool.beta")
        .expect("beta lane");

    registry
        .append(
            "lane.alpha",
            mutation(
                "op.alpha.1",
                "tool.alpha",
                0,
                "alpha.key",
                digest('a'),
                "prov.alpha.1",
            ),
        )
        .expect("alpha write");
    registry
        .append(
            "lane.beta",
            mutation(
                "op.beta.1",
                "tool.beta",
                0,
                "beta.key",
                digest('b'),
                "prov.beta.1",
            ),
        )
        .expect("beta write");

    let first = registry
        .merge(&merge_request(vec![
            MergeInput {
                lane_id: "lane.beta".to_string(),
                expected_revision: 1,
            },
            MergeInput {
                lane_id: "lane.alpha".to_string(),
                expected_revision: 1,
            },
        ]))
        .expect("first merge");

    let second = registry
        .merge(&merge_request(vec![
            MergeInput {
                lane_id: "lane.alpha".to_string(),
                expected_revision: 1,
            },
            MergeInput {
                lane_id: "lane.beta".to_string(),
                expected_revision: 1,
            },
        ]))
        .expect("second merge");

    assert_eq!(first, second);
    assert!(!registry.grants_authority());
    assert!(!first.grants_authority());
    assert!(!first.truth_certified());
}

fn validation_input(
    validation_id: &str,
    validator_tool_ref: &str,
    merge_id: &str,
    result_digest: String,
) -> ValidationEvidenceInput {
    ValidationEvidenceInput {
        validation_id: validation_id.to_string(),
        validator_tool_ref: validator_tool_ref.to_string(),
        merge_id: merge_id.to_string(),
        disposition: ValidationDisposition::Conforms,
        result_digest,
        evidence_refs: vec!["evidence.validation.1".to_string()],
    }
}

#[test]
fn validation_receipt_becomes_stale_when_any_source_lane_advances() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.spec", "tool.spec")
        .expect("spec lane");
    registry
        .register_lane("lane.coder", "tool.coder")
        .expect("coder lane");

    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.1",
                "tool.spec",
                0,
                "spec.digest",
                digest('a'),
                "prov.spec.1",
            ),
        )
        .expect("spec write");
    registry
        .append(
            "lane.coder",
            mutation(
                "op.coder.1",
                "tool.coder",
                0,
                "fix.digest",
                digest('b'),
                "prov.coder.1",
            ),
        )
        .expect("coder write");

    let view = registry
        .merge(&MergeRequest {
            merge_id: "merge.validator.1".to_string(),
            consumer_tool_ref: "tool.validator".to_string(),
            inputs: vec![
                MergeInput {
                    lane_id: "lane.spec".to_string(),
                    expected_revision: 1,
                },
                MergeInput {
                    lane_id: "lane.coder".to_string(),
                    expected_revision: 1,
                },
            ],
        })
        .expect("validator merge");

    let receipt = registry
        .issue_validation_receipt(
            &view,
            validation_input(
                "validation.1",
                "tool.validator",
                "merge.validator.1",
                digest('c'),
            ),
        )
        .expect("validation receipt");

    registry
        .require_validation_current(&receipt)
        .expect("validation starts current");
    assert_eq!(receipt.inputs().len(), 2);
    assert_eq!(receipt.values().len(), 2);
    assert_eq!(receipt.disposition(), ValidationDisposition::Conforms);
    assert!(!receipt.grants_authority());
    assert!(!receipt.truth_certified());

    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.2",
                "tool.spec",
                1,
                "spec.digest",
                digest('d'),
                "prov.spec.2",
            ),
        )
        .expect("spec advances");

    assert!(
        registry.require_validation_current(&receipt).is_err(),
        "validation against the old merged spec must become unusable"
    );
}

#[test]
fn validation_requires_the_actual_merge_consumer_and_rejects_duplicate_ids() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.spec", "tool.spec")
        .expect("spec lane");
    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.1",
                "tool.spec",
                0,
                "spec.digest",
                digest('a'),
                "prov.spec.1",
            ),
        )
        .expect("spec write");

    let view = registry
        .merge(&MergeRequest {
            merge_id: "merge.validator.1".to_string(),
            consumer_tool_ref: "tool.validator".to_string(),
            inputs: vec![MergeInput {
                lane_id: "lane.spec".to_string(),
                expected_revision: 1,
            }],
        })
        .expect("merge");

    assert!(
        registry
            .issue_validation_receipt(
                &view,
                validation_input(
                    "validation.wrong-consumer",
                    "tool.other",
                    "merge.validator.1",
                    digest('b'),
                ),
            )
            .is_err(),
        "a tool that did not consume the view cannot validate it"
    );

    registry
        .issue_validation_receipt(
            &view,
            validation_input(
                "validation.unique",
                "tool.validator",
                "merge.validator.1",
                digest('c'),
            ),
        )
        .expect("first validation");

    assert!(
        registry
            .issue_validation_receipt(
                &view,
                validation_input(
                    "validation.unique",
                    "tool.validator",
                    "merge.validator.1",
                    digest('d'),
                ),
            )
            .is_err(),
        "validation ids are single-use within the registry"
    );
}

#[test]
fn conflicted_merge_cannot_be_laundered_into_a_validation_receipt() {
    let mut registry = StateLaneRegistry::new();
    registry
        .register_lane("lane.spec", "tool.spec")
        .expect("spec lane");
    registry
        .register_lane("lane.reviewer", "tool.reviewer")
        .expect("reviewer lane");

    registry
        .append(
            "lane.spec",
            mutation(
                "op.spec.1",
                "tool.spec",
                0,
                "release.spec",
                digest('a'),
                "prov.spec.1",
            ),
        )
        .expect("spec write");
    registry
        .append(
            "lane.reviewer",
            mutation(
                "op.reviewer.1",
                "tool.reviewer",
                0,
                "release.spec",
                digest('b'),
                "prov.reviewer.1",
            ),
        )
        .expect("reviewer write");

    let view = registry
        .merge(&MergeRequest {
            merge_id: "merge.validator.conflict".to_string(),
            consumer_tool_ref: "tool.validator".to_string(),
            inputs: vec![
                MergeInput {
                    lane_id: "lane.spec".to_string(),
                    expected_revision: 1,
                },
                MergeInput {
                    lane_id: "lane.reviewer".to_string(),
                    expected_revision: 1,
                },
            ],
        })
        .expect("conflicted merge is visible");

    assert!(!view.is_consistent());
    assert!(
        registry
            .issue_validation_receipt(
                &view,
                validation_input(
                    "validation.conflict",
                    "tool.validator",
                    "merge.validator.conflict",
                    digest('c'),
                ),
            )
            .is_err(),
        "unresolved state conflicts must not be converted into a clean validation receipt"
    );
}
