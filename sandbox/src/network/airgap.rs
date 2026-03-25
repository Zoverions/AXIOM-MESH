use std::fmt;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::process::Command;
use std::thread;
use serde_json::Value;

const AIRGAP_CHAIN: &str = "AXIOM_AIRGAP";

#[derive(Debug)]
pub enum AirgapError {
    InvalidPid(u32),
    CommandFailure(String),
    Io(std::io::Error),
}

impl fmt::Display for AirgapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AirgapError::InvalidPid(pid) => write!(f, "invalid pid for netns operations: {pid}"),
            AirgapError::CommandFailure(msg) => write!(f, "airgap command failed: {msg}"),
            AirgapError::Io(err) => write!(f, "io error: {err}"),
        }
    }
}

impl std::error::Error for AirgapError {}

impl From<std::io::Error> for AirgapError {
    fn from(value: std::io::Error) -> Self {
        AirgapError::Io(value)
    }
}

/// Drop all outbound TCP/UDP from the target PID network namespace except loopback.
pub fn lockdown_network(pid: u32) -> Result<(), AirgapError> {
    ensure_pid(pid)?;

    let mut commands = vec![
        vec!["iptables", "-N", AIRGAP_CHAIN],
        vec!["iptables", "-F", AIRGAP_CHAIN],
        vec!["iptables", "-A", AIRGAP_CHAIN, "-o", "lo", "-j", "ACCEPT"],
        vec!["iptables", "-A", AIRGAP_CHAIN, "-d", "127.0.0.1/32", "-j", "ACCEPT"],
        vec!["iptables", "-A", AIRGAP_CHAIN, "-p", "tcp", "-j", "DROP"],
        vec!["iptables", "-A", AIRGAP_CHAIN, "-p", "udp", "-j", "DROP"],
    ];

    for args in commands.drain(..) {
        let _ = run_in_netns(pid, &args)?;
    }

    let check = run_in_netns(pid, &["iptables", "-C", "OUTPUT", "-j", AIRGAP_CHAIN])?;
    if !check.success {
        let insert = run_in_netns(pid, &["iptables", "-I", "OUTPUT", "1", "-j", AIRGAP_CHAIN])?;
        if !insert.success {
            return Err(AirgapError::CommandFailure(insert.stderr));
        }
    }

    Ok(())
}

/// Restore outbound network routing for the target PID namespace.
pub fn restore_network(pid: u32) -> Result<(), AirgapError> {
    ensure_pid(pid)?;

    // Best effort cleanup so a partially configured chain does not block restoration.
    let _ = run_in_netns(pid, &["iptables", "-D", "OUTPUT", "-j", AIRGAP_CHAIN]);
    let _ = run_in_netns(pid, &["iptables", "-F", AIRGAP_CHAIN]);
    let _ = run_in_netns(pid, &["iptables", "-X", AIRGAP_CHAIN]);
    Ok(())
}

/// UDS protocol: one command per line (`lockdown <pid>` or `restore <pid>`).
/// Designed for trusted localhost control from the Python Hypervisor.
pub fn start_airgap_uds_listener(socket_path: &str) -> Result<(), AirgapError> {
    if std::path::Path::new(socket_path).exists() {
        std::fs::remove_file(socket_path)?;
    }

    let listener = UnixListener::bind(socket_path)?;

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                thread::spawn(move || {
                    if let Err(err) = handle_client(stream) {
                        eprintln!("airgap uds client error: {err}");
                    }
                });
            }
            Err(err) => {
                eprintln!("airgap uds accept error: {err}");
            }
        }
    }

    Ok(())
}

