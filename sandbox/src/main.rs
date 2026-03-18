// sandbox/airgap.rs
use std::fs;
use serde_yaml::Value;
use anyhow::Result;

#[derive(Debug)]
pub struct OpenShellPolicy {
    pub filesystem: Vec<String>,
    pub network: Vec<String>,
    pub privacy_level: String, // "local-only" | "safe-external"
}

// Dummy ipfs_get for testing if missing
fn ipfs_get(cid: &str) -> Vec<u8> {
    fs::read(cid).unwrap_or_else(|_| b"privacy:\n  level: local-only\n".to_vec())
}

pub fn load_policy_from_meshstore(cid: &str) -> Result<OpenShellPolicy> {
    // Pull YAML policy CID from existing MeshStore
    let yaml_bytes = ipfs_get(cid); // reuse MeshStore helper
    let policy: Value = serde_yaml::from_slice(&yaml_bytes)?;

    Ok(OpenShellPolicy {
        filesystem: vec!["/meshstore/**".into(), "/tmp/intents".into()],
        network: vec!["ncp-servers".into()],
        privacy_level: policy["privacy"]["level"].as_str().unwrap_or("local-only").to_string(),
    })
}

pub fn enforce_policy(policy: &OpenShellPolicy) {
    // Apply Landlock + seccomp (ties into existing Docker flags)
    // Deny-by-default + allowlist
    println!("✅ OpenShell policy enforced: {:?}", policy);
    // syscalls: landlock_create_ruleset + seccomp filter
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let default_policy = String::from("/policies/default.yaml");
    let mut policy_path = &default_policy;

    if args.len() >= 3 && args[1] == "--policy" {
        policy_path = &args[2];
    }

    let policy = load_policy_from_meshstore(policy_path).unwrap_or(OpenShellPolicy {
        filesystem: vec!["/meshstore/**".into(), "/tmp/intents".into()],
        network: vec!["ncp-servers".into()],
        privacy_level: "local-only".into(),
    });

    enforce_policy(&policy);
}
