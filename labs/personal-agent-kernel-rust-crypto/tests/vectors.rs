use axiom_personal_kernel_crypto_adapter_lab::{
    VerifyError, verify_and_build_mesh_proof_input, verify_axiom_ed25519_attestation,
};
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

                let proof = verify_and_build_mesh_proof_input(
                    row["canonical_body"].as_bytes(),
                    &row["digest_hex"],
                    &row["signature_b64url"],
                    &row["public_key_raw_hex"],
                )
                .unwrap_or_else(|error| panic!("{} should parse: {error}", row["case_id"]));
                assert_eq!(proof.grant_ref, "grant:crypto-vector-1");
                assert_eq!(proof.owner_subject_ref, "subject:owner-1");
                assert_eq!(proof.capability_ref, "capability:purchase");
                assert_eq!(proof.node_id, "node:purchase");
                assert_eq!(proof.revocation_epoch, 7);
                assert_eq!(proof.expires_at_unix_s, 1_789_733_300);
                assert_eq!(proof.max_delegation_hops, 1);
            }
            "deny" => {
                assert!(result.is_err(), "{} should fail", row["case_id"]);
                assert!(
                    verify_and_build_mesh_proof_input(
                        row["canonical_body"].as_bytes(),
                        &row["digest_hex"],
                        &row["signature_b64url"],
                        &row["public_key_raw_hex"],
                    )
                    .is_err(),
                    "{} typed bridge should fail",
                    row["case_id"]
                );
            }
            other => panic!("unknown expected result {other}"),
        }
    }
}

#[test]
fn valid_signature_over_noncanonical_json_is_rejected_by_typed_bridge() {
    let body = concat!(
        "{\"grant_ref\":\"grant:crypto-vector-1\",",
        "\"capability_ref\":\"capability:purchase\",",
        "\"expires_at_unix_s\":1789733300,",
        "\"max_delegation_hops\":1,",
        "\"node_id\":\"node:purchase\",",
        "\"owner_subject_ref\":\"subject:owner-1\",",
        "\"plan_digest\":\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",",
        "\"revocation_epoch\":7}"
    );

    let error = verify_and_build_mesh_proof_input(
        body.as_bytes(),
        "dc156dfc8def9600f83de1b4a0968e042c5d9555b31ba94c6767f4e85344a8ec",
        "5LbrblkK04lXSQRZGa-mGA3aTigl_dKHU3dBxVKhHv_W192zi0aMxrWDiRPLKsWc7jB6-A27r6hXpHXIoJLbAg",
        "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664",
    )
    .expect_err("noncanonical JSON must not cross the typed proof boundary");

    assert_eq!(error, VerifyError::NonCanonicalBody);
}
