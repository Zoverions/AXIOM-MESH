#![forbid(unsafe_code)]

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use axiom_personal_agent_kernel_rust_lab::MeshProofInput;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifyError {
    InvalidDigest,
    InvalidPublicKey,
    InvalidSignatureEncoding,
    SignatureMismatch,
    NonCanonicalBody,
    InvalidProofBody,
}

impl Display for VerifyError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::InvalidDigest => "canonical body digest mismatch",
            Self::InvalidPublicKey => "invalid Ed25519 public key",
            Self::InvalidSignatureEncoding => "invalid Ed25519 signature encoding",
            Self::SignatureMismatch => "Ed25519 signature verification failed",
            Self::NonCanonicalBody => "proof body is not canonical AXIOM JSON",
            Self::InvalidProofBody => "proof body does not match the typed Mesh proof schema",
        };
        f.write_str(message)
    }
}

impl Error for VerifyError {}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct SignedMeshProofBody {
    capability_ref: String,
    expires_at_unix_s: u64,
    grant_ref: String,
    max_delegation_hops: u8,
    node_id: String,
    owner_subject_ref: String,
    plan_digest: String,
    revocation_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedCryptoEvidence {
    pub digest_hex: String,
    pub public_key_raw_hex: String,
}

impl VerifiedCryptoEvidence {
    pub fn grants_authority(&self) -> bool {
        false
    }
}

pub fn verify_axiom_ed25519_attestation(
    canonical_body: &[u8],
    expected_digest_hex: &str,
    signature_b64url: &str,
    public_key_raw_hex: &str,
) -> Result<VerifiedCryptoEvidence, VerifyError> {
    let actual_digest = Sha256::digest(canonical_body);
    let actual_digest_hex = encode_hex(actual_digest.as_slice());
    if actual_digest_hex != expected_digest_hex {
        return Err(VerifyError::InvalidDigest);
    }

    let public_key_bytes =
        decode_fixed_hex::<32>(public_key_raw_hex).ok_or(VerifyError::InvalidPublicKey)?;
    let verifying_key =
        VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| VerifyError::InvalidPublicKey)?;

    let signature_bytes = URL_SAFE_NO_PAD
        .decode(signature_b64url.as_bytes())
        .map_err(|_| VerifyError::InvalidSignatureEncoding)?;
    let signature = Signature::try_from(signature_bytes.as_slice())
        .map_err(|_| VerifyError::InvalidSignatureEncoding)?;

    verifying_key
        .verify_strict(canonical_body, &signature)
        .map_err(|_| VerifyError::SignatureMismatch)?;

    Ok(VerifiedCryptoEvidence {
        digest_hex: actual_digest_hex,
        public_key_raw_hex: public_key_raw_hex.to_string(),
    })
}

pub fn verify_and_build_mesh_proof_input(
    canonical_body: &[u8],
    expected_digest_hex: &str,
    signature_b64url: &str,
    public_key_raw_hex: &str,
) -> Result<MeshProofInput, VerifyError> {
    verify_axiom_ed25519_attestation(
        canonical_body,
        expected_digest_hex,
        signature_b64url,
        public_key_raw_hex,
    )?;

    let value: serde_json::Value =
        serde_json::from_slice(canonical_body).map_err(|_| VerifyError::InvalidProofBody)?;
    let canonical =
        serde_json::to_vec(&value).map_err(|_| VerifyError::InvalidProofBody)?;
    if canonical != canonical_body {
        return Err(VerifyError::NonCanonicalBody);
    }

    let proof: SignedMeshProofBody =
        serde_json::from_value(value).map_err(|_| VerifyError::InvalidProofBody)?;

    Ok(MeshProofInput {
        grant_ref: proof.grant_ref,
        owner_subject_ref: proof.owner_subject_ref,
        plan_digest: proof.plan_digest,
        node_id: proof.node_id,
        capability_ref: proof.capability_ref,
        revocation_epoch: proof.revocation_epoch,
        expires_at_unix_s: proof.expires_at_unix_s,
        max_delegation_hops: proof.max_delegation_hops,
    })
}

fn decode_fixed_hex<const N: usize>(input: &str) -> Option<[u8; N]> {
    if input.len() != N * 2 {
        return None;
    }
    let bytes = input.as_bytes();
    let mut output = [0_u8; N];
    for index in 0..N {
        let high = decode_nibble(bytes[index * 2])?;
        let low = decode_nibble(bytes[index * 2 + 1])?;
        output[index] = (high << 4) | low;
    }
    Some(output)
}

fn decode_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn encode_hex(input: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(input.len() * 2);
    for byte in input {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
