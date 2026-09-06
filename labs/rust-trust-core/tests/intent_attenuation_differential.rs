use axiom_trust_core_lab::{
    IntentAttenuationChecks, parse_intent_attenuation_fixture, parse_intent_attenuation_vector_row,
    verify_intent_attenuation,
};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

const HEADER: &str = "case_id\tgrant_verified\tintent_bound\tgrant_actions\tgrant_purposes\tgrant_destinations\tgrant_resources\tintent_actions\tintent_purposes\tintent_destinations\tintent_resources";
const GENERATED_SEED: u32 = 0x5354_4135;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/intent-attenuation-v0.tsv")
}

fn invalid_fixture_path() -> PathBuf {
    manifest_dir().join("fixtures/intent-attenuation-v0-invalid.tsv")
}

fn oracle_path() -> PathBuf {
    manifest_dir().join("node/intent_attenuation_oracle.mjs")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OracleResult {
    valid: bool,
    actions: bool,
    purposes: bool,
    destinations: bool,
    resources: bool,
}

impl OracleResult {
    fn allow() -> Self {
        Self {
            valid: true,
            actions: true,
            purposes: true,
            destinations: true,
            resources: true,
        }
    }

    fn widening(dimension: usize) -> Self {
        Self {
            valid: false,
            actions: dimension != 0,
            purposes: dimension != 1,
            destinations: dimension != 2,
            resources: dimension != 3,
        }
    }
}

#[derive(Debug, Clone)]
struct GeneratedVector {
    case_id: String,
    row: String,
    expected: OracleResult,
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

    fn bit(&mut self) -> bool {
        self.next() & 1 == 1
    }
}

fn parse_bool(value: &str) -> Result<bool, String> {
    match value {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(format!("invalid oracle boolean: {value}")),
    }
}

fn parse_node_outputs(stdout: &str) -> Result<BTreeMap<String, OracleResult>, String> {
    let mut outputs = BTreeMap::new();
    for line in stdout.lines() {
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() != 6 {
            return Err(format!(
                "Node attenuation oracle output must contain 6 TSV columns: {line}"
            ));
        }
        let result = OracleResult {
            valid: parse_bool(columns[1])?,
            actions: parse_bool(columns[2])?,
            purposes: parse_bool(columns[3])?,
            destinations: parse_bool(columns[4])?,
            resources: parse_bool(columns[5])?,
        };
        if outputs.insert(columns[0].to_owned(), result).is_some() {
            return Err(format!(
                "duplicate Node attenuation oracle case_id: {}",
                columns[0]
            ));
        }
    }
    Ok(outputs)
}

fn node_outputs_for_fixture() -> BTreeMap<String, OracleResult> {
    let output = Command::new("node")
        .arg(oracle_path())
        .arg(fixture_path())
        .output()
        .expect("Node attenuation oracle process must start");
    assert!(
        output.status.success(),
        "Node attenuation oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("oracle output must be UTF-8");
    parse_node_outputs(stdout.trim_end()).expect("oracle output must be unique and well formed")
}

fn node_outputs_for_text(text: &str) -> BTreeMap<String, OracleResult> {
    let mut child = Command::new("node")
        .arg(oracle_path())
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Node attenuation oracle process must start");
    child
        .stdin
        .take()
        .expect("oracle stdin must be available")
        .write_all(text.as_bytes())
        .expect("generated fixture must be writable to oracle stdin");
    let output = child
        .wait_with_output()
        .expect("oracle process must finish");
    assert!(
        output.status.success(),
        "Node attenuation oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("oracle output must be UTF-8");
    parse_node_outputs(stdout.trim_end()).expect("oracle output must be unique and well formed")
}

fn decode_escaped_row(encoded: &str) -> String {
    encoded.replace("\\t", "\t").replace("\\n", "\n")
}

fn result_from_rust(checks: IntentAttenuationChecks, valid: bool) -> OracleResult {
    OracleResult {
        valid,
        actions: checks.actions,
        purposes: checks.purposes,
        destinations: checks.destinations,
        resources: checks.resources,
    }
}

fn grant_set(prefix: &str, rng: &mut XorShift32) -> Vec<String> {
    let mut values = Vec::new();
    for index in 0..6 {
        if index == 0 || rng.bit() {
            values.push(format!("{prefix}:{index:02}"));
        }
    }
    values
}

fn subset(grant: &[String], rng: &mut XorShift32) -> Vec<String> {
    grant
        .iter()
        .filter(|_| rng.bit())
        .cloned()
        .collect::<Vec<_>>()
}

fn nonempty_subset(grant: &[String], rng: &mut XorShift32) -> Vec<String> {
    let mut values = subset(grant, rng);
    if values.is_empty() {
        values.push(grant[0].clone());
    }
    values
}

fn render_set(values: &[String]) -> String {
    values.join(",")
}

fn render_row(case_id: &str, grants: &[Vec<String>; 4], intents: &[Vec<String>; 4]) -> String {
    [
        case_id.to_owned(),
        "true".to_owned(),
        "true".to_owned(),
        render_set(&grants[0]),
        render_set(&grants[1]),
        render_set(&grants[2]),
        render_set(&grants[3]),
        render_set(&intents[0]),
        render_set(&intents[1]),
        render_set(&intents[2]),
        render_set(&intents[3]),
    ]
    .join("\t")
}

fn generated_vectors() -> Vec<GeneratedVector> {
    let mut rng = XorShift32::new(GENERATED_SEED);
    let mut vectors = Vec::with_capacity(512);

    for index in 0..256 {
        let grants = [
            grant_set("action", &mut rng),
            grant_set("purpose", &mut rng),
            grant_set("destination", &mut rng),
            grant_set("resource", &mut rng),
        ];
        let intents = [
            subset(&grants[0], &mut rng),
            subset(&grants[1], &mut rng),
            subset(&grants[2], &mut rng),
            subset(&grants[3], &mut rng),
        ];
        let case_id = format!("generated_subset_{index:03}");
        vectors.push(GeneratedVector {
            row: render_row(&case_id, &grants, &intents),
            case_id,
            expected: OracleResult::allow(),
        });
    }

    for index in 0..128 {
        let grants = [
            grant_set("action", &mut rng),
            grant_set("purpose", &mut rng),
            grant_set("destination", &mut rng),
            grant_set("resource", &mut rng),
        ];
        let mut intents = [
            subset(&grants[0], &mut rng),
            subset(&grants[1], &mut rng),
            subset(&grants[2], &mut rng),
            subset(&grants[3], &mut rng),
        ];
        let dimension = index % 4;
        let widening = match dimension {
            0 => "action:z",
            1 => "purpose:z",
            2 => "destination:z",
            _ => "resource:z",
        };
        intents[dimension].push(widening.to_owned());
        let case_id = format!("generated_widen_{index:03}");
        vectors.push(GeneratedVector {
            row: render_row(&case_id, &grants, &intents),
            case_id,
            expected: OracleResult::widening(dimension),
        });
    }

    for index in 0..128 {
        let grants = [
            grant_set("action", &mut rng),
            grant_set("purpose", &mut rng),
            grant_set("destination", &mut rng),
            grant_set("resource", &mut rng),
        ];
        let dimension = index % 4;
        let mut intents = [
            subset(&grants[0], &mut rng),
            subset(&grants[1], &mut rng),
            subset(&grants[2], &mut rng),
            subset(&grants[3], &mut rng),
        ];
        intents[dimension] = nonempty_subset(&grants[dimension], &mut rng);
        intents[dimension].remove(0);
        let case_id = format!("generated_descendant_{index:03}");
        vectors.push(GeneratedVector {
            row: render_row(&case_id, &grants, &intents),
            case_id,
            expected: OracleResult::allow(),
        });
    }

    vectors
}

#[test]
fn rust_attenuation_matches_real_node_oracle_for_hand_curated_vectors() {
    let fixture = std::fs::read_to_string(fixture_path()).expect("fixture must be readable");
    let cases = parse_intent_attenuation_fixture(&fixture).expect("valid fixture must parse");
    let node = node_outputs_for_fixture();
    assert_eq!(cases.len(), 16);
    assert_eq!(node.len(), cases.len());

    for case in &cases {
        let rust = verify_intent_attenuation(case).expect("valid vector must evaluate");
        let actual = result_from_rust(rust.checks, rust.valid);
        let expected = node
            .get(case.case_id())
            .unwrap_or_else(|| panic!("Node oracle missing case {}", case.case_id()));
        assert_eq!(actual, *expected, "{} Node/Rust mismatch", case.case_id());
    }
}

#[test]
fn rust_attenuation_has_expected_subset_and_widening_semantics() {
    let fixture = std::fs::read_to_string(fixture_path()).expect("fixture must be readable");
    let cases = parse_intent_attenuation_fixture(&fixture).expect("valid fixture must parse");
    let results = cases
        .iter()
        .map(|case| {
            let result = verify_intent_attenuation(case).expect("case must evaluate");
            (
                case.case_id(),
                result_from_rust(result.checks, result.valid),
            )
        })
        .collect::<BTreeMap<_, _>>();

    for case_id in [
        "exact_empty",
        "exact_single",
        "exact_multi",
        "subset_actions",
        "subset_purposes",
        "subset_destinations",
        "subset_resources",
        "empty_intent_nonempty",
        "partial_multi",
    ] {
        assert_eq!(results[case_id], OracleResult::allow());
    }

    assert_eq!(results["widen_actions"], OracleResult::widening(0));
    assert_eq!(results["widen_purposes"], OracleResult::widening(1));
    assert_eq!(results["widen_destinations"], OracleResult::widening(2));
    assert_eq!(results["widen_resources"], OracleResult::widening(3));
    assert_eq!(
        results["disjoint_all"],
        OracleResult {
            valid: false,
            actions: false,
            purposes: false,
            destinations: false,
            resources: false,
        }
    );
}

#[test]
fn malformed_unverified_and_unbound_rows_fail_closed() {
    let fixture =
        std::fs::read_to_string(invalid_fixture_path()).expect("invalid fixture must be readable");
    let mut lines = fixture.lines();
    assert_eq!(lines.next(), Some("case_id\tencoded_row"));
    let rows = lines.collect::<Vec<_>>();
    assert_eq!(rows.len(), 12);

    for line in rows {
        let (case_id, encoded) = line
            .split_once('\t')
            .expect("invalid fixture row must have id and encoded row");
        let row = decode_escaped_row(encoded);
        match parse_intent_attenuation_vector_row(&row) {
            Ok(case) => assert!(
                verify_intent_attenuation(&case).is_err(),
                "{case_id} must fail closed during evaluation"
            ),
            Err(_) => {}
        }
    }
}

#[test]
fn generated_campaign_matches_real_node_oracle_and_expected_monotonicity() {
    let vectors = generated_vectors();
    assert_eq!(vectors.len(), 512);
    assert_eq!(
        vectors
            .iter()
            .filter(|item| item.case_id.starts_with("generated_subset_"))
            .count(),
        256
    );
    assert_eq!(
        vectors
            .iter()
            .filter(|item| item.case_id.starts_with("generated_widen_"))
            .count(),
        128
    );
    assert_eq!(
        vectors
            .iter()
            .filter(|item| item.case_id.starts_with("generated_descendant_"))
            .count(),
        128
    );

    let mut fixture = String::from(HEADER);
    fixture.push('\n');
    for vector in &vectors {
        fixture.push_str(&vector.row);
        fixture.push('\n');
    }

    let rust_cases = parse_intent_attenuation_fixture(&fixture)
        .expect("generated attenuation fixture must parse in Rust");
    let node = node_outputs_for_text(&fixture);
    assert_eq!(rust_cases.len(), vectors.len());
    assert_eq!(node.len(), vectors.len());

    let expected = vectors
        .iter()
        .map(|vector| (vector.case_id.as_str(), vector.expected))
        .collect::<BTreeMap<_, _>>();

    for case in &rust_cases {
        let rust = verify_intent_attenuation(case).expect("generated vector must evaluate");
        let actual = result_from_rust(rust.checks, rust.valid);
        let node_result = node
            .get(case.case_id())
            .unwrap_or_else(|| panic!("Node oracle missing generated case {}", case.case_id()));
        assert_eq!(
            actual,
            *node_result,
            "{} Node/Rust mismatch",
            case.case_id()
        );
        assert_eq!(
            actual,
            expected[case.case_id()],
            "{} generated expectation mismatch",
            case.case_id()
        );
        if case.case_id().starts_with("generated_descendant_") {
            assert!(
                actual.valid,
                "removing admitted intent scope must preserve attenuation"
            );
        }
    }
}

#[test]
fn node_output_parser_rejects_duplicate_case_ids() {
    let duplicate = "same\ttrue\ttrue\ttrue\ttrue\ttrue\nsame\tfalse\tfalse\ttrue\ttrue\ttrue\n";
    let error = parse_node_outputs(duplicate).expect_err("duplicate output ids must fail closed");
    assert!(error.contains("duplicate Node attenuation oracle case_id: same"));
}
