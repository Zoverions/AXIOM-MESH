use axiom_personal_kernel_crypto_adapter_lab::verify_axiom_ed25519_attestation;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

fn parse_tsv() -> Vec<BTreeMap<String, String>> {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/mesh-proof-signature-v0.tsv");
    let text = fs::read_to_string(path).expect("read crypto fixture");
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

#[test]
fn rust_strict_ed25519_verifier_matches_fixed_axiom_vectors() {
    for row in parse_tsv() {
        let result = verify_axiom_ed25519_attestation(
            row["canonical_body"].as_bytes(),
            &row["digest_hex"],
            &row["signature_b64url"],
            &row["public_key_raw_hex"],
        );

        match row["expected"].as_str() {
            "allow" => {
                let verified = result
                    .unwrap_or_else(|error| panic!("{} should verify: {error}", row["case_id"]));
                assert_eq!(verified.digest_hex, row["digest_hex"]);
                assert_eq!(verified.public_key_raw_hex, row["public_key_raw_hex"]);
                assert!(!verified.grants_authority());
            }
            "deny" => {
                assert!(result.is_err(), "{} should fail", row["case_id"]);
            }
            other => panic!("unknown expected result {other}"),
        }
    }
}
