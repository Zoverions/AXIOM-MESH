use axiom_trust_core_lab::{
    parse_authority_context_fixture, parse_authority_context_line, validate_authority_context,
};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const GENERATED_SEED: u32 = 0x5354_3542;
const GENERATED_VALID_CASES: usize = 256;
const GENERATED_INVALID_CASES: usize = 256;
const POLICY_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const POLICY_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AdmissionClass {
    EnvelopeRejected,
    StructuralRejected,
    Admitted,
}

#[derive(Debug, Clone)]
struct GeneratedCase {
    case_id: String,
    line: String,
    expected: AdmissionClass,
}

#[derive(Debug, Clone, Copy)]
struct XorShift32 {
    state: u32,
}

impl XorShift32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> u32 {
        self.state ^= self.state.wrapping_shl(13);
        self.state ^= self.state.wrapping_shr(17);
        self.state ^= self.state.wrapping_shl(5);
        self.state
    }
}

#[derive(Debug, Clone)]
struct ContextTemplate {
    grant_verified: bool,
    grant_id: Option<String>,
    grant_actions: Vec<String>,
    grant_expires_at: String,
    grant_policy_digest: String,
    grant_extra: bool,
    intent_bound: bool,
    intent_actions: Vec<String>,
    request_principal_id: String,
    request_action: String,
    request_protocol: Option<String>,
    request_policy_digest: String,
    history: String,
    restrictions: String,
    top_extra: bool,
}

impl ContextTemplate {
    fn baseline(nonce: u32) -> Self {
        Self {
            grant_verified: true,
            grant_id: Some(format!("grant:generated:{nonce}")),
            grant_actions: vec!["read".to_owned()],
            grant_expires_at: "2099-01-01T00:00:00.000Z".to_owned(),
            grant_policy_digest: POLICY_A.to_owned(),
            grant_extra: false,
            intent_bound: true,
            intent_actions: vec!["read".to_owned()],
            request_principal_id: "principal:test".to_owned(),
            request_action: "read".to_owned(),
            request_protocol: Some("local".to_owned()),
            request_policy_digest: POLICY_A.to_owned(),
            history: "[]".to_owned(),
            restrictions: "[]".to_owned(),
            top_extra: false,
        }
    }
}

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn valid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/authority-context-v0.jsonl")
}

fn invalid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/authority-context-v0-invalid.jsonl")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/authority_context_oracle.mjs")
}