pub fn apply_cgroup_limits(pid: u32, config: &Value) -> Result<(), AirgapError> {
    ensure_pid(pid)?;

    // Create cgroup v2 directory
    let cgroup_dir = format!("/sys/fs/cgroup/sandbox-{}", pid);
    std::fs::create_dir_all(&cgroup_dir)?;

    // Move pid to cgroup
    std::fs::write(format!("{}/cgroup.procs", cgroup_dir), pid.to_string())
        .map_err(|e| AirgapError::CommandFailure(format!("Failed to move pid to cgroup: {}", e)))?;

    // Apply limits from config
    if let Some(cpu_quota) = config.get("cpuQuota").and_then(|v| v.as_str()) {
        let max_val = cpu_quota.replace("/", " ");
        let _ = std::fs::write(format!("{}/cpu.max", cgroup_dir), max_val);
    }

    if let Some(memory_max) = config.get("memoryMax").and_then(|v| v.as_str()) {
        let _ = std::fs::write(format!("{}/memory.max", cgroup_dir), memory_max);
    }

    if let Some(pids_max) = config.get("pidsMax") {
        let pids_str = if pids_max.is_number() { pids_max.to_string() } else { pids_max.as_str().unwrap_or("max").to_string() };
        let _ = std::fs::write(format!("{}/pids.max", cgroup_dir), pids_str);
    }

    Ok(())
}

/// Kill the target PID using SIGKILL (kill -9)
pub fn kill_process(pid: u32) -> Result<(), AirgapError> {
    ensure_pid(pid)?;

    let mut cmd = Command::new("kill");
    cmd.arg("-9").arg(pid.to_string());

    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AirgapError::CommandFailure(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

fn handle_client(mut stream: UnixStream) -> Result<(), AirgapError> {
    let reader = BufReader::new(stream.try_clone()?);
    for line in reader.lines() {
        let line = line?;

        if line.starts_with('{') {
            // JSON command
            if let Ok(payload) = serde_json::from_str::<Value>(&line) {
                let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or_default();
                let pid = payload.get("pid").and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or(0);

                                    let result = match action {
                    "isolate" => lockdown_network(pid),
                    "restore" => restore_network(pid),
                    "kill" => kill_process(pid),
                    "cgroups" => {
                        if let Some(config) = payload.get("config") {
                            apply_cgroup_limits(pid, config)
                        } else {
                            Err(AirgapError::CommandFailure("missing config for cgroups".to_string()))
                        }
                    },
                    "seccomp" => Ok(()), // Handled by standard docker runtime opts
                    _ => Err(AirgapError::CommandFailure(format!("unknown action: {}", action))),
                };

                match result {
                    Ok(()) => stream.write_all(b"ok\n")?,
                    Err(err) => stream.write_all(format!("error {}\n", err).as_bytes())?,
                }
            } else {
                stream.write_all(b"error invalid json\n")?;
            }
        } else {
            // Space separated protocol fallback
            let mut parts = line.split_whitespace();
            let cmd = parts.next().unwrap_or_default();
            let pid = parts
                .next()
                .and_then(|raw| raw.parse::<u32>().ok())
                .ok_or_else(|| AirgapError::CommandFailure("missing pid".to_string()))?;

            let result = match cmd {
                "lockdown" => lockdown_network(pid),
                "restore" => restore_network(pid),
                _ => Err(AirgapError::CommandFailure(format!("unknown command: {cmd}"))),
            };

            match result {
                Ok(()) => stream.write_all(b"ok\n")?,
                Err(err) => stream.write_all(format!("error {err}\n").as_bytes())?,
            }
        }
    }

    Ok(())
}

fn ensure_pid(pid: u32) -> Result<(), AirgapError> {
    if pid == 0 {
        return Err(AirgapError::InvalidPid(pid));
    }

    let proc_path = format!("/proc/{pid}");
    if !std::path::Path::new(&proc_path).exists() {
        return Err(AirgapError::InvalidPid(pid));
    }

    Ok(())
}

struct CommandResult {
    success: bool,
    stderr: String,
}

fn run_in_netns(pid: u32, args: &[&str]) -> Result<CommandResult, AirgapError> {
    let mut cmd = Command::new("nsenter");
    cmd.arg("-t").arg(pid.to_string()).arg("-n");
    cmd.args(args);

    let output = cmd.output()?;
    Ok(CommandResult {
        success: output.status.success(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}