fn json_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn json_string_array(values: &[String]) -> String {
    format!(
        "[{}]",
        values
            .iter()
            .map(|value| json_string(value))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn render_context(case_id: &str, nonce: u32, template: &ContextTemplate) -> String {
    let mut grant_fields = vec![
        format!("\"verified\":{}", template.grant_verified),
    ];
    if let Some(grant_id) = &template.grant_id {
        grant_fields.push(format!("\"grant_id\":{}", json_string(grant_id)));
    }
    grant_fields.extend([
        "\"issuer\":\"gateway\"".to_owned(),
        "\"principal_id\":\"principal:test\"".to_owned(),
        "\"resources\":[\"resource:a\"]".to_owned(),
        format!(
            "\"actions\":{}",
            json_string_array(&template.grant_actions)
        ),
        "\"purposes\":[\"research\"]".to_owned(),
        "\"destinations\":[\"local\"]".to_owned(),
        format!(
            "\"expires_at\":{}",
            json_string(&template.grant_expires_at)
        ),
        format!(
            "\"policy_digest\":{}",
            json_string(&template.grant_policy_digest)
        ),
    ]);
    if template.grant_extra {
        grant_fields.push("\"extra\":true".to_owned());
    }

    let intent = format!(
        "{{\"bound\":{},\"actions\":{},\"purposes\":[\"research\"],\"destinations\":[\"local\"],\"resources\":[\"resource:a\"]}}",
        template.intent_bound,
        json_string_array(&template.intent_actions)
    );

    let mut request_fields = vec![
        format!(
            "\"principal_id\":{}",
            json_string(&template.request_principal_id)
        ),
        "\"resource\":\"resource:a\"".to_owned(),
        format!("\"action\":{}", json_string(&template.request_action)),
        "\"purpose\":\"research\"".to_owned(),
        "\"destination\":\"local\"".to_owned(),
    ];
    if let Some(protocol) = &template.request_protocol {
        request_fields.push(format!("\"protocol\":{}", json_string(protocol)));
    }
    request_fields.extend([
        format!("\"causal_scope_id\":\"scope:{nonce}\""),
        format!(
            "\"policy_digest\":{}",
            json_string(&template.request_policy_digest)
        ),
    ]);

    let mut top_fields = vec![
        format!("\"case_id\":{}", json_string(case_id)),
        format!("\"grant\":{{{}}}", grant_fields.join(",")),
        format!("\"intent\":{intent}"),
        format!("\"request\":{{{}}}", request_fields.join(",")),
        format!("\"history\":{}", template.history),
        format!("\"restrictions\":{}", template.restrictions),
    ];
    if template.top_extra {
        top_fields.push("\"extra\":true".to_owned());
    }
    format!("{{{}}}", top_fields.join(","))
}

fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, bool>, String> {
    let mut outputs = BTreeMap::new();
    for line in stdout.lines() {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() != 2 {
            return Err(format!(
                "Stage 5B oracle output must have 2 columns: {line}"
            ));
        }
        let admitted = match columns[1] {
            "true" => true,
            "false" => false,
            other => return Err(format!("invalid Stage 5B oracle boolean: {other}")),
        };
        if outputs.insert(columns[0].to_owned(), admitted).is_some() {
            return Err(format!("duplicate Stage 5B oracle case_id: {}", columns[0]));
        }
    }
    Ok(outputs)
}

fn run_node(text: &str) -> std::process::Output {
    let mut child = Command::new("node")
        .arg(oracle_path())
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Stage 5B Node oracle process must start");
    child
        .stdin
        .take()
        .expect("Stage 5B Node oracle stdin must be available")
        .write_all(text.as_bytes())
        .expect("Stage 5B fixture must be writable to Node oracle stdin");
    child
        .wait_with_output()
        .expect("Stage 5B Node oracle process must finish")
}

fn node_outputs_for_text(text: &str) -> BTreeMap<String, bool> {
    let output = run_node(text);
    assert!(
        output.status.success(),
        "Stage 5B Node oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("Stage 5B oracle output must be UTF-8");
    parse_node_outputs(stdout.trim_end()).expect("Stage 5B oracle output must be well formed")
}

fn rust_classify_line(line: &str) -> AdmissionClass {
    match parse_authority_context_line(line) {
        Err(_) => AdmissionClass::EnvelopeRejected,
        Ok(case) => match validate_authority_context(&case) {
            Ok(()) => AdmissionClass::Admitted,
            Err(_) => AdmissionClass::StructuralRejected,
        },
    }
}

fn node_classify_line(line: &str) -> AdmissionClass {
    let output = run_node(&format!("{line}\n"));
    if !output.status.success() {
        return AdmissionClass::EnvelopeRejected;
    }
    let stdout = String::from_utf8(output.stdout).expect("Stage 5B oracle output must be UTF-8");
    let outputs = parse_node_outputs(stdout.trim_end()).expect("Stage 5B oracle output must parse");
    assert_eq!(outputs.len(), 1, "single-line oracle must emit one result");
    if *outputs
        .values()
        .next()
        .expect("single Node result must exist")
    {
        AdmissionClass::Admitted
    } else {
        AdmissionClass::StructuralRejected
    }
}

fn compare_admissions(
    rust: &BTreeMap<String, bool>,
    node: &BTreeMap<String, bool>,
) -> Result<(), String> {
    if rust.len() != node.len() {
        return Err(format!(
            "Stage 5B comparison count mismatch: Rust={} Node={}",
            rust.len(),
            node.len()
        ));
    }
    for (case_id, rust_admitted) in rust {
        let node_admitted = node
            .get(case_id)
            .ok_or_else(|| format!("Node oracle missing Stage 5B case {case_id}"))?;
        if rust_admitted != node_admitted {
            return Err(format!(
                "Stage 5B admission mismatch for {case_id}: Rust={rust_admitted} Node={node_admitted}"
            ));
        }
    }
    Ok(())
}

fn generated_valid_contexts(seed: u32, count: usize) -> Vec<GeneratedCase> {
    let mut rng = XorShift32::new(seed);
    let mut cases = Vec::with_capacity(count);
    for index in 0..count {
        let nonce = rng.next();
        let case_id = format!("generated_valid_{index:03}");
        let mut template = ContextTemplate::baseline(nonce);
        if index >= count / 2 {
            match (index - count / 2) % 7 {
                0 => template.grant_expires_at = "2029-12-31T23:59:59.999Z".to_owned(),
                1 => template.request_principal_id = "principal:other".to_owned(),
                2 => template.request_policy_digest = POLICY_B.to_owned(),
                3 => template.request_action = "write".to_owned(),
                4 => {
                    template.grant_actions = vec!["read".to_owned(), "write".to_owned()];
                    template.request_action = "write".to_owned();
                }
                5 => {
                    template.intent_actions = vec!["read".to_owned(), "write".to_owned()];
                }
                _ => {
                    template.grant_actions = vec![
                        "execute".to_owned(),
                        "prepare".to_owned(),
                        "read".to_owned(),
                    ];
                    template.intent_actions = template.grant_actions.clone();
                    template.request_action = "execute".to_owned();
                    template.history = format!(
                        "[{{\"causal_scope_id\":\"scope:{nonce}\",\"action\":\"prepare\",\"resource\":\"resource:a\",\"purpose\":\"research\",\"destination\":\"local\"}},{{\"causal_scope_id\":\"scope:{nonce}\",\"action\":\"approve\",\"resource\":\"resource:a\",\"purpose\":\"research\",\"destination\":\"local\"}}]"
                    );
                    template.restrictions =
                        "[{\"id\":\"restriction:block\",\"ordered_actions\":[\"prepare\",\"approve\",\"execute\"]}]"
                            .to_owned();
                }
            }
        }
        cases.push(GeneratedCase {
            line: render_context(&case_id, nonce, &template),
            case_id,
            expected: AdmissionClass::Admitted,
        });
    }
    cases
}

fn generated_invalid_contexts(seed: u32, count: usize) -> Vec<GeneratedCase> {
    let mut rng = XorShift32::new(seed ^ 0xA5A5_5A5A);
    let mut cases = Vec::with_capacity(count);
    for index in 0..count {
        let nonce = rng.next();
        let case_id = format!("generated_invalid_{index:03}");
        let category = index % 16;
        let mut template = ContextTemplate::baseline(nonce);
        let expected = match category {
            0 => {
                template.grant_verified = false;
                AdmissionClass::StructuralRejected
            }
            1 => {
                template.intent_bound = false;
                AdmissionClass::StructuralRejected
            }
            2 => {
                template.grant_id = Some("bad id".to_owned());
                AdmissionClass::StructuralRejected
            }
            3 => {
                template.grant_policy_digest = "A".repeat(64);
                AdmissionClass::StructuralRejected
            }
            4 => {
                template.request_policy_digest = "0".repeat(63);
                AdmissionClass::StructuralRejected
            }
            5 => {
                template.grant_expires_at = "2099-02-29T00:00:00.000Z".to_owned();
                AdmissionClass::StructuralRejected
            }
            6 => {
                template.grant_actions = vec!["write".to_owned(), "read".to_owned()];
                AdmissionClass::StructuralRejected
            }
            7 => {
                template.grant_actions = vec!["read".to_owned(), "read".to_owned()];
                AdmissionClass::StructuralRejected
            }
            8 => {
                template.grant_actions = vec![String::new()];
                AdmissionClass::StructuralRejected
            }
            9 => {
                template.grant_id = None;
                AdmissionClass::StructuralRejected
            }
            10 => {
                template.grant_extra = true;
                AdmissionClass::StructuralRejected
            }
            11 => {
                template.request_protocol = None;
                AdmissionClass::StructuralRejected
            }
            12 => {
                template.history = format!(
                    "[{{\"causal_scope_id\":\"scope:{nonce}\",\"action\":\"read\",\"resource\":\"resource:a\",\"purpose\":\"research\"}}]"
                );
                AdmissionClass::StructuralRejected
            }
            13 => {
                template.restrictions =
                    "[{\"id\":\"restriction:one\",\"ordered_actions\":[\"prepare\"]}]"
                        .to_owned();
                AdmissionClass::StructuralRejected
            }
            14 => {
                template.restrictions = format!(
                    "[{{\"id\":\"restriction:seventeen\",\"ordered_actions\":{}}}]",
                    json_string_array(
                        &(0..17)
                            .map(|action| format!("a{action:02}"))
                            .collect::<Vec<_>>()
                    )
                );
                AdmissionClass::StructuralRejected
            }
            _ => {
                template.top_extra = true;
                AdmissionClass::EnvelopeRejected
            }
        };
        cases.push(GeneratedCase {
            line: render_context(&case_id, nonce, &template),
            case_id,
            expected,
        });
    }
    cases
}

fn over_bound_contexts() -> Vec<GeneratedCase> {
    let mut cases = Vec::new();

    let mut set_template = ContextTemplate::baseline(1);
    set_template.grant_actions = (0..129).map(|index| format!("action:{index:03}")).collect();
    set_template.intent_actions = vec!["action:000".to_owned()];
    set_template.request_action = "action:000".to_owned();
    cases.push(GeneratedCase {
        case_id: "over_bound_set_129".to_owned(),
        line: render_context("over_bound_set_129", 1, &set_template),
        expected: AdmissionClass::StructuralRejected,
    });

    let mut history_template = ContextTemplate::baseline(2);
    let history_entry = "{\"causal_scope_id\":\"scope:2\",\"action\":\"read\",\"resource\":\"resource:a\",\"purpose\":\"research\",\"destination\":\"local\"}";
    history_template.history = format!("[{}]", vec![history_entry; 4097].join(","));
    cases.push(GeneratedCase {
        case_id: "over_bound_history_4097".to_owned(),
        line: render_context("over_bound_history_4097", 2, &history_template),
        expected: AdmissionClass::StructuralRejected,
    });

    let mut restrictions_template = ContextTemplate::baseline(3);
    let restriction_entry = "{\"id\":\"restriction:r\",\"ordered_actions\":[\"a\",\"b\"]}";
    restrictions_template.restrictions =
        format!("[{}]", vec![restriction_entry; 257].join(","));
    cases.push(GeneratedCase {
        case_id: "over_bound_restrictions_257".to_owned(),
        line: render_context("over_bound_restrictions_257", 3, &restrictions_template),
        expected: AdmissionClass::StructuralRejected,
    });

    let mut ordered_actions_template = ContextTemplate::baseline(4);
    ordered_actions_template.restrictions = format!(
        "[{{\"id\":\"restriction:seventeen\",\"ordered_actions\":{}}}]",
        json_string_array(
            &(0..17)
                .map(|action| format!("a{action:02}"))
                .collect::<Vec<_>>()
        )
    );
    cases.push(GeneratedCase {
        case_id: "over_bound_ordered_actions_17".to_owned(),
        line: render_context("over_bound_ordered_actions_17", 4, &ordered_actions_template),
        expected: AdmissionClass::StructuralRejected,
    });

    let mut member_template = ContextTemplate::baseline(5);
    member_template.grant_actions = vec!["a".repeat(257)];
    cases.push(GeneratedCase {
        case_id: "over_bound_set_member_257".to_owned(),
        line: render_context("over_bound_set_member_257", 5, &member_template),
        expected: AdmissionClass::StructuralRejected,
    });

    let mut identifier_template = ContextTemplate::baseline(6);
    identifier_template.grant_id = Some("a".repeat(193));
    cases.push(GeneratedCase {
        case_id: "over_bound_identifier_193".to_owned(),
        line: render_context("over_bound_identifier_193", 6, &identifier_template),
        expected: AdmissionClass::StructuralRejected,
    });

    cases
}

#[test]
fn stage5b_valid_fixture_requires_structural_validator() {
    let text =
        std::fs::read_to_string(valid_fixture_path()).expect("Stage 5B fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    assert_eq!(cases.len(), 11);
    for case in &cases {
        validate_authority_context(case)
            .unwrap_or_else(|error| panic!("{}: {error}", case.case_id()));
    }
}

#[test]
fn hand_curated_valid_contexts_match_real_node_structural_oracle() {
    let text = std::fs::read_to_string(valid_fixture_path())
        .expect("Stage 5B valid fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    let rust = cases
        .iter()
        .map(|case| {
            (
                case.case_id().to_owned(),
                validate_authority_context(case).is_ok(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let node = node_outputs_for_text(&text);
    assert!(rust.values().all(|admitted| *admitted));
    assert!(node.values().all(|admitted| *admitted));
    compare_admissions(&rust, &node).expect("hand-curated valid Stage 5B corpus must match");
}

#[test]
fn hand_curated_invalid_contexts_match_declared_rejection_layer() {
    const ENVELOPE_CASES: &[&str] = &[
        "missing_top_level_history",
        "missing_top_level_restrictions",
        "extra_top_level_field",
    ];

    let text = std::fs::read_to_string(invalid_fixture_path())
        .expect("Stage 5B invalid fixture must be readable");
    let lines = text.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 24);

    for line in lines {
        let raw: serde_free_case_id::CaseId = serde_free_case_id::extract(line)
            .unwrap_or_else(|error| panic!("invalid fixture case_id must be extractable: {error}"));
        let expected = if ENVELOPE_CASES.contains(&raw.0.as_str()) {
            AdmissionClass::EnvelopeRejected
        } else {
            AdmissionClass::StructuralRejected
        };
        assert_eq!(
            rust_classify_line(line),
            expected,
            "{} Rust rejection layer mismatch",
            raw.0
        );
        assert_eq!(
            node_classify_line(line),
            expected,
            "{} Node rejection layer mismatch",
            raw.0
        );
    }
}

#[test]
fn differential_comparator_detects_deliberate_perturbation() {
    let text = std::fs::read_to_string(valid_fixture_path())
        .expect("Stage 5B valid fixture must be readable");
    let cases = parse_authority_context_fixture(&text).expect("Stage 5B valid fixture must parse");
    let rust = cases
        .iter()
        .map(|case| {
            (
                case.case_id().to_owned(),
                validate_authority_context(case).is_ok(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut perturbed = node_outputs_for_text(&text);
    let first_case = perturbed
        .keys()
        .next()
        .expect("Stage 5B valid corpus must not be empty")
        .clone();
    let current = perturbed[&first_case];
    perturbed.insert(first_case.clone(), !current);
    let error = compare_admissions(&rust, &perturbed)
        .expect_err("deliberate Stage 5B comparator perturbation must fail");
    assert!(error.contains(&first_case));
}

#[test]
fn generated_stage5b_campaign_matches_real_node_oracle() {
    let valid = generated_valid_contexts(GENERATED_SEED, GENERATED_VALID_CASES);
    let invalid = generated_invalid_contexts(GENERATED_SEED, GENERATED_INVALID_CASES);
    assert_eq!(valid.len(), GENERATED_VALID_CASES);
    assert_eq!(invalid.len(), GENERATED_INVALID_CASES);
    assert_eq!(
        invalid
            .iter()
            .filter(|case| case.expected == AdmissionClass::EnvelopeRejected)
            .count(),
        16
    );
    assert_eq!(
        invalid
            .iter()
            .filter(|case| case.expected == AdmissionClass::StructuralRejected)
            .count(),
        240
    );

    let valid_text = format!(
        "{}\n",
        valid
            .iter()
            .map(|case| case.line.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    );
    let rust_valid = parse_authority_context_fixture(&valid_text)
        .expect("generated Stage 5B valid corpus must parse");
    assert_eq!(rust_valid.len(), GENERATED_VALID_CASES);
    for case in &rust_valid {
        validate_authority_context(case).unwrap_or_else(|error| {
            panic!("generated valid {} must be structurally admitted: {error}", case.case_id())
        });
    }
    let node_valid = node_outputs_for_text(&valid_text);
    assert_eq!(node_valid.len(), GENERATED_VALID_CASES);
    assert!(node_valid.values().all(|admitted| *admitted));

    let structural_invalid = invalid
        .iter()
        .filter(|case| case.expected == AdmissionClass::StructuralRejected)
        .collect::<Vec<_>>();
    let structural_text = format!(
        "{}\n",
        structural_invalid
            .iter()
            .map(|case| case.line.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    );
    let node_structural = node_outputs_for_text(&structural_text);
    assert_eq!(node_structural.len(), structural_invalid.len());
    assert!(node_structural.values().all(|admitted| !*admitted));

    for case in &invalid {
        assert_eq!(
            rust_classify_line(&case.line),
            case.expected,
            "{} Rust generated rejection-layer mismatch",
            case.case_id
        );
        match case.expected {
            AdmissionClass::EnvelopeRejected => assert_eq!(
                node_classify_line(&case.line),
                AdmissionClass::EnvelopeRejected,
                "{} Node generated envelope mismatch",
                case.case_id
            ),
            AdmissionClass::StructuralRejected => assert_eq!(
                node_structural.get(&case.case_id),
                Some(&false),
                "{} Node generated structural mismatch",
                case.case_id
            ),
            AdmissionClass::Admitted => unreachable!("invalid campaign cannot admit"),
        }
    }
}

#[test]
fn explicit_over_bound_contexts_fail_closed_at_structural_layer() {
    let cases = over_bound_contexts();
    assert_eq!(cases.len(), 6);
    for case in &cases {
        assert!(case.line.len() < 2 * 1024 * 1024);
        assert_eq!(
            rust_classify_line(&case.line),
            AdmissionClass::StructuralRejected,
            "{} Rust over-bound rejection-layer mismatch",
            case.case_id
        );
    }
    let text = format!(
        "{}\n",
        cases
            .iter()
            .map(|case| case.line.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    );
    let node = node_outputs_for_text(&text);
    assert_eq!(node.len(), cases.len());
    assert!(node.values().all(|admitted| !*admitted));
}

#[test]
fn generated_stage5b_campaign_is_exactly_replayable() {
    let first_valid = generated_valid_contexts(GENERATED_SEED, GENERATED_VALID_CASES);
    let second_valid = generated_valid_contexts(GENERATED_SEED, GENERATED_VALID_CASES);
    let first_invalid = generated_invalid_contexts(GENERATED_SEED, GENERATED_INVALID_CASES);
    let second_invalid = generated_invalid_contexts(GENERATED_SEED, GENERATED_INVALID_CASES);
    assert_eq!(
        first_valid
            .iter()
            .map(|case| (&case.case_id, &case.line, case.expected))
            .collect::<Vec<_>>(),
        second_valid
            .iter()
            .map(|case| (&case.case_id, &case.line, case.expected))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        first_invalid
            .iter()
            .map(|case| (&case.case_id, &case.line, case.expected))
            .collect::<Vec<_>>(),
        second_invalid
            .iter()
            .map(|case| (&case.case_id, &case.line, case.expected))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        first_valid
            .iter()
            .map(|case| case.case_id.as_str())
            .collect::<BTreeSet<_>>()
            .len(),
        GENERATED_VALID_CASES
    );
    assert_eq!(
        first_invalid
            .iter()
            .map(|case| case.case_id.as_str())
            .collect::<BTreeSet<_>>()
            .len(),
        GENERATED_INVALID_CASES
    );
}

mod serde_free_case_id {
    #[derive(Debug)]
    pub struct CaseId(pub String);

    pub fn extract(line: &str) -> Result<CaseId, String> {
        const PREFIX: &str = "{\"case_id\":\"";
        let rest = line
            .strip_prefix(PREFIX)
            .ok_or_else(|| "case_id must be the first Stage 5B fixture field".to_owned())?;
        let end = rest
            .find('"')
            .ok_or_else(|| "case_id string is unterminated".to_owned())?;
        Ok(CaseId(rest[..end].to_owned()))
    }
}
